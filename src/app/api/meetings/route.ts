import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendMeetingAcceptedEmail,
  sendMeetingCancelledEmail,
  sendMeetingRequestEmail,
  sendRawHtmlEmail,
} from "@/lib/email";
import { validateMeetingsAccess } from "@/middleware/subscription-check";
import { evaluateCancellationPolicy } from "@/lib/meetings/validation";
import { expireStalePendingMeetingRequests } from "@/lib/meetings/pending-expiration";
import {
  getMinimumRequestableMeetingStartDate,
  MEETING_REQUEST_LEAD_TIME_HOURS,
} from "@/lib/meetings/request-availability";
import {
  countStandardPrivateMeetingsThisMonth,
  evaluateMeetingRequestRules,
  normalizeMeetingType,
} from "@/lib/subscription/meeting-rules";
import { validateMeetingBookingConflicts } from "@/lib/calendar/booking-manager";
import { normalizeSlotTime } from "@/lib/calendar/slot-allocation";
import {
  formatInTimeZone,
  getSafeTimeZone,
  zonedDateTimeToUtc,
} from "@/lib/timezones";
import {
  deriveWorkflowState,
  requireMeetingStateTransition,
  resolveStateForAcceptance,
} from "@/lib/meetings/state-machine";
import {
  consumeCredits,
  getAcceptRequestCreditCost,
  getAvailableCredits,
  getSendRequestCreditCost,
  refundConsumedCredits,
} from "@/lib/credits/actions";
import { getMonthlyCreditsForTier, normalizeTier } from "@/lib/credits/config";
import { evaluateGenderEligibility } from "@/lib/matching/gender-rules";
import { CIO_EVENTS, trackCustomerEventSafely } from "@/lib/customerio";
import { sendPushNotificationIfAllowed } from "@/lib/onesignal";
import { adminAbsoluteUrl } from "@/lib/admin/path";
import {
  canAcceptStarterTrialMeeting,
  canUseStarterTrialMeetingRequest,
  consumeStarterTrialMeeting,
  getStarterTrialState,
  lockConsumedStarterTrialProfile,
  restoreStarterTrialMeeting,
  STARTER_TRIAL_ACTIVE_SLOT_MESSAGE,
  STARTER_TRIAL_EXHAUSTED_MESSAGE,
} from "@/lib/starter-trial";

// Initialize Supabase client with service role for API routes
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ParticipantMeetingRow = {
  id: string;
  status: string;
  type: string;
  scheduled_at: string;
  workflow_state?: string | null;
  host_id?: string;
  location_pref?: string | null;
  fee_cents?: number | null;
  charge_status?: string | null;
  cancellation_fee_cents?: number | null;
  canceled_by?: string | null;
  completed_at?: string | null;
  created_at?: string;
  [key: string]: unknown;
};

type ParticipantRow = {
  meeting_id: string;
  user_id: string;
  role: string;
  response: string | null;
  responded_at: string | null;
  meetings: ParticipantMeetingRow | null;
};

type ParticipantAccountRow = {
  id: string;
  email: string;
  display_name: string | null;
  tier?: string | null;
};

type ParticipantProfileRow = {
  user_id: string;
  first_name: string | null;
  profile_photo_url: string | null;
};

type NewParticipant = {
  meeting_id: string;
  user_id: string;
  role: "host" | "guest";
  response: "requested" | "accepted";
};

type TierPermissionConfig = {
  tier: string;
  can_one_on_one_to_basic: boolean;
  can_one_on_one_to_standard: boolean;
  can_one_on_one_to_premium: boolean;
  can_one_on_one_to_vip: boolean;
  extra_charge_one_on_one_to_premium: boolean;
  extra_charge_one_on_one_to_vip: boolean;
};

type AccountAvailability = {
  id: string;
  tier: string;
  account_status?: string | null;
  profile_visible?: boolean | null;
  calendar_enabled?: boolean | null;
  profile_status?: string | null;
};

const TARGET_UNAVAILABLE_MESSAGE =
  "This user is not accepting new bookings right now. Please check back later or choose another available match. Thank you.";

function getMeetingRequestErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Internal server error";
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes("json object requested") ||
    normalized.includes("multiple (or no) rows returned")
  ) {
    return "Unable to resolve one of the required account records for this meeting request. Please refresh and try again.";
  }

  if (normalized.includes("duplicate key")) {
    return "This meeting request already exists or was just created. Please refresh your appointments.";
  }

  if (normalized.includes("credit")) {
    return "Unable to process meeting credits right now. Please refresh and try again.";
  }

  return rawMessage === "Internal server error"
    ? "Failed to create meeting request. Please try again."
    : rawMessage;
}

async function insertNotification(
  userId: string,
  payload: {
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }
) {
  const preferredInsert = await supabase.from("notifications").insert({
    user_id: userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    data: payload.data || {},
  });

  if (!preferredInsert.error) {
    return;
  }

  await supabase.from("notifications").insert({
    user_id: userId,
    notification_type: payload.type,
    site_enabled: true,
    push_enabled: true,
    email_enabled: true,
  });
}

async function restoreStarterTrialForOtherParticipants(
  meetingId: string,
  canceledByUserId: string
) {
  const { data: participants, error } = await supabase
    .from("meeting_participants")
    .select("user_id")
    .eq("meeting_id", meetingId)
    .neq("user_id", canceledByUserId);

  if (error) {
    throw error;
  }

  const restoredUserIds = await Promise.all(
    (participants || []).map(async (participant) => {
      try {
        const result = await restoreStarterTrialMeeting(
          supabase,
          String(participant.user_id),
          meetingId
        );
        return result.restored ? String(participant.user_id) : null;
      } catch (starterTrialError) {
        console.error("Error restoring starter trial after other-user cancellation:", {
          meetingId,
          userId: participant.user_id,
          starterTrialError,
        });
        return null;
      }
    })
  );

  return restoredUserIds.filter((userId): userId is string => Boolean(userId));
}

async function sendMeetingCancellationEmails(params: {
  meetingId: string;
  scheduledAt: string;
  canceledByUserId: string;
  canceledByName: string;
  refundIssued: boolean;
  chargeApplied?: boolean;
  freePlanRestoredUserIds?: string[];
}) {
  const { data: participants } = await supabase
    .from("meeting_participants")
    .select("user_id, role")
    .eq("meeting_id", params.meetingId);

  const participantIds = (participants || []).map((participant) => participant.user_id);
  if (participantIds.length === 0) return;

  const [{ data: accounts }, { data: profiles }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, email, display_name")
      .in("id", participantIds),
    supabase
      .from("user_profiles")
      .select("user_id, first_name")
      .in("user_id", participantIds),
  ]);

  const meetingDate = new Date(params.scheduledAt).toLocaleDateString();

  await Promise.all(
    (participants || []).map(async (participant) => {
      const account = accounts?.find((entry) => entry.id === participant.user_id);
      if (!account?.email) return;

      const profile = profiles?.find((entry) => entry.user_id === participant.user_id);
      const recipientName =
        profile?.first_name ||
        account.display_name ||
        account.email.split("@")[0] ||
        "User";

      await sendMeetingCancelledEmail(
        account.email,
        {
          recipientName,
          meetingDate,
          cancelledBy:
            participant.user_id === params.canceledByUserId ? "you" : params.canceledByName,
          refundIssued: params.refundIssued && participant.role === "guest",
          freePlanRestored: Boolean(
            params.freePlanRestoredUserIds?.includes(participant.user_id)
          ),
          chargeApplied:
            Boolean(params.chargeApplied) && participant.user_id === params.canceledByUserId,
        },
        participant.user_id
      );
    })
  );
}

