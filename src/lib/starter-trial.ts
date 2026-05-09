import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getMaxSlotCreationDateKey,
  getMinSlotCreationDate,
  MIN_SLOT_LEAD_TIME_HOURS,
  normalizeSlotTime,
} from "@/lib/calendar/slot-allocation";
import { getSafeTimeZone, toScheduledAtIso } from "@/lib/timezones";

export const STARTER_TRIAL_SLOT_LIMIT = 1;
export const STARTER_TRIAL_PROFILE_STATUS = "offline_trial_exhausted";
export const STARTER_TRIAL_EXHAUSTED_MESSAGE =
  "Your free starter access has been used. Subscribe to request more meetings, create availability, and accept new bookings.";
export const STARTER_TRIAL_ACTIVE_SLOT_MESSAGE =
  "Your free starter access is already tied to an active calendar slot. Remove that slot first or subscribe for more access.";
export const STARTER_TRIAL_LAUNCH_AT = "2026-04-13T00:00:00.000Z";

type StarterTrialRow = {
  user_id: string;
  active_slot_id: string | null;
  consumed_meeting_id: string | null;
  consumed_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type MembershipRow = {
  status: string | null;
  expires_at: string | null;
};

type AccountCreatedAtRow = {
  created_at: string | null;
};

type StarterTrialSlotRow = {
  id: string;
  user_id: string;
  slot_date: string;
  slot_time: string;
  scheduled_at_utc?: string | null;
};

type StarterTrialMeetingRow = {
  id: string;
  status: string | null;
  canceled_by: string | null;
  canceled_at: string | null;
};

type ActiveMeetingLookupRow = {
  id: string;
};

export type StarterTrialState = {
  has_trial: boolean;
  eligible: boolean;
  has_paid_membership_history: boolean;
  has_active_membership: boolean;
  has_active_slot: boolean;
  active_slot_id: string | null;
  consumed: boolean;
  consumed_meeting_id: string | null;
  remaining_slots: number;
  slot_limit: number;
  upgrade_required: boolean;
};

export type StarterTrialSlotValidationResult = {
  allowed: boolean;
  status: number;
  code?: string;
  message?: string;
  normalizedSlotTime?: string;
  scheduledAtIso?: string | null;
  timeZone?: string;
};

function hasActiveMembership(membership: MembershipRow | null) {
  if (!membership) return false;
  if (membership.status !== "active") return false;
  if (!membership.expires_at) return true;
  return new Date(membership.expires_at).getTime() > Date.now();
}

function isConsumedStarterTrial(trial: StarterTrialRow | null) {
  return Boolean(trial?.consumed_at || trial?.consumed_meeting_id);
}

export function isStarterTrialLaunchEligibleAccount(
  accountCreatedAt: string | null | undefined
) {
  if (!accountCreatedAt) return false;

  const createdAtMs = new Date(accountCreatedAt).getTime();
  const launchAtMs = new Date(STARTER_TRIAL_LAUNCH_AT).getTime();

  if (Number.isNaN(createdAtMs) || Number.isNaN(launchAtMs)) {
    return false;
  }

  return createdAtMs >= launchAtMs;
}

export function buildStarterTrialState(params: {
  trial: StarterTrialRow | null;
  hasPaidMembershipHistory: boolean;
  hasActiveMembership: boolean;
}): StarterTrialState {
  const consumed = isConsumedStarterTrial(params.trial);
  const hasTrial = Boolean(params.trial?.user_id);
  const eligible =
    hasTrial && !params.hasPaidMembershipHistory && !params.hasActiveMembership;
  const hasActiveSlot = Boolean(params.trial?.active_slot_id) && !consumed;
  const remainingSlots = eligible && !consumed && !params.trial?.active_slot_id ? 1 : 0;

  return {
    has_trial: hasTrial,
    eligible,
    has_paid_membership_history: params.hasPaidMembershipHistory,
    has_active_membership: params.hasActiveMembership,
    has_active_slot: hasActiveSlot,
    active_slot_id: params.trial?.active_slot_id || null,
    consumed,
    consumed_meeting_id: params.trial?.consumed_meeting_id || null,
    remaining_slots: remainingSlots,
    slot_limit: STARTER_TRIAL_SLOT_LIMIT,
    upgrade_required:
      Boolean(params.trial?.consumed_meeting_id) &&
      !params.hasActiveMembership &&
      !params.hasPaidMembershipHistory,
  };
}

export function canAccessStarterTrialMeeting(
  state: StarterTrialState,
  meetingId: string | null | undefined
) {
  if (!meetingId) return false;
  if (state.has_active_membership) return false;
  return state.has_trial && state.consumed_meeting_id === meetingId;
}

export function canUseStarterTrialMeetingRequest(
  state: StarterTrialState | null | undefined
) {
  if (!state) return false;
  return state.eligible && !state.consumed && !state.has_active_slot;
}

export function shouldRestoreConsumedStarterTrialMeeting(
  meeting: StarterTrialMeetingRow | null | undefined,
  userId: string
) {
  if (!meeting) return false;
  if (String(meeting.status || "").toLowerCase() !== "canceled") return false;

  const canceledBy = String(meeting.canceled_by || "").trim();
  return !canceledBy || canceledBy !== userId;
}

export function shouldReleaseExpiredStarterTrialSlot(params: {
  scheduledAtIso: string | null | undefined;
  hasActiveMeeting: boolean;
  now?: Date | string;
}) {
  if (params.hasActiveMeeting || !params.scheduledAtIso) {
    return false;
  }

  const scheduledAtMs = new Date(params.scheduledAtIso).getTime();
  const nowMs =
    params.now instanceof Date
      ? params.now.getTime()
      : typeof params.now === "string"
        ? new Date(params.now).getTime()
        : Date.now();

  if (Number.isNaN(scheduledAtMs) || Number.isNaN(nowMs)) {
    return false;
  }

  return scheduledAtMs <= nowMs;
}

export async function seedStarterTrialRecord(
  supabase: Pick<SupabaseClient, "from">,
  userId: string
) {
  return supabase.from("user_starter_trials").upsert(
    {
      user_id: userId,
      active_slot_id: null,
      consumed_meeting_id: null,
      consumed_at: null,
    },
    { onConflict: "user_id" }
  );
}

async function getStarterTrialRow(
  supabase: SupabaseClient,
  userId: string
): Promise<StarterTrialRow | null> {
  const { data, error } = await supabase
    .from("user_starter_trials")
    .select("user_id, active_slot_id, consumed_meeting_id, consumed_at, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as StarterTrialRow | null) || null;
}

async function getLatestMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<MembershipRow | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select("status, expires_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as MembershipRow | null) || null;
}

async function hasPaidMembershipHistory(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", userId)
    .gt("price_cents", 0)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

async function getAccountCreatedAt(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("created_at")
    .eq("id", userId)
    .maybeSingle<AccountCreatedAtRow>();

  if (error) {
    throw error;
  }

  return data?.created_at || null;
}

export async function clearStarterTrialSlot(
  supabase: SupabaseClient,
  userId: string,
  slotId?: string | null
) {
  let query = supabase
    .from("user_starter_trials")
    .update({
      active_slot_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (slotId) {
    query = query.eq("active_slot_id", slotId);
  }

  return query;
}

export async function bindStarterTrialSlot(
  supabase: SupabaseClient,
  userId: string,
  slotId: string
) {
  return supabase
    .from("user_starter_trials")
    .update({
      active_slot_id: slotId,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export async function consumeStarterTrialMeeting(
  supabase: SupabaseClient,
  userId: string,
  meetingId: string
) {
  const consumedAt = new Date().toISOString();

  const updateResult = await supabase
    .from("user_starter_trials")
    .update({
      active_slot_id: null,
      consumed_meeting_id: meetingId,
      consumed_at: consumedAt,
      updated_at: consumedAt,
    })
    .eq("user_id", userId)
    .is("consumed_at", null);

  if (updateResult.error) {
    throw updateResult.error;
  }

  return consumedAt;
}

export async function restoreStarterTrialMeeting(
  supabase: SupabaseClient,
  userId: string,
  meetingId: string
) {
  const [trial, membership, paidHistory] = await Promise.all([
    getStarterTrialRow(supabase, userId),
    getLatestMembership(supabase, userId),
    hasPaidMembershipHistory(supabase, userId),
  ]);

  if (!trial?.user_id || trial.consumed_meeting_id !== meetingId) {
    return { restored: false };
  }

  if (paidHistory || hasActiveMembership(membership)) {
    return { restored: false };
  }

  const restoredAt = new Date().toISOString();
  const { error } = await supabase
    .from("user_starter_trials")
    .update({
      consumed_meeting_id: null,
      consumed_at: null,
      updated_at: restoredAt,
    })
    .eq("user_id", userId)
    .eq("consumed_meeting_id", meetingId);

  if (error) {
    throw error;
  }

  await restoreStarterTrialProfileIfEligible(supabase, userId);
  return { restored: true };
}

export async function lockConsumedStarterTrialProfile(
  supabase: SupabaseClient,
  userId: string
) {
  const { error } = await supabase
    .from("accounts")
    .update({
      profile_visible: false,
      calendar_enabled: false,
      profile_status: STARTER_TRIAL_PROFILE_STATUS,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error && error.code !== "42703") {
    throw error;
  }

  if (!error) {
    return;
  }

  const fallback = await supabase
    .from("accounts")
    .update({
      profile_visible: false,
      calendar_enabled: false,
    })
    .eq("id", userId);

  if (fallback.error) {
    throw fallback.error;
  }
}

export async function restoreStarterTrialProfileIfEligible(
  supabase: SupabaseClient,
  userId: string
) {
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("account_status, profile_status")
    .eq("id", userId)
    .maybeSingle<{
      account_status?: string | null;
      profile_status?: string | null;
    }>();

  if (accountError) {
    throw accountError;
  }

  const accountStatus = String(account?.account_status || "active").toLowerCase();
  const profileStatus = String(account?.profile_status || "").toLowerCase();

  if (accountStatus !== "active" || profileStatus !== STARTER_TRIAL_PROFILE_STATUS) {
    return { restored: false };
  }

  const { error } = await supabase
    .from("accounts")
    .update({
      profile_visible: true,
      calendar_enabled: true,
      profile_status: "online",
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error && error.code !== "42703") {
    throw error;
  }

  if (!error) {
    return { restored: true };
  }

  const fallback = await supabase
    .from("accounts")
    .update({
      profile_visible: true,
      calendar_enabled: true,
    })
    .eq("id", userId);

  if (fallback.error) {
    throw fallback.error;
  }

  return { restored: true };
}

export async function getStarterTrialState(
  supabase: SupabaseClient,
  userId: string,
  options?: { verifyActiveSlot?: boolean }
): Promise<StarterTrialState> {
  const [trial, membership, paidHistory, accountCreatedAt] = await Promise.all([
    getStarterTrialRow(supabase, userId),
    getLatestMembership(supabase, userId),
    hasPaidMembershipHistory(supabase, userId),
    getAccountCreatedAt(supabase, userId),
  ]);

  let nextTrial = trial;

  if (!nextTrial && isStarterTrialLaunchEligibleAccount(accountCreatedAt)) {
    const seedResult = await seedStarterTrialRecord(supabase, userId);

    if (seedResult.error) {
      throw seedResult.error;
    }

    nextTrial = {
      user_id: userId,
      active_slot_id: null,
      consumed_meeting_id: null,
      consumed_at: null,
    };
  }

  if (options?.verifyActiveSlot && trial?.active_slot_id) {
    const slot = await getStarterTrialSlot(supabase, userId, trial.active_slot_id);

    if (!slot) {
      await clearStarterTrialSlot(supabase, userId, trial.active_slot_id);
      nextTrial = {
        ...trial,
        active_slot_id: null,
      };
    } else {
      const scheduledAtIso = await resolveSlotScheduledAtIso(
        supabase,
        userId,
        slot
      );

      if (scheduledAtIso) {
        const hasActiveMeeting = await hasActiveStarterTrialMeeting(
          supabase,
          userId,
          scheduledAtIso
        );

        if (
          shouldReleaseExpiredStarterTrialSlot({
            scheduledAtIso,
            hasActiveMeeting,
          })
        ) {
          await clearStarterTrialSlot(supabase, userId, trial.active_slot_id);
          nextTrial = {
            ...trial,
            active_slot_id: null,
          };
        }
      }
    }
  }

  if (nextTrial?.consumed_meeting_id && !paidHistory && !hasActiveMembership(membership)) {
    const { data: consumedMeeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, status, canceled_by, canceled_at")
      .eq("id", nextTrial.consumed_meeting_id)
      .maybeSingle<StarterTrialMeetingRow>();

    if (meetingError) {
      throw meetingError;
    }

    if (shouldRestoreConsumedStarterTrialMeeting(consumedMeeting, userId)) {
      await restoreStarterTrialMeeting(
        supabase,
        userId,
        nextTrial.consumed_meeting_id
      );
      nextTrial = {
        ...nextTrial,
        consumed_meeting_id: null,
        consumed_at: null,
      };
    }
  }

  return buildStarterTrialState({
    trial: nextTrial,
    hasPaidMembershipHistory: paidHistory,
    hasActiveMembership: hasActiveMembership(membership),
  });
}

async function getStarterTrialSlot(
  supabase: SupabaseClient,
  userId: string,
  slotId: string
) {
  const { data, error } = await supabase
    .from("meeting_availability")
    .select("id, user_id, slot_date, slot_time, scheduled_at_utc")
    .eq("id", slotId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as StarterTrialSlotRow | null) || null;
}

async function resolveSlotScheduledAtIso(
  supabase: SupabaseClient,
  userId: string,
  slot: StarterTrialSlotRow
) {
  if (slot.scheduled_at_utc) {
    return slot.scheduled_at_utc;
  }

  const { data: calendarConfig, error: configError } = await supabase
    .from("calendar_configurations")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle<{ timezone?: string | null }>();

  if (configError) {
    throw configError;
  }

  return toScheduledAtIso(
    slot.slot_date,
    slot.slot_time,
    getSafeTimeZone(calendarConfig?.timezone)
  );
}

async function hasActiveStarterTrialMeeting(
  supabase: SupabaseClient,
  userId: string,
  scheduledAtIso: string
) {
  const { data, error } = await supabase
    .from("meetings")
    .select("id")
    .eq("host_id", userId)
    .eq("scheduled_at", scheduledAtIso)
    .in("status", ["pending", "confirmed"])
    .limit(1)
    .maybeSingle<ActiveMeetingLookupRow>();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

export async function canAcceptStarterTrialMeeting(params: {
  supabase: SupabaseClient;
  userId: string;
  meetingId: string;
  meetingScheduledAt: string;
  meetingHostId: string;
}) {
  const state = await getStarterTrialState(params.supabase, params.userId, {
    verifyActiveSlot: true,
  });

  if (!state.eligible || state.consumed || !state.active_slot_id) {
    return { allowed: false, state };
  }

  if (params.meetingHostId !== params.userId) {
    return { allowed: false, state };
  }

  const slot = await getStarterTrialSlot(
    params.supabase,
    params.userId,
    state.active_slot_id
  );

  if (!slot) {
    await clearStarterTrialSlot(params.supabase, params.userId, state.active_slot_id);
    return {
      allowed: false,
      state: {
        ...state,
        active_slot_id: null,
        has_active_slot: false,
        remaining_slots: 1,
      },
    };
  }

  const scheduledAtIso = await resolveSlotScheduledAtIso(
    params.supabase,
    params.userId,
    slot
  );

  return {
    allowed: scheduledAtIso === params.meetingScheduledAt,
    state,
    slot,
    scheduledAtIso,
  };
}

export async function validateStarterTrialSlotCreation(params: {
  supabase: SupabaseClient;
  userId: string;
  slotDate: string;
  slotTime: string;
  source: "self_customized" | "matchindeed";
  state: StarterTrialState;
}) {
  if (!params.state.eligible) {
    return {
      allowed: false,
      status: 403,
      code: params.state.upgrade_required
        ? "starter_trial_exhausted"
        : "starter_trial_unavailable",
      message: params.state.upgrade_required
        ? STARTER_TRIAL_EXHAUSTED_MESSAGE
        : "Your account is not eligible for the free starter slot.",
    } satisfies StarterTrialSlotValidationResult;
  }

  if (params.source !== "self_customized") {
    return {
      allowed: false,
      status: 400,
      code: "starter_trial_custom_slot_only",
      message: "The free starter trial only supports one custom slot.",
    } satisfies StarterTrialSlotValidationResult;
  }

  if (params.state.consumed || params.state.upgrade_required) {
    return {
      allowed: false,
      status: 403,
      code: "starter_trial_exhausted",
      message: STARTER_TRIAL_EXHAUSTED_MESSAGE,
    } satisfies StarterTrialSlotValidationResult;
  }

  if (params.state.has_active_slot) {
    return {
      allowed: false,
      status: 409,
      code: "starter_trial_slot_in_use",
      message:
        "Starter slot active — remove it first, or upgrade for unlimited slots.",
    } satisfies StarterTrialSlotValidationResult;
  }

  const normalizedSlotTime = normalizeSlotTime(params.slotTime);
  if (!normalizedSlotTime) {
    return {
      allowed: false,
      status: 400,
      code: "invalid_slot_time",
      message: "Invalid slot time format.",
    } satisfies StarterTrialSlotValidationResult;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.slotDate)) {
    return {
      allowed: false,
      status: 400,
      code: "invalid_slot_date",
      message: "Invalid slot date format.",
    } satisfies StarterTrialSlotValidationResult;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  if (params.slotDate < todayKey) {
    return {
      allowed: false,
      status: 400,
      code: "past_date",
      message: "Cannot create availability for a past date.",
    } satisfies StarterTrialSlotValidationResult;
  }

  const maxSlotDateKey = getMaxSlotCreationDateKey();
  if (params.slotDate > maxSlotDateKey) {
    return {
      allowed: false,
      status: 400,
      code: "outside_starter_trial_window",
      message: `Your free starter slot can only be created within the next ${maxSlotDateKey === todayKey ? 1 : 30} days.`,
    } satisfies StarterTrialSlotValidationResult;
  }

  const { data: calendarConfig, error: configError } = await params.supabase
    .from("calendar_configurations")
    .select("timezone")
    .eq("user_id", params.userId)
    .maybeSingle<{ timezone?: string | null }>();

  if (configError) {
    throw configError;
  }

  const timeZone = getSafeTimeZone(calendarConfig?.timezone);
  const scheduledAtIso = toScheduledAtIso(
    params.slotDate,
    normalizedSlotTime,
    timeZone
  );
  const selectedScheduledAt = scheduledAtIso
    ? new Date(scheduledAtIso)
    : new Date(`${params.slotDate}T${normalizedSlotTime}`);

  if (
    Number.isNaN(selectedScheduledAt.getTime()) ||
    selectedScheduledAt < getMinSlotCreationDate()
  ) {
    return {
      allowed: false,
      status: 400,
      code: "slot_too_soon",
      message: `Availability must be scheduled at least ${MIN_SLOT_LEAD_TIME_HOURS} hours in advance.`,
    } satisfies StarterTrialSlotValidationResult;
  }

  let duplicateQuery = params.supabase
    .from("meeting_availability")
    .select("id")
    .eq("user_id", params.userId);

  if (scheduledAtIso) {
    duplicateQuery = duplicateQuery.eq("scheduled_at_utc", scheduledAtIso);
  } else {
    duplicateQuery = duplicateQuery
      .eq("slot_date", params.slotDate)
      .eq("slot_time", normalizedSlotTime);
  }

  const { data: duplicateSlot, error: duplicateError } =
    await duplicateQuery.maybeSingle();

  if (duplicateError) {
    throw duplicateError;
  }

  if (duplicateSlot) {
    return {
      allowed: false,
      status: 409,
      code: "duplicate_slot",
      message: "This time slot already exists on your calendar.",
    } satisfies StarterTrialSlotValidationResult;
  }

  return {
    allowed: true,
    status: 200,
    normalizedSlotTime,
    scheduledAtIso,
    timeZone,
  } satisfies StarterTrialSlotValidationResult;
}
