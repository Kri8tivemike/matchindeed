import type { SupabaseClient } from "@supabase/supabase-js";
import { refundConsumedCredits } from "@/lib/credits/actions";
import { sendMeetingCancelledEmail } from "@/lib/email";

export const MEETING_REQUEST_EXPIRATION_HOURS = 24;
export const MEETING_REQUEST_EXPIRATION_REASON =
  "Automatically declined after 24 hours because the request was not accepted in time.";
const SYSTEM_CANCELLER_LABEL = "MatchIndeed";

type ExpirableMeeting = {
  id: string;
  scheduled_at: string;
  requester_credit_cost: number | null;
  created_at: string;
};

type MeetingParticipant = {
  user_id: string;
  role: "host" | "guest";
  response: string | null;
};

type AccountRecord = {
  id: string;
  email: string | null;
  display_name: string | null;
};

type ProfileRecord = {
  user_id: string;
  first_name: string | null;
};

type PendingExpirationDependencies = {
  refundConsumedCreditsFn?: typeof refundConsumedCredits;
  sendMeetingCancelledEmailFn?: typeof sendMeetingCancelledEmail;
  restoreStarterTrialMeetingFn?: (
    supabase: SupabaseClient,
    userId: string,
    meetingId: string
  ) => Promise<{ restored?: boolean } | void>;
};

async function insertNotification(
  supabase: SupabaseClient,
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

async function expireMeeting(
  supabase: SupabaseClient,
  meeting: ExpirableMeeting,
  deps: PendingExpirationDependencies = {}
) {
  const refundConsumedCreditsFn =
    deps.refundConsumedCreditsFn || refundConsumedCredits;
  const sendMeetingCancelledEmailFn =
    deps.sendMeetingCancelledEmailFn || sendMeetingCancelledEmail;
  const restoreStarterTrialMeetingFn =
    deps.restoreStarterTrialMeetingFn ||
    (async (client: SupabaseClient, userId: string, meetingId: string) => {
      const starterTrialModule = await import("@/lib/starter-trial");
      return starterTrialModule.restoreStarterTrialMeeting(
        client,
        userId,
        meetingId
      );
    });
  const { data: participants, error: participantsError } = await supabase
    .from("meeting_participants")
    .select("user_id, role, response")
    .eq("meeting_id", meeting.id);

  if (participantsError) {
    throw participantsError;
  }

  const typedParticipants = (participants || []) as MeetingParticipant[];
  if (typedParticipants.length === 0) {
    return false;
  }

  const { data: updatedMeetings, error: meetingUpdateError } = await supabase
    .from("meetings")
    .update({
      status: "canceled",
      workflow_state: "canceled",
      canceled_at: new Date().toISOString(),
      cancellation_reason: MEETING_REQUEST_EXPIRATION_REASON,
    })
    .eq("id", meeting.id)
    .eq("status", "pending")
    .eq("workflow_state", "requested")
    .select("id");

  if (meetingUpdateError) {
    throw meetingUpdateError;
  }

  if (!updatedMeetings || updatedMeetings.length === 0) {
    return false;
  }

  const pendingParticipantIds = typedParticipants
    .filter((participant) => participant.response === "requested")
    .map((participant) => participant.user_id);

  if (pendingParticipantIds.length > 0) {
    await supabase
      .from("meeting_participants")
      .update({
        response: "declined",
        responded_at: new Date().toISOString(),
      })
      .eq("meeting_id", meeting.id)
      .in("user_id", pendingParticipantIds);
  }

  const guestParticipant = typedParticipants.find(
    (participant) => participant.role === "guest"
  );
  const refundAmount =
    typeof meeting.requester_credit_cost === "number" &&
    meeting.requester_credit_cost > 0
      ? meeting.requester_credit_cost
      : 0;

  if (guestParticipant && refundAmount > 0) {
    await refundConsumedCreditsFn(supabase, guestParticipant.user_id, refundAmount, {
      actionType: "meeting_request_expired_refund",
      description:
        "Meeting request expired after 24 hours without acceptance; refunded requester credits.",
    });
  }

  const restoredStarterTrialUserIds = new Set(
    (
      await Promise.all(
        typedParticipants.map(async (participant) => {
          const result = await restoreStarterTrialMeetingFn(
            supabase,
            participant.user_id,
            meeting.id
          );

          return result?.restored ? participant.user_id : null;
        })
      )
    ).filter((userId): userId is string => Boolean(userId))
  );

  const participantIds = typedParticipants.map((participant) => participant.user_id);
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

  const accountRecords = (accounts || []) as AccountRecord[];
  const profileRecords = (profiles || []) as ProfileRecord[];
  const meetingDate = new Date(meeting.scheduled_at).toLocaleDateString();

  await Promise.all(
    typedParticipants.map(async (participant) => {
      const account = accountRecords.find((entry) => entry.id === participant.user_id);
      const profile = profileRecords.find((entry) => entry.user_id === participant.user_id);
      const recipientName =
        profile?.first_name ||
        account?.display_name ||
        account?.email?.split("@")[0] ||
        "User";

      await insertNotification(supabase, participant.user_id, {
        type: "meeting_request_expired",
        title: "Meeting Request Expired",
        message:
          "This meeting request was automatically declined after 24 hours because it was not accepted in time.",
        data: {
          meeting_id: meeting.id,
          reason: MEETING_REQUEST_EXPIRATION_REASON,
        },
      });

      if (!account?.email) {
        return;
      }

      await sendMeetingCancelledEmailFn(
        account.email,
        {
          recipientName,
          meetingDate,
          cancelledBy: SYSTEM_CANCELLER_LABEL,
          refundIssued: participant.role === "guest" && refundAmount > 0,
          freePlanRestored: restoredStarterTrialUserIds.has(participant.user_id),
        },
        participant.user_id
      );
    })
  );

  return true;
}

export async function expireStalePendingMeetingRequests(
  supabase: SupabaseClient,
  options?: { meetingId?: string | null } & PendingExpirationDependencies
) {
  const expirationCutoff = new Date(
    Date.now() - MEETING_REQUEST_EXPIRATION_HOURS * 60 * 60 * 1000
  ).toISOString();

  let query = supabase
    .from("meetings")
    .select("id, scheduled_at, requester_credit_cost, created_at")
    .eq("status", "pending")
    .eq("workflow_state", "requested")
    .lte("created_at", expirationCutoff);

  if (options?.meetingId) {
    query = query.eq("id", options.meetingId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const meetings = (data || []) as ExpirableMeeting[];
  let expiredCount = 0;

  for (const meeting of meetings) {
    const expired = await expireMeeting(supabase, meeting, options);
    if (expired) {
      expiredCount += 1;
    }
  }

  return {
    expiredCount,
    expirationCutoff,
  };
}