async function sendMeetingAcceptedParticipantEmails(params: {
  meetingId: string;
  scheduledAt: string;
  meetingTimeZone?: string | null;
}) {
  const { data: participants } = await supabase
    .from("meeting_participants")
    .select("user_id, role")
    .eq("meeting_id", params.meetingId);

  const participantIds = (participants || []).map((participant) => participant.user_id);
  if (participantIds.length === 0) return;

  const [{ data: accounts }, { data: profiles }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, email, display_name")
      .in("id", participantIds),
    supabase
      .from("user_profiles")
      .select("user_id, first_name")
      .in("user_id", participantIds),
  ]);

  const meetingDate = new Date(params.scheduledAt).toLocaleDateString();
  const meetingTime = new Date(params.scheduledAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  await Promise.all(
    (participants || []).map(async (participant) => {
      const account = accounts?.find((entry) => entry.id === participant.user_id);
      if (!account?.email) return;

      const profile = profiles?.find((entry) => entry.user_id === participant.user_id);
      const recipientName =
        profile?.first_name ||
        account.display_name ||
        account.email.split("@")[0] ||
        "User";

      const otherParticipant = (participants || []).find(
        (entry) => entry.user_id !== participant.user_id
      );
      const otherAccount = accounts?.find((entry) => entry.id === otherParticipant?.user_id);
      const otherProfile = profiles?.find(
        (entry) => entry.user_id === otherParticipant?.user_id
      );
      const partnerName =
        otherProfile?.first_name ||
        otherAccount?.display_name ||
        otherAccount?.email?.split("@")[0] ||
        "the other participant";

      await insertNotification(participant.user_id, {
        type: "meeting_accepted",
        title: "Meeting accepted",
        message:
          participant.role === "guest"
            ? `${partnerName} accepted your meeting request. MatchIndeed admin will review it next.`
            : `You and ${partnerName} have both accepted this meeting. MatchIndeed admin will review it next.`,
        data: {
          meeting_id: params.meetingId,
          scheduled_at: params.scheduledAt,
        },
      });

      await sendPushNotificationIfAllowed({
        userId: participant.user_id,
        type: "meeting_accepted",
        title: "Video meeting accepted",
        message:
          participant.role === "guest"
            ? `${partnerName} accepted your request. MatchIndeed will review it next.`
            : `You and ${partnerName} are all set. MatchIndeed will review the booking next.`,
        url: "/dashboard/meetings?tab=pending",
        data: {
          meeting_id: params.meetingId,
          scheduled_at: params.scheduledAt,
        },
      });

      await sendMeetingAcceptedEmail(
        account.email,
        {
          recipientName,
          partnerName,
          meetingDate,
          meetingTime,
          meetingTimeZone: params.meetingTimeZone || undefined,
          awaitingAdminApproval: true,
        },
        participant.user_id
      );
    })
  );
}

/**
 * Helper to get authenticated user from request
 */
async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return null;
  }

  return user;
}

async function getAccountAvailability(
  userId: string
): Promise<{ data: AccountAvailability | null; error: string | null }> {
  const preferred = await supabase
    .from("accounts")
    .select("id, tier, account_status, profile_visible, calendar_enabled, profile_status")
    .eq("id", userId)
    .maybeSingle();

  if (!preferred.error && preferred.data) {
    return {
      data: preferred.data as AccountAvailability,
      error: null,
    };
  }

  if (preferred.error && preferred.error.code !== "42703") {
    return { data: null, error: preferred.error.message };
  }

  const fallback = await supabase
    .from("accounts")
    .select("id, tier")
    .eq("id", userId)
    .maybeSingle();

  if (fallback.error || !fallback.data) {
    return {
      data: null,
      error: fallback.error?.message || "Account not found",
    };
  }

  return {
    data: {
      ...(fallback.data as { id: string; tier: string }),
      account_status: "active",
      profile_visible: true,
      calendar_enabled: true,
      profile_status: "online",
    },
    error: null,
  };
}

async function getUserGender(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_profiles")
    .select("gender")
    .eq("user_id", userId)
    .maybeSingle();

  return typeof data?.gender === "string" ? data.gender : null;
}

type ActiveMembershipRow = {
  tier: string | null;
  status: string | null;
  expires_at: string | null;
};

async function getActiveMembershipTier(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("memberships")
    .select("tier, status, expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const membership = (data as ActiveMembershipRow | null) || null;
  if (!membership?.tier) return null;
  if (membership.expires_at && new Date(membership.expires_at) <= new Date()) {
    return null;
  }

  return membership.tier;
}

function isProfileUnavailableForMeetings(account: AccountAvailability) {
  const accountStatus = String(account.account_status || "active").toLowerCase();
  if (accountStatus !== "active") {
    return true;
  }

  const status = String(account.profile_status || "").toLowerCase();
  if (status === "offline_matched") {
    return true;
  }

  if (account.profile_visible === false) {
    return true;
  }

  if (account.calendar_enabled === false) {
    return true;
  }

  return false;
}

/**
 * GET /api/meetings
 * 
 * Fetch meetings for the current user
 * Query params:
 * - status: Filter by status (pending, confirmed, canceled, completed)
 * - type: Filter by type (group, one_on_one)
 * - upcoming: If "true", only return future meetings
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await expireStalePendingMeetingRequests(supabase);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const upcoming = searchParams.get("upcoming") === "true";

    // Get meetings where user is host
    let hostQuery = supabase
      .from("meetings")
      .select(`
        *,
        meeting_participants (
          user_id,
          role,
          response,
          responded_at
        )
      `)
      .eq("host_id", user.id);

    if (status) {
      hostQuery = hostQuery.eq("status", status);
    }
    if (type) {
      hostQuery = hostQuery.eq("type", type);
    }
    if (upcoming) {
      hostQuery = hostQuery.gte("scheduled_at", new Date().toISOString());
    }

    const { data: hostMeetings, error: hostError } = await hostQuery.order("scheduled_at", { ascending: true });

    if (hostError) {
      console.error("Error fetching host meetings:", hostError);
      return NextResponse.json({ error: "Failed to fetch meetings" }, { status: 500 });
    }

    // Get meetings where user is participant (not host)
    const { data: participantData, error: participantError } = await supabase
      .from("meeting_participants")
      .select(`
        meeting_id,
        role,
        response,
        responded_at,
        meetings (*)
      `)
      .eq("user_id", user.id)
      .neq("role", "host");

    if (participantError) {
      console.error("Error fetching participant meetings:", participantError);
    }

    // Combine and deduplicate
    const meetingMap = new Map();
    
    hostMeetings?.forEach((m) => {
      meetingMap.set(m.id, {
        ...m,
        participants: m.meeting_participants,
        user_role: "host",
      });
    });

    (participantData as ParticipantRow[] | null)?.forEach((p) => {
      if (p.meetings && !meetingMap.has(p.meetings.id)) {
        // Apply filters to participant meetings too
        if (status && p.meetings.status !== status) return;
        if (type && p.meetings.type !== type) return;
        if (upcoming && new Date(p.meetings.scheduled_at) < new Date()) return;

        meetingMap.set(p.meetings.id, {
          ...p.meetings,
          participants: [{ user_id: user.id, role: p.role, response: p.response, responded_at: p.responded_at }],
          user_role: p.role,
          user_response: p.response,
        });
      }
    });

    const meetings = Array.from(meetingMap.values()).sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );

    const meetingIds = meetings.map((meeting) => meeting.id);
    if (meetingIds.length > 0) {
      const { data: participantRows, error: participantRowsError } = await supabase
        .from("meeting_participants")
        .select("meeting_id, user_id, role, response, responded_at")
        .in("meeting_id", meetingIds);

      if (participantRowsError) {
        console.error("Error fetching enriched meeting participants:", participantRowsError);
        return NextResponse.json({ error: "Failed to fetch meetings" }, { status: 500 });
      }

      const typedParticipantRows = (participantRows || []) as ParticipantRow[];
      const participantIds = Array.from(
        new Set(typedParticipantRows.map((row) => String(row.user_id)))
      );

      let accountMap = new Map<string, ParticipantAccountRow>();
      let profileMap = new Map<string, ParticipantProfileRow>();

      if (participantIds.length > 0) {
        const [{ data: accounts }, { data: profiles }] = await Promise.all([
          supabase
            .from("accounts")
            .select("id, email, display_name, tier")
            .in("id", participantIds),
          supabase
            .from("user_profiles")
            .select("user_id, first_name, profile_photo_url")
            .in("user_id", participantIds),
        ]);

        accountMap = new Map(
          ((accounts || []) as ParticipantAccountRow[]).map((account) => [account.id, account])
        );
        profileMap = new Map(
          ((profiles || []) as ParticipantProfileRow[]).map((profile) => [
            profile.user_id,
            profile,
          ])
        );
      }

      const participantsByMeetingId = typedParticipantRows.reduce<
        Record<
          string,
          Array<{
            user_id: string;
            role: string;
            response: string | null;
            responded_at: string | null;
            user: {
              id: string;
              email: string;
              display_name: string | null;
              tier?: string | null;
            } | null;
            user_profile: {
              first_name: string | null;
              profile_photo_url: string | null;
            } | null;
          }>
        >
      >((acc, participant) => {
        const account = accountMap.get(participant.user_id);
        const profile = profileMap.get(participant.user_id);

        if (!acc[participant.meeting_id]) {
          acc[participant.meeting_id] = [];
        }

        acc[participant.meeting_id].push({
          user_id: participant.user_id,
          role: participant.role,
          response: participant.response,
          responded_at: participant.responded_at,
          user: account
            ? {
                id: account.id,
                email: account.email,
                display_name: account.display_name,
                tier: account.tier || null,
              }
            : null,
          user_profile: profile
            ? {
                first_name: profile.first_name,
                profile_photo_url: profile.profile_photo_url,
              }
            : null,
        });

        return acc;
      }, {});

      for (const meeting of meetings) {
        meeting.participants = participantsByMeetingId[meeting.id] || [];
      }
    }

    return NextResponse.json({ meetings });
  } catch (error) {
    console.error("Error in GET /api/meetings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/meetings
 * 
 * Create a new meeting request
 * Body:
 * - target_user_id: User ID to request meeting with
 * - slot_date: Date of the meeting (YYYY-MM-DD)
 * - slot_time: Time of the meeting (HH:MM)
 * - type: "one_on_one" | "group" (default: "one_on_one")
 * - location_pref: Optional location preference
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await expireStalePendingMeetingRequests(supabase);

    const accessValidation = await validateMeetingsAccess(user.id);
    const starterTrialState = accessValidation.allowed
      ? null
      : await getStarterTrialState(supabase, user.id, {
          verifyActiveSlot: true,
        });
    const canUseStarterTrialRequest =
      !accessValidation.allowed &&
      canUseStarterTrialMeetingRequest(starterTrialState);

    if (!accessValidation.allowed) {
      if (starterTrialState?.has_active_slot) {
        return NextResponse.json(
          {
            error: "starter_trial_slot_in_use",
            message: STARTER_TRIAL_ACTIVE_SLOT_MESSAGE,
            starter_trial: starterTrialState,
          },
          { status: 403 }
        );
      }

      if (starterTrialState?.upgrade_required || starterTrialState?.consumed) {
        return NextResponse.json(
          {
            error: "starter_trial_exhausted",
            message: STARTER_TRIAL_EXHAUSTED_MESSAGE,
            requires_upgrade: true,
            starter_trial: starterTrialState,
          },
          { status: 403 }
        );
      }

      if (!canUseStarterTrialRequest) {
        return NextResponse.json(
          {
            error: "access_denied",
            message: accessValidation.message,
            starter_trial: starterTrialState,
          },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const {
      target_user_id,
      slot_id,
      slot_date,
      slot_time,
      type = "one_on_one",
      location_pref,
      participant_ids,
    } = body;
    const normalizedMeetingType = normalizeMeetingType(type);

    // Validate required fields
    if (!target_user_id || (!slot_id && (!slot_date || !slot_time))) {
      return NextResponse.json(
        { error: "target_user_id and a valid slot selection are required" },
        { status: 400 }
      );
    }
    if (!["group", "one_on_one"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Must be group or one_on_one" },
        { status: 400 }
      );
    }

    // Cannot book meeting with yourself
    if (target_user_id === user.id) {
      return NextResponse.json(
        { error: "Cannot request a meeting with yourself" },
        { status: 400 }
      );
    }

    if (normalizedMeetingType === "one_on_one") {
      const { data: existingMatch, error: existingMatchError } = await supabase
        .from("user_matches")
        .select("id, messaging_enabled")
        .or(
          `and(user1_id.eq.${user.id},user2_id.eq.${target_user_id}),and(user1_id.eq.${target_user_id},user2_id.eq.${user.id})`
        )
        .eq("messaging_enabled", true)
        .maybeSingle();

      if (existingMatchError) {
        console.error("[meetings][POST] chat match lookup error:", existingMatchError);
        return NextResponse.json(
          { error: "Failed to verify existing match status" },
          { status: 500 }
        );
      }

      if (existingMatch) {
        return NextResponse.json(
          {
            error: "already_matched_chat_enabled",
            message:
              "You are already matched and chat is enabled with this user. Another meeting request is not available unless MatchIndeed admin permits it.",
          },
          { status: 403 }
        );
      }
    }

    // Get requester's account tier
    const requesterAvailability = await getAccountAvailability(user.id);
    if (requesterAvailability.error || !requesterAvailability.data) {
      return NextResponse.json({ error: "Failed to verify account" }, { status: 500 });
    }

    const requesterAccount = requesterAvailability.data;

    if (isProfileUnavailableForMeetings(requesterAccount)) {
      return NextResponse.json(
        {
          error: "Your profile is currently offline for meeting requests.",
          code: "profile_unavailable",
        },
        { status: 403 }
      );
    }

    const requesterMembershipTier = await getActiveMembershipTier(user.id);
    const requesterTier = normalizeTier(requesterMembershipTier || requesterAccount.tier);
    const requesterPlanLabel =
      requesterTier === "basic" && starterTrialState?.has_trial
        ? "Free plan"
        : undefined;

    // Get target user's account tier
    const targetAvailability = await getAccountAvailability(target_user_id);
    if (targetAvailability.error || !targetAvailability.data) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    const targetAccount = targetAvailability.data;

    if (isProfileUnavailableForMeetings(targetAccount)) {
      return NextResponse.json(
        {
          error: TARGET_UNAVAILABLE_MESSAGE,
          code: "target_unavailable",
        },
        { status: 403 }
      );
    }

    const targetMembershipTier = await getActiveMembershipTier(target_user_id);
    const targetTier = normalizeTier(targetMembershipTier || targetAccount.tier);

    const [requesterGender, targetGender] = await Promise.all([
      getUserGender(user.id),
      getUserGender(target_user_id),
    ]);
    const genderEligibility = evaluateGenderEligibility({
      requesterGender,
      targetGender,
    });

    if (!genderEligibility.allowed) {
      return NextResponse.json(
        {
          error: genderEligibility.message,
          code: genderEligibility.code,
        },
        { status: 403 }
      );
    }

    let standardPrivateMeetingsThisMonth = 0;
    if (
      requesterTier === "standard" &&
      normalizedMeetingType === "one_on_one"
    ) {
      standardPrivateMeetingsThisMonth =
        await countStandardPrivateMeetingsThisMonth(supabase, user.id);
    }

    const meetingRulesValidation = evaluateMeetingRequestRules({
      requesterTier,
      targetTier,
      meetingType: normalizedMeetingType,
      standardPrivateMeetingsThisMonth,
      requesterPlanLabel,
    });

    if (!meetingRulesValidation.allowed) {
      return NextResponse.json(
        {
          error: meetingRulesValidation.code || "forbidden",
          message: meetingRulesValidation.message || "Meeting request not allowed.",
          requires_upgrade: meetingRulesValidation.requiresUpgrade || false,
          target_tier: meetingRulesValidation.normalizedTargetTier,
          monthly_limit: meetingRulesValidation.limit,
          monthly_used: meetingRulesValidation.used,
        },
        { status: 403 }
      );
    }

    // Get requester's tier configuration
    const { data: tierConfig, error: tierError } = await supabase
      .from("account_tier_config")
      .select("*")
      .eq("tier", requesterTier)
      .single();

    if (tierError || !tierConfig) {
      return NextResponse.json({ error: "Failed to verify tier permissions" }, { status: 500 });
    }

    // Check if user can contact the target tier
    const canContact =
      normalizedMeetingType === "one_on_one"
        ? checkTierPermission(tierConfig, targetTier)
        : { allowed: true, message: "", extra_charge: false };
    if (!canContact.allowed) {
      return NextResponse.json(
        { 
          error: canContact.message,
          requires_upgrade: true,
          target_tier: targetTier
        },
        { status: 403 }
      );
    }

    const { data: targetCalendarConfig } = await supabase
      .from("calendar_configurations")
      .select("timezone")
      .eq("user_id", target_user_id)
      .maybeSingle();

    const hostTimeZone = getSafeTimeZone(targetCalendarConfig?.timezone);
    const requestedScheduledAtIso =
      slot_date && slot_time
        ? zonedDateTimeToUtc(String(slot_date), String(slot_time), hostTimeZone)?.toISOString() ||
          null
        : null;

    // Check if target user has this slot available
    const slotLookup = slot_id
      ? supabase
          .from("meeting_availability")
          .select("id, slot_date, slot_time, scheduled_at_utc")
          .eq("id", String(slot_id))
          .eq("user_id", target_user_id)
          .single()
      : requestedScheduledAtIso
        ? supabase
            .from("meeting_availability")
            .select("id, slot_date, slot_time, scheduled_at_utc")
            .eq("user_id", target_user_id)
            .eq("scheduled_at_utc", requestedScheduledAtIso)
            .single()
        : supabase
            .from("meeting_availability")
            .select("id, slot_date, slot_time, scheduled_at_utc")
            .eq("user_id", target_user_id)
            .eq("slot_date", slot_date)
            .eq("slot_time", slot_time)
            .single();

    const { data: availableSlot, error: slotError } = await slotLookup;

    if (slotError || !availableSlot) {
      return NextResponse.json(
        { error: "This time slot is not available" },
        { status: 400 }
      );
    }

    const normalizedSlotTime = normalizeSlotTime(availableSlot.slot_time);
    if (!normalizedSlotTime) {
      return NextResponse.json(
        { error: "Invalid slot time format" },
        { status: 400 }
      );
    }

    const scheduledAt = availableSlot.scheduled_at_utc
      ? new Date(String(availableSlot.scheduled_at_utc))
      : zonedDateTimeToUtc(
          String(availableSlot.slot_date),
          normalizedSlotTime,
          hostTimeZone
        );
    if (!scheduledAt) {
      return NextResponse.json(
        { error: "Invalid scheduled meeting time" },
        { status: 400 }
      );
    }

    if (scheduledAt < getMinimumRequestableMeetingStartDate()) {
      return NextResponse.json(
        {
          error: "slot_too_soon",
          message: `Meeting requests must be made at least ${MEETING_REQUEST_LEAD_TIME_HOURS} hours before the meeting time. Please choose a later available slot.`,
        },
        { status: 400 }
      );
    }

    const participantsForConflictValidation = [
      { userId: user.id, tier: requesterTier },
      { userId: target_user_id, tier: targetTier },
      ...(Array.isArray(participant_ids)
        ? participant_ids
            .map((participantId) => String(participantId || "").trim())
            .filter(
              (participantId) =>
                participantId &&
                participantId !== user.id &&
                participantId !== target_user_id
            )
            .map((participantId) => ({ userId: participantId }))
        : []),
    ];

    const conflictValidation = await validateMeetingBookingConflicts(
      supabase,
      scheduledAt.toISOString(),
      participantsForConflictValidation
    );
    if (!conflictValidation.allowed) {
      return NextResponse.json(
        {
          error: conflictValidation.code || "booking_conflict",
          message:
            conflictValidation.message ||
            "A participant has a conflicting meeting at this time.",
          conflict_user_id: conflictValidation.participantId,
          conflict_tier: conflictValidation.participantTier,
          simultaneous_limit: conflictValidation.simultaneousLimit,
          existing_bookings: conflictValidation.existingCount,
        },
        { status: conflictValidation.status || 409 }
      );
    }

    const { data: meetingsAtSameTime, error: duplicateLookupError } = await supabase
      .from("meetings")
      .select("id")
      .eq("host_id", target_user_id)
      .eq("scheduled_at", scheduledAt.toISOString())
      .in("status", ["pending", "confirmed"]);

    if (duplicateLookupError) {
      throw new Error(
        `Unable to verify existing meeting requests: ${duplicateLookupError.message}`
      );
    }

    const candidateMeetingIds = (meetingsAtSameTime || []).map((meeting) =>
      String(meeting.id)
    );

    if (candidateMeetingIds.length > 0) {
      const { data: duplicateParticipantRows, error: duplicateParticipantError } =
        await supabase
          .from("meeting_participants")
          .select("meeting_id")
          .eq("user_id", user.id)
          .in("meeting_id", candidateMeetingIds)
          .limit(1);

      if (duplicateParticipantError) {
        throw new Error(
          `Unable to verify duplicate participants: ${duplicateParticipantError.message}`
        );
      }

      if ((duplicateParticipantRows || []).length > 0) {
        return NextResponse.json(
          {
            error:
              "You already have a meeting request for this time slot. Please wait for a response or choose another available time.",
            code: "duplicate_meeting_request",
            scheduled_at: scheduledAt.toISOString(),
          },
          { status: 409 }
        );
      }
    }

    // Check requester's credit balance
    const { data: credits, error: creditsError } = await supabase
      .from("credits")
      .select("total, used, rollover")
      .eq("user_id", user.id)
      .maybeSingle();

    if (creditsError && creditsError.code !== "PGRST116") {
      throw new Error(`Unable to load credits balance: ${creditsError.message}`);
    }

    const availableCredits = getAvailableCredits({
      total: credits?.total || 0,
      used: credits?.used || 0,
      rollover: credits?.rollover || 0,
    });
    const requiredCredits = canUseStarterTrialRequest
      ? 0
      : getSendRequestCreditCost(requesterTier, {
          extraCharge: canContact.extra_charge,
        });

    if (!canUseStarterTrialRequest && availableCredits < requiredCredits) {
      return NextResponse.json(
        { 
          error: `Insufficient credits. You need ${requiredCredits} credit(s) for this meeting.`,
          credits_required: requiredCredits,
          credits_available: availableCredits
        },
        { status: 402 }
      );
    }

    // Calculate meeting fee (based on tier pricing)
    const { data: pricing } = await supabase
      .from("subscription_pricing")
      .select("price_ngn")
      .eq("tier_id", requesterTier)
      .single();

    const monthlyCredits = getMonthlyCreditsForTier(requesterTier);
    const creditsForFee = Math.max(1, monthlyCredits);
    const feeCents = pricing
      ? Math.round(pricing.price_ngn / creditsForFee * 100)
      : 0;

    const requesterChargeDescription = `Calendar booking request fee for ${formatInTimeZone(
      scheduledAt.toISOString(),
      hostTimeZone,
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }
    )} (${normalizedMeetingType.replace(/_/g, " ")})`;

    // Reserve requester credits before creating the meeting.
    // This keeps the request flow atomic: if we cannot charge, we should not
    // create a pending meeting shell that looks like a successful request.
    if (!canUseStarterTrialRequest) {
      const consumption = await consumeCredits(supabase, user.id, requiredCredits, {
        actionType: "meeting_request_sent",
        description: requesterChargeDescription,
      });
      if (!consumption.success) {
        return NextResponse.json(
          {
            error: `Insufficient credits. You need ${consumption.required} credit(s) for this meeting.`,
            credits_required: consumption.required,
            credits_available: consumption.available,
          },
          { status: 402 }
        );
      }
    }

    // Create the meeting
    // Per client rules: charge_status starts as "pending" and stays pending
    // until the meeting is concluded by the host and finalized by MatchIndeed.
    // The host determines the final credit charges based on fault.
    // Default cancellation fee — admin can adjust per meeting
    // This is charged to whoever cancels after the meeting is confirmed
    const defaultCancellationFeeCents = feeCents; // Same as meeting fee
    const { data: createdMeeting, error: meetingError } = await supabase
      .from("meetings")
      .insert({
        host_id: target_user_id, // Target user is the "host" of their calendar slot
        type: normalizedMeetingType,
        status: "pending",
        workflow_state: "requested",
        scheduled_at: scheduledAt.toISOString(),
        location_pref,
        fee_cents: feeCents,
        charge_status: "pending", // Stays pending until host finalizes
        cancellation_fee_cents: defaultCancellationFeeCents,
        requester_credit_cost: requiredCredits,
        accepter_credit_cost: 0,
      })
      .select()
      .single();

    if (meetingError || !createdMeeting) {
      console.error("Error creating meeting:", meetingError);
      await refundConsumedCredits(supabase, user.id, requiredCredits, {
        actionType: "meeting_request_failed_refund",
        description: `Refunded ${requiredCredits} credit(s) because the meeting request could not be created.`,
      });
      return NextResponse.json({ error: "Failed to create meeting" }, { status: 500 });
    }

    const meeting = createdMeeting;

    // Add participants
    // For group meetings, include additional participants
    const participants: NewParticipant[] = [
      { meeting_id: meeting.id, user_id: target_user_id, role: "host", response: "requested" },
      { meeting_id: meeting.id, user_id: user.id, role: "guest", response: "accepted" }, // Requester auto-accepts
    ];

    // Add additional participants for group meetings
    if (
      normalizedMeetingType === "group" &&
      participant_ids &&
      Array.isArray(participant_ids)
    ) {
      for (const participantId of participant_ids) {
        if (participantId !== user.id && participantId !== target_user_id) {
          participants.push({
            meeting_id: meeting.id,
            user_id: participantId,
            role: "guest",
            response: "requested",
          });
        }
      }
    }

    const { error: participantsError } = await supabase
      .from("meeting_participants")
      .insert(participants);

    if (participantsError) {
      console.error("Error adding participants:", participantsError);
      // Rollback meeting creation
      await supabase.from("meetings").delete().eq("id", meeting.id);
      await refundConsumedCredits(supabase, user.id, requiredCredits, {
        actionType: "meeting_request_failed_refund",
        description: `Refunded ${requiredCredits} credit(s) because the meeting participants could not be created.`,
      });
      return NextResponse.json({ error: "Failed to create meeting" }, { status: 500 });
    }

    let starterTrialConsumed = false;
    if (canUseStarterTrialRequest) {
      try {
        await consumeStarterTrialMeeting(supabase, user.id, meeting.id);
        starterTrialConsumed = true;

        await insertNotification(user.id, {
          type: "starter_trial_consumed",
          title: "Free request used",
          message:
            "Your free starter request has been used on this meeting. Subscribe for more requests or availability after this meeting.",
          data: {
            meeting_id: meeting.id,
            scheduled_at: meeting.scheduled_at,
          },
        });
      } catch (starterTrialError) {
        console.error("Error consuming starter trial after request creation:", starterTrialError);
        await supabase.from("meeting_participants").delete().eq("meeting_id", meeting.id);
        await supabase.from("meetings").delete().eq("id", meeting.id);
        return NextResponse.json(
          { error: "Failed to reserve your free starter request. Please try again." },
          { status: 500 }
        );
      }
    }

    // Send notification to target user (host)
    try {
      // Get requester's account info to show account type
      const { data: requesterIdentity } = await supabase
        .from("accounts")
        .select("display_name, email")
        .eq("id", user.id)
        .single();

      const requesterName =
        requesterIdentity?.display_name ||
        requesterIdentity?.email?.split("@")[0] ||
        "Someone";
      const requesterTierLabel =
        requesterTier.charAt(0).toUpperCase() + requesterTier.slice(1);
      const meetingDateForHost = formatInTimeZone(
        scheduledAt,
        hostTimeZone,
        "en-US",
        { month: "short", day: "numeric", year: "numeric" }
      );
      const meetingTimeForHost = formatInTimeZone(
        scheduledAt,
        hostTimeZone,
        "en-US",
        { hour: "numeric", minute: "2-digit" }
      );

      // Create dashboard notification
      await insertNotification(target_user_id, {
        type: "meeting_request",
        title: "New Meeting Request",
        message: `${requesterName} (${requesterTierLabel} account) has requested a video meeting with you on ${meetingDateForHost} at ${meetingTimeForHost}.`,
        data: {
          meeting_id: meeting.id,
          requester_id: user.id,
          requester_tier: requesterTier,
          scheduled_at: scheduledAt.toISOString(),
        },
      });

      await sendPushNotificationIfAllowed({
        userId: target_user_id,
        type: "meeting_request",
        title: "Video meeting request",
        message: `${requesterName} requested ${meetingDateForHost} at ${meetingTimeForHost}.`,
        url: "/dashboard/meetings?tab=pending",
        data: {
          meeting_id: meeting.id,
          requester_id: user.id,
          requester_tier: requesterTier,
          scheduled_at: scheduledAt.toISOString(),
        },
      });

      // Send email notification to the target user
      const { data: targetAccount } = await supabase
        .from("accounts")
        .select("email")
        .eq("id", target_user_id)
        .single();

      const { data: targetProfile } = await supabase
        .from("user_profiles")
        .select("first_name")
        .eq("user_id", target_user_id)
        .single();

      if (targetAccount?.email) {
        await sendMeetingRequestEmail(targetAccount.email, {
          recipientName: targetProfile?.first_name || "User",
          requesterName,
          meetingDate: meetingDateForHost,
          meetingTime: meetingTimeForHost,
          meetingTimeZone: hostTimeZone,
          meetingType: normalizedMeetingType || "Video Call",
        });
      }
    } catch (notificationError) {
      console.error("Error sending notification:", notificationError);
      // Don't fail the request if notification fails
    }

    await trackCustomerEventSafely(user.id, CIO_EVENTS.DATE_REQUEST_SENT, {
      meeting_id: meeting.id,
      meeting_type: normalizedMeetingType,
      scheduled_at: scheduledAt.toISOString(),
      target_user_id,
      requester_tier: requesterTier,
      target_tier: targetTier,
      credits_used: requiredCredits,
    });

    return NextResponse.json({ 
      meeting: {
        ...meeting,
        participants,
      },
      credits_used: requiredCredits,
      starter_trial_consumed: starterTrialConsumed,
      upgrade_required_for_more_access: starterTrialConsumed,
    }, { status: 201 });
  } catch (error) {
    const message = getMeetingRequestErrorMessage(error);
    console.error("Error in POST /api/meetings:", {
      message,
      raw:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Check if a user's tier can contact another tier
 */
function checkTierPermission(
  config: TierPermissionConfig,
  targetTier: string
): { allowed: boolean; message: string; extra_charge: boolean } {
  const requesterTier = String(config.tier || "basic").toLowerCase();
  const normalizedTargetTier = String(targetTier || "basic").toLowerCase();

  // VIP can contact everyone
  if (requesterTier === "vip") {
    return { allowed: true, message: "", extra_charge: false };
  }

  // Premium to VIP one-on-one is restricted under the current pricing spec.
  if (requesterTier === "premium" && normalizedTargetTier === "vip") {
    return {
      allowed: false,
      message:
        "Premium accounts can only request private meetings with Basic, Standard, or Premium users.",
      extra_charge: false,
    };
  }

  // Check tier-specific permissions from config
  switch (normalizedTargetTier) {
    case "basic":
      return { 
        allowed: config.can_one_on_one_to_basic, 
        message: config.can_one_on_one_to_basic ? "" : "Your plan cannot contact Basic users",
        extra_charge: false
      };
    case "standard":
      return { 
        allowed: config.can_one_on_one_to_standard, 
        message: config.can_one_on_one_to_standard ? "" : "Your plan cannot contact Standard users",
        extra_charge: false
      };
    case "premium":
      return { 
        allowed: config.can_one_on_one_to_premium, 
        message: config.can_one_on_one_to_premium ? "" : "Upgrade to Premium to contact Premium users",
        extra_charge: config.extra_charge_one_on_one_to_premium
      };
    case "vip":
      return { 
        allowed: config.can_one_on_one_to_vip, 
        message: config.can_one_on_one_to_vip ? "" : "Only VIP users can request meetings with VIP members.",
        extra_charge: config.extra_charge_one_on_one_to_vip
      };
    default:
      return { allowed: false, message: "Unknown tier", extra_charge: false };
  }
}

/**
 * PATCH /api/meetings
 * 
 * Update a meeting (accept, decline, cancel)
 * Body:
 * - meeting_id: Meeting ID to update
 * - action: "accept" | "decline" | "cancel"
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { meeting_id, action } = body;

    if (!meeting_id || !action) {
      return NextResponse.json(
        { error: "meeting_id and action are required" },
        { status: 400 }
      );
    }

    if (!["accept", "decline", "cancel"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be accept, decline, or cancel" },
        { status: 400 }
      );
    }

    await expireStalePendingMeetingRequests(supabase, { meetingId: meeting_id });

    // Verify user is a participant
    const { data: participant, error: participantError } = await supabase
      .from("meeting_participants")
      .select("role, response")
      .eq("meeting_id", meeting_id)
      .eq("user_id", user.id)
      .single();

    if (participantError || !participant) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Get meeting details
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const { data: userAccount } = await supabase
      .from("accounts")
      .select("tier, role")
      .eq("id", user.id)
      .single();

    const userTier = (userAccount?.tier || "basic").toLowerCase();
    const isAdmin =
      !!userAccount?.role &&
      ["admin", "superadmin"].includes(userAccount.role);

    // Handle different actions
    switch (action) {
      case "accept": {
        let usedStarterTrialAcceptance = false;
        let starterTrialConsumed = false;
        {
          const accessValidation = await validateMeetingsAccess(user.id);
          if (!accessValidation.allowed) {
            const starterTrialAcceptance = await canAcceptStarterTrialMeeting({
              supabase,
              userId: user.id,
              meetingId: meeting_id,
              meetingScheduledAt: meeting.scheduled_at,
              meetingHostId: String(meeting.host_id || ""),
            });

            if (starterTrialAcceptance.allowed) {
              usedStarterTrialAcceptance = true;
            } else {
              return NextResponse.json(
                {
                  error: starterTrialAcceptance.state.upgrade_required
                    ? "starter_trial_exhausted"
                    : "access_denied",
                  message: starterTrialAcceptance.state.upgrade_required
                    ? STARTER_TRIAL_EXHAUSTED_MESSAGE
                    : accessValidation.message,
                  requires_upgrade: starterTrialAcceptance.state.upgrade_required,
                },
                { status: 403 }
              );
            }
          }
        }

        if (participant.response !== "accepted" && !usedStarterTrialAcceptance) {
          const { data: accepterAccount } = await supabase
            .from("accounts")
            .select("tier")
            .eq("id", user.id)
            .single();

          const acceptCost = getAcceptRequestCreditCost(accepterAccount?.tier);
          if (acceptCost > 0) {
            const consumption = await consumeCredits(supabase, user.id, acceptCost, {
              actionType: "meeting_request_accepted",
              description: `Meeting acceptance fee for ${formatInTimeZone(
                meeting.scheduled_at,
                getSafeTimeZone(meeting.host_timezone || undefined),
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                }
              )} (${String(meeting.type || "one_on_one").replace(/_/g, " ")})`,
            });
            if (!consumption.success) {
              return NextResponse.json(
                {
                  error: `Insufficient credits. You need ${consumption.required} credit(s) to accept this meeting.`,
                  credits_required: consumption.required,
                  credits_available: consumption.available,
                },
                { status: 402 }
              );
            }

            await supabase
              .from("meetings")
              .update({
                accepter_credit_cost:
                  (typeof meeting.accepter_credit_cost === "number"
                    ? meeting.accepter_credit_cost
                    : 0) + acceptCost,
              })
              .eq("id", meeting_id);
          }
        }

        // Update participant response
        await supabase
          .from("meeting_participants")
          .update({ 
            response: "accepted",
            responded_at: new Date().toISOString()
          })
          .eq("meeting_id", meeting_id)
          .eq("user_id", user.id);

        if (usedStarterTrialAcceptance && participant.response !== "accepted") {
          await consumeStarterTrialMeeting(supabase, user.id, meeting_id);
          await lockConsumedStarterTrialProfile(supabase, user.id);
          starterTrialConsumed = true;

          await insertNotification(user.id, {
            type: "starter_trial_consumed",
            title: "Starter slot used",
            message:
              "Your free starter slot is now used. Subscribe to create more availability after this meeting is complete.",
            data: {
              meeting_id,
              scheduled_at: meeting.scheduled_at,
            },
          });
        }

        // Check if all participants accepted
        const { data: allParticipants } = await supabase
          .from("meeting_participants")
          .select("response")
          .eq("meeting_id", meeting_id);

        const allAccepted = allParticipants?.every(p => p.response === "accepted");
        const currentWorkflowState = deriveWorkflowState({
          workflowState:
            typeof meeting.workflow_state === "string"
              ? meeting.workflow_state
              : null,
          status: meeting.status,
        });
        const nextWorkflowState = resolveStateForAcceptance(
          currentWorkflowState,
          !!allAccepted
        );
        const transitionValidation = requireMeetingStateTransition({
          from: currentWorkflowState,
          to: nextWorkflowState,
        });
        if (!transitionValidation.allowed) {
          return NextResponse.json(
            {
              error: "invalid_state_transition",
              message:
                transitionValidation.message ||
                "Meeting state transition is not allowed.",
            },
            { status: 409 }
          );
        }
        
        if (!allAccepted && nextWorkflowState !== currentWorkflowState) {
          await supabase
            .from("meetings")
            .update({ workflow_state: nextWorkflowState })
            .eq("id", meeting_id);
        }

        if (allAccepted) {
          await supabase
            .from("meetings")
            .update({ status: "pending", workflow_state: "accepted" })
            .eq("id", meeting_id);

          try {
            await sendMeetingAcceptedParticipantEmails({
              meetingId: meeting_id,
              scheduledAt: meeting.scheduled_at,
              meetingTimeZone: meeting.host_timezone || null,
            });
          } catch (participantEmailError) {
            console.error(
              "Error sending accepted meeting participant emails:",
              participantEmailError
            );
          }

          try {
            const { data: adminAccounts } = await supabase
              .from("accounts")
              .select("id, email, display_name")
              .in("role", ["admin", "superadmin"]);

            await Promise.all(
              (adminAccounts || []).map((adminAccount) =>
                insertNotification(adminAccount.id, {
                  type: "meeting_approval_required",
                  title: "Meeting Approval Required",
                  message: "Both participants accepted a meeting request. Please approve it to confirm the booking and create the Zoom link.",
                  data: {
                    meeting_id,
                    scheduled_at: meeting.scheduled_at,
                    host_id: meeting.host_id,
                  },
                })
              )
            );

            await Promise.all(
              (adminAccounts || [])
                .filter((adminAccount) => adminAccount.email)
                .map(async (adminAccount) => {
                  const adminName =
                    adminAccount.display_name ||
                    adminAccount.email?.split("@")[0] ||
                    "Admin";
                  const meetingDate = new Date(meeting.scheduled_at);
                  const subject = "Meeting approval required";
                  const html = `
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f6fb;padding:24px;">
                      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;padding:32px;border:1px solid #e5e7eb;">
                        <h1 style="margin:0 0 12px;color:#1f2937;font-size:24px;">Meeting approval required</h1>
                        <p style="margin:0 0 12px;color:#4b5563;line-height:1.6;">Hi ${adminName}, both participants have accepted a MatchIndeed meeting and it is now waiting for admin approval.</p>
                        <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:14px;padding:16px;margin:20px 0;">
                          <p style="margin:0 0 8px;color:#1f2937;"><strong>Scheduled date:</strong> ${meetingDate.toLocaleDateString()}</p>
                          <p style="margin:0 0 8px;color:#1f2937;"><strong>Scheduled time:</strong> ${meetingDate.toLocaleTimeString()}</p>
                          <p style="margin:0;color:#1f2937;"><strong>Meeting ID:</strong> ${meeting_id}</p>
                        </div>
                        <p style="margin:0 0 24px;color:#4b5563;line-height:1.6;">Approve this meeting to confirm the booking and automatically create the Zoom link for both users.</p>
                        <a href="${adminAbsoluteUrl("/meetings")}" style="display:inline-block;background:#1f419a;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:600;">Open Admin Meetings</a>
                      </div>
                    </div>
                  `.trim();

                  await sendRawHtmlEmail(adminAccount.email as string, subject, html);
                })
            );
          } catch (adminNotifyError) {
            console.error("Error notifying admins about meeting approval:", adminNotifyError);
          }

          try {
            const { data: acceptedParticipants } = await supabase
              .from("meeting_participants")
              .select("user_id, role")
              .eq("meeting_id", meeting_id);

            await Promise.all(
              (acceptedParticipants || []).map((entry) =>
                trackCustomerEventSafely(
                  entry.user_id,
                  CIO_EVENTS.DATE_REQUEST_ACCEPTED,
                  {
                    meeting_id,
                    meeting_type: meeting.type || "one_on_one",
                    scheduled_at: meeting.scheduled_at,
                    accepted_by: user.id,
                    participant_role: entry.role,
                  }
                )
              )
            );
          } catch (cioError) {
            console.error("Error tracking meeting accepted event:", cioError);
          }
        }

        return NextResponse.json({ 
          success: true, 
          meeting_status: "pending",
          workflow_state: allAccepted ? "accepted" : nextWorkflowState,
          requires_admin_approval: allAccepted,
          starter_trial_consumed: starterTrialConsumed,
          upgrade_required_for_more_slots: starterTrialConsumed,
        });
      }

      case "decline":
        {
          const currentWorkflowState = deriveWorkflowState({
            workflowState:
              typeof meeting.workflow_state === "string"
                ? meeting.workflow_state
                : null,
            status: meeting.status,
          });
          const transitionValidation = requireMeetingStateTransition({
            from: currentWorkflowState,
            to: "canceled",
          });
          if (!transitionValidation.allowed) {
            return NextResponse.json(
              {
                error: "invalid_state_transition",
                message:
                  transitionValidation.message ||
                  "Meeting cannot be moved to canceled state.",
              },
              { status: 409 }
            );
          }
        }

        // Update participant response
        await supabase
          .from("meeting_participants")
          .update({ 
            response: "declined",
            responded_at: new Date().toISOString()
          })
          .eq("meeting_id", meeting_id)
          .eq("user_id", user.id);

        // Cancel the meeting
        await supabase
          .from("meetings")
          .update({
            status: "canceled",
            workflow_state: "canceled",
            canceled_by: user.id,
            canceled_at: new Date().toISOString(),
          })
          .eq("id", meeting_id);

        // Refund credits to the requester (guest)
        const { data: guest } = await supabase
          .from("meeting_participants")
          .select("user_id")
          .eq("meeting_id", meeting_id)
          .eq("role", "guest")
          .single();

        if (guest) {
          await refundConsumedCredits(
            supabase,
            guest.user_id,
            typeof meeting.requester_credit_cost === "number"
              ? meeting.requester_credit_cost
              : 1,
            {
              actionType: "meeting_request_declined_refund",
              description: "Meeting request declined; refunded requester credits.",
            }
          );
        }

        const declinedMeetingRestoredStarterTrialUserIds =
          meeting.status === "pending"
            ? await restoreStarterTrialForOtherParticipants(meeting_id, user.id)
            : [];

        try {
          const [{ data: actorAccount }, { data: actorProfile }] = await Promise.all([
            supabase
              .from("accounts")
              .select("display_name, email")
              .eq("id", user.id)
              .single(),
            supabase
              .from("user_profiles")
              .select("first_name")
              .eq("user_id", user.id)
              .maybeSingle(),
          ]);

          const declinerName =
            actorProfile?.first_name ||
            actorAccount?.display_name ||
            actorAccount?.email?.split("@")[0] ||
            "A participant";

          await sendMeetingCancellationEmails({
            meetingId: meeting_id,
            scheduledAt: meeting.scheduled_at,
            canceledByUserId: user.id,
            canceledByName: declinerName,
            refundIssued:
              Boolean(guest?.user_id) &&
              (typeof meeting.requester_credit_cost === "number"
                ? meeting.requester_credit_cost > 0
                : true),
            freePlanRestoredUserIds:
              declinedMeetingRestoredStarterTrialUserIds,
          });
        } catch (emailError) {
          console.error("Error sending declined meeting emails:", emailError);
        }

        return NextResponse.json({ success: true, meeting_status: "canceled" });

      case "cancel":
        const cancellationPolicy = evaluateCancellationPolicy({
          meetingStatus: meeting.status,
          userTier,
          isAdmin,
          isHostCanceller: participant.role === "host",
          cancellationFeeCents: meeting.cancellation_fee_cents,
          meetingFeeCents: meeting.fee_cents,
          confirmed: false,
        });

        if (!cancellationPolicy.allowed) {
          const requiresConfirmation =
            cancellationPolicy.code === "cancellation_requires_confirmation";

          if (requiresConfirmation) {
            return NextResponse.json(
              {
                error: cancellationPolicy.code,
                message:
                  cancellationPolicy.message ||
                  "Meeting cancellation requires confirmation.",
                cancellation_fee_cents: cancellationPolicy.cancellationFeeCents,
                requires_confirmation: true,
                redirect_to: "/api/meetings/cancel",
              },
              { status: 422 }
            );
          }

          return NextResponse.json(
            {
              error: cancellationPolicy.code || "cancellation_blocked",
              message:
                cancellationPolicy.message || "Meeting cancellation is not allowed.",
              requires_upgrade:
                cancellationPolicy.code === "tier_cancellation_forbidden",
            },
            { status: cancellationPolicy.status }
          );
        }

        if (cancellationPolicy.cancellationFeeCents > 0) {
          return NextResponse.json(
            {
              error: "cancellation_requires_confirmation",
              message:
                "Cancelling this meeting will incur a fee. Use the dedicated cancellation endpoint with confirmation.",
              cancellation_fee_cents: cancellationPolicy.cancellationFeeCents,
              requires_confirmation: true,
              redirect_to: "/api/meetings/cancel",
            },
            { status: 422 }
          );
        }

        // For pending meetings with no fee — allow direct cancellation
        {
          const currentWorkflowState = deriveWorkflowState({
            workflowState:
              typeof meeting.workflow_state === "string"
                ? meeting.workflow_state
                : null,
            status: meeting.status,
          });
          const transitionValidation = requireMeetingStateTransition({
            from: currentWorkflowState,
            to: "canceled",
          });
          if (!transitionValidation.allowed) {
            return NextResponse.json(
              {
                error: "invalid_state_transition",
                message:
                  transitionValidation.message ||
                  "Meeting cannot be moved to canceled state.",
              },
              { status: 409 }
            );
          }
        }

        await supabase
          .from("meetings")
          .update({
            status: "canceled",
            workflow_state: "canceled",
            canceled_by: user.id,
            canceled_at: new Date().toISOString(),
          })
          .eq("id", meeting_id);

        // Refund credits to the guest (requester) since meeting was not yet approved
        const { data: cancelGuest } = await supabase
          .from("meeting_participants")
          .select("user_id")
          .eq("meeting_id", meeting_id)
          .eq("role", "guest")
          .single();

        if (cancelGuest) {
          await refundConsumedCredits(
            supabase,
            cancelGuest.user_id,
            typeof meeting.requester_credit_cost === "number"
              ? meeting.requester_credit_cost
              : 1,
            {
              actionType: "meeting_canceled_refund",
              description:
                "Meeting canceled before confirmation; refunded requester credits.",
            }
          );
        }

        const canceledMeetingRestoredStarterTrialUserIds =
          meeting.status === "pending"
            ? await restoreStarterTrialForOtherParticipants(meeting_id, user.id)
            : [];

        try {
          const [{ data: actorAccount }, { data: actorProfile }] = await Promise.all([
            supabase
              .from("accounts")
              .select("display_name, email")
              .eq("id", user.id)
              .single(),
            supabase
              .from("user_profiles")
              .select("first_name")
              .eq("user_id", user.id)
              .maybeSingle(),
          ]);

          const cancellerName =
            actorProfile?.first_name ||
            actorAccount?.display_name ||
            actorAccount?.email?.split("@")[0] ||
            "A participant";

          await sendMeetingCancellationEmails({
            meetingId: meeting_id,
            scheduledAt: meeting.scheduled_at,
            canceledByUserId: user.id,
            canceledByName: cancellerName,
            refundIssued:
              Boolean(cancelGuest?.user_id) &&
              (typeof meeting.requester_credit_cost === "number"
                ? meeting.requester_credit_cost > 0
                : true),
            freePlanRestoredUserIds:
              canceledMeetingRestoredStarterTrialUserIds,
          });
        } catch (emailError) {
          console.error("Error sending canceled meeting emails:", emailError);
        }

        return NextResponse.json({
          success: true,
          meeting_status: "canceled",
          cancellation_fee_applied: false,
          cancellation_fee_cents: 0,
          credit_refunded: cancellationPolicy.shouldRefundRequesterCredits,
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error in PATCH /api/meetings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
