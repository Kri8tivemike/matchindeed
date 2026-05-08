import type { SupabaseClient } from "@supabase/supabase-js";
import type { TierId } from "@/lib/subscription/config";
import {
  MONTHLY_CREDITS_BY_TIER,
  normalizeTier,
  UNLIMITED_CREDITS,
} from "@/lib/credits/config";

export type SlotSource = "self_customized" | "matchindeed";
export const MAX_SLOT_WINDOW_DAYS = 30;
export const MIN_SLOT_LEAD_TIME_HOURS = 48;

type TierConfigRow = {
  tier: TierId;
  monthly_outgoing_credits: number | null;
  max_outgoing_slots: number | null;
  customized_slots: number | null;
  matchindeed_slots: number | null;
  credit_rollover: boolean | null;
  simultaneous_bookings_limit: number | null;
};

type SlotUsageRow = {
  source: SlotSource;
};

type MembershipWindowRow = {
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string | null;
};

export type CalendarSlotPolicy = {
  tier: TierId;
  monthly_outgoing_credits: number;
  max_outgoing_slots: number;
  customized_slots: number;
  matchindeed_slots: number;
  credit_rollover: boolean;
  simultaneous_bookings_limit: number;
  allow_multibooking: boolean;
};

export type CalendarSlotUsage = {
  total_slots_used: number;
  custom_slots_used: number;
  matchindeed_slots_used: number;
  month_start: string;
  month_end: string;
};

export type ActiveSubscriptionWindow = {
  starts_at: string;
  expires_at: string;
};

export function isUnlimitedSlotCount(value: number) {
  return value >= UNLIMITED_SLOTS;
}

export function getRemainingIncludedCustomSlots(
  policy: CalendarSlotPolicy,
  usage: CalendarSlotUsage
) {
  if (isUnlimitedSlotCount(policy.customized_slots)) {
    return UNLIMITED_SLOTS;
  }

  return Math.max(policy.customized_slots - usage.custom_slots_used, 0);
}

export function doesNextCustomSlotUseCredits(
  policy: CalendarSlotPolicy,
  usage: CalendarSlotUsage
) {
  if (!isUnlimitedSlotCount(policy.max_outgoing_slots)) {
    if (usage.total_slots_used >= policy.max_outgoing_slots) {
      return true;
    }
  }

  if (isUnlimitedSlotCount(policy.customized_slots)) {
    return false;
  }

  if (policy.customized_slots <= 0) {
    return true;
  }

  return usage.custom_slots_used >= policy.customized_slots;
}

export function getCreditBackedCustomSlotCount(
  policy: CalendarSlotPolicy,
  usage: CalendarSlotUsage
) {
  const customAllowance = isUnlimitedSlotCount(policy.customized_slots)
    ? Number.POSITIVE_INFINITY
    : Math.max(policy.customized_slots, 0);
  const totalAllowance = isUnlimitedSlotCount(policy.max_outgoing_slots)
    ? Number.POSITIVE_INFINITY
    : Math.max(policy.max_outgoing_slots - usage.matchindeed_slots_used, 0);

  const freeCustomSlotsAllowed = Math.min(customAllowance, totalAllowance);
  return Math.max(usage.custom_slots_used - freeCustomSlotsAllowed, 0);
}

type SlotValidationInput = {
  slotDate: string;
  slotTime: string;
  source: SlotSource;
  scheduledAtIso?: string | null;
};

export type SlotValidationResult = {
  allowed: boolean;
  status: number;
  code?: string;
  message?: string;
  policy: CalendarSlotPolicy;
  usage: CalendarSlotUsage;
  normalizedSlotTime: string;
};

const UNLIMITED_SLOTS = 999999;

const DEFAULT_POLICY_BY_TIER: Record<
  TierId,
  Omit<CalendarSlotPolicy, "tier" | "allow_multibooking">
> = {
  basic: {
    monthly_outgoing_credits: MONTHLY_CREDITS_BY_TIER.basic,
    max_outgoing_slots: 5,
    customized_slots: 0,
    matchindeed_slots: 5,
    credit_rollover: false,
    simultaneous_bookings_limit: 1,
  },
  standard: {
    monthly_outgoing_credits: MONTHLY_CREDITS_BY_TIER.standard,
    max_outgoing_slots: 15,
    customized_slots: 5,
    matchindeed_slots: 10,
    credit_rollover: true,
    simultaneous_bookings_limit: 1,
  },
  premium: {
    monthly_outgoing_credits: MONTHLY_CREDITS_BY_TIER.premium,
    max_outgoing_slots: UNLIMITED_SLOTS,
    customized_slots: UNLIMITED_SLOTS,
    matchindeed_slots: 0,
    credit_rollover: true,
    simultaneous_bookings_limit: UNLIMITED_SLOTS,
  },
  vip: {
    monthly_outgoing_credits: UNLIMITED_CREDITS,
    max_outgoing_slots: UNLIMITED_SLOTS,
    customized_slots: UNLIMITED_SLOTS,
    matchindeed_slots: UNLIMITED_SLOTS,
    credit_rollover: true,
    simultaneous_bookings_limit: UNLIMITED_SLOTS,
  },
};

function buildPolicy(tier: TierId, row?: TierConfigRow | null): CalendarSlotPolicy {
  const defaults = DEFAULT_POLICY_BY_TIER[tier];
  const maxOutgoingSlots =
    row?.max_outgoing_slots !== null &&
    row?.max_outgoing_slots !== undefined &&
    row.max_outgoing_slots > 0
      ? row.max_outgoing_slots
      : defaults.max_outgoing_slots;
  const customSlots =
    row?.customized_slots !== null &&
    row?.customized_slots !== undefined &&
    row.customized_slots >= 0
      ? row.customized_slots
      : defaults.customized_slots;
  const matchIndeedSlots =
    row?.matchindeed_slots !== null &&
    row?.matchindeed_slots !== undefined &&
    row.matchindeed_slots >= 0
      ? row.matchindeed_slots
      : defaults.matchindeed_slots;
  const simultaneousBookingsLimit =
    row?.simultaneous_bookings_limit !== null &&
    row?.simultaneous_bookings_limit !== undefined &&
    row.simultaneous_bookings_limit > 0
      ? row.simultaneous_bookings_limit
      : defaults.simultaneous_bookings_limit;

  return {
    tier,
    monthly_outgoing_credits:
      row?.monthly_outgoing_credits !== null &&
      row?.monthly_outgoing_credits !== undefined &&
      row.monthly_outgoing_credits > 0
        ? row.monthly_outgoing_credits
        : defaults.monthly_outgoing_credits,
    max_outgoing_slots: maxOutgoingSlots,
    customized_slots: customSlots,
    matchindeed_slots: matchIndeedSlots,
    credit_rollover: row?.credit_rollover ?? defaults.credit_rollover,
    simultaneous_bookings_limit: simultaneousBookingsLimit,
    allow_multibooking:
      tier === "premium" ||
      tier === "vip" ||
      simultaneousBookingsLimit > 1,
  };
}

function getMonthRange(inputDate: string) {
  const parsed = new Date(`${inputDate}T00:00:00Z`);
  const monthStart = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1, 0, 0, 0)
  );
  const monthEnd = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1, 0, 0, 0)
  );
  return { monthStart, monthEnd };
}

function getStartOfDayUtc(input: Date) {
  return new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate(), 0, 0, 0, 0)
  );
}

function getEndExclusiveFromDate(input: Date) {
  const result = getStartOfDayUtc(input);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

function deriveCycleEndDate(startsAt: Date, expiresAt?: string | null) {
  if (expiresAt) {
    const parsedExpiry = new Date(expiresAt);
    if (!Number.isNaN(parsedExpiry.getTime())) {
      return getStartOfDayUtc(parsedExpiry);
    }
  }

  return getMaxSlotCreationDate(startsAt);
}

export function getSlotUsageRange(
  slotDate: string,
  activeWindow?: ActiveSubscriptionWindow | null
) {
  if (!activeWindow) {
    const { monthStart, monthEnd } = getMonthRange(slotDate);
    return {
      rangeStart: monthStart,
      rangeEndExclusive: monthEnd,
      maxSelectableDate: new Date(monthEnd.getTime() - 24 * 60 * 60 * 1000),
    };
  }

  const startsAt = new Date(activeWindow.starts_at);
  const rangeStart = getStartOfDayUtc(startsAt);
  const maxSelectableDate = deriveCycleEndDate(startsAt, activeWindow.expires_at);
  const rangeEndExclusive = getEndExclusiveFromDate(maxSelectableDate);

  return {
    rangeStart,
    rangeEndExclusive,
    maxSelectableDate,
  };
}

export function normalizeSlotTime(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) {
    return null;
  }
  const [, hh, mm, ss] = match;
  return `${hh}:${mm}:${ss || "00"}`;
}

export function getMaxSlotCreationDate(from = new Date()) {
  const maxDate = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    0,
    0,
    0,
    0
  );
  maxDate.setDate(maxDate.getDate() + MAX_SLOT_WINDOW_DAYS - 1);
  return maxDate;
}

export function getMaxSlotCreationDateKey(from = new Date()) {
  return getMaxSlotCreationDate(from).toISOString().slice(0, 10);
}

export function getMinSlotCreationDate(from = new Date()) {
  return new Date(from.getTime() + MIN_SLOT_LEAD_TIME_HOURS * 60 * 60 * 1000);
}

export function getMinSlotCreationDateKey(from = new Date()) {
  return getMinSlotCreationDate(from).toISOString().slice(0, 10);
}

export function getRollingSlotWindowDays(from = new Date()) {
  const today = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    0,
    0,
    0,
    0
  );
  const maxSelectableDate = getMaxSlotCreationDate(from);
  const diffMs = maxSelectableDate.getTime() - today.getTime();
  return diffMs < 0 ? 0 : Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

export function getMaxSlotCreationDateKeyForWindow(
  activeWindow?: ActiveSubscriptionWindow | null,
  from = new Date()
) {
  return getSlotUsageRange(from.toISOString().slice(0, 10), activeWindow)
    .maxSelectableDate.toISOString()
    .slice(0, 10);
}

export function getRemainingSlotWindowDays(
  activeWindow?: ActiveSubscriptionWindow | null,
  from = new Date()
) {
  const today = getStartOfDayUtc(from);
  const maxSelectableDate = getSlotUsageRange(
    from.toISOString().slice(0, 10),
    activeWindow
  ).maxSelectableDate;
  const diffMs = maxSelectableDate.getTime() - today.getTime();
  return diffMs < 0 ? 0 : Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

export async function getActiveSubscriptionWindow(
  supabase: SupabaseClient,
  userId: string
): Promise<ActiveSubscriptionWindow | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select("status, starts_at, expires_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const membership = (data as MembershipWindowRow | null) || null;
  if (!membership || membership.status !== "active" || !membership.expires_at) {
    return null;
  }

  const expiresAt = new Date(membership.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const startsAtRaw = membership.starts_at || membership.created_at;
  const parsedStartsAt = startsAtRaw ? new Date(startsAtRaw) : null;
  const safeStartsAt =
    parsedStartsAt && !Number.isNaN(parsedStartsAt.getTime())
      ? parsedStartsAt
      : new Date(expiresAt.getTime() - (MAX_SLOT_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000);

  return {
    starts_at: safeStartsAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

export async function getCalendarSlotPolicy(
  supabase: SupabaseClient,
  userId: string,
  explicitTier?: string | null
): Promise<CalendarSlotPolicy> {
  const tier =
    explicitTier !== undefined
      ? normalizeTier(explicitTier)
      : await getUserTier(supabase, userId);

  const { data } = await supabase
    .from("account_tier_config")
    .select(
      "tier, monthly_outgoing_credits, max_outgoing_slots, customized_slots, matchindeed_slots, credit_rollover, simultaneous_bookings_limit"
    )
    .eq("tier", tier)
    .maybeSingle();

  return buildPolicy(tier, (data as TierConfigRow | null) || null);
}

export async function getCalendarSlotUsageForMonth(
  supabase: SupabaseClient,
  userId: string,
  slotDate: string
): Promise<CalendarSlotUsage> {
  const activeWindow = await getActiveSubscriptionWindow(supabase, userId);
  const { rangeStart, rangeEndExclusive } = getSlotUsageRange(
    slotDate,
    activeWindow
  );

  const { data, error } = await supabase
    .from("meeting_availability")
    .select("source")
    .eq("user_id", userId)
    .gte("slot_date", rangeStart.toISOString().slice(0, 10))
    .lt("slot_date", rangeEndExclusive.toISOString().slice(0, 10));

  if (error) {
    throw error;
  }

  const rows = (data || []) as SlotUsageRow[];
  let customSlotsUsed = 0;
  let matchindeedSlotsUsed = 0;
  for (const row of rows) {
    if (row.source === "self_customized") {
      customSlotsUsed += 1;
    } else {
      matchindeedSlotsUsed += 1;
    }
  }

  return {
    total_slots_used: rows.length,
    custom_slots_used: customSlotsUsed,
    matchindeed_slots_used: matchindeedSlotsUsed,
    month_start: rangeStart.toISOString(),
    month_end: rangeEndExclusive.toISOString(),
  };
}

export async function validateSlotCreation(
  supabase: SupabaseClient,
  userId: string,
  input: SlotValidationInput,
  explicitTier?: string | null
): Promise<SlotValidationResult> {
  const slotTime = normalizeSlotTime(input.slotTime);
  if (!slotTime) {
    return {
      allowed: false,
      status: 400,
      code: "invalid_slot_time",
      message: "Invalid slot time format.",
      policy: buildPolicy("basic"),
      usage: {
        total_slots_used: 0,
        custom_slots_used: 0,
        matchindeed_slots_used: 0,
        month_start: new Date().toISOString(),
        month_end: new Date().toISOString(),
      },
      normalizedSlotTime: "00:00:00",
    };
  }

  const slotDate = input.slotDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate)) {
    return {
      allowed: false,
      status: 400,
      code: "invalid_slot_date",
      message: "Invalid slot date format.",
      policy: buildPolicy("basic"),
      usage: {
        total_slots_used: 0,
        custom_slots_used: 0,
        matchindeed_slots_used: 0,
        month_start: new Date().toISOString(),
        month_end: new Date().toISOString(),
      },
      normalizedSlotTime: slotTime,
    };
  }

  const policy = await getCalendarSlotPolicy(supabase, userId, explicitTier);
  const usage = await getCalendarSlotUsageForMonth(supabase, userId, slotDate);
  const activeWindow = await getActiveSubscriptionWindow(supabase, userId);

  const now = new Date();
  const selectedDate = new Date(`${slotDate}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { maxSelectableDate } = getSlotUsageRange(slotDate, activeWindow);
  const minScheduledAt = getMinSlotCreationDate(now);
  const selectedScheduledAt = input.scheduledAtIso
    ? new Date(input.scheduledAtIso)
    : new Date(`${slotDate}T${slotTime}`);

  if (selectedDate < today) {
    return {
      allowed: false,
      status: 400,
      code: "past_date",
      message: "Cannot create availability for a past date.",
      policy,
      usage,
      normalizedSlotTime: slotTime,
    };
  }

  if (
    Number.isNaN(selectedScheduledAt.getTime()) ||
    selectedScheduledAt < minScheduledAt
  ) {
    return {
      allowed: false,
      status: 400,
      code: "slot_too_soon",
      message: `Availability must be scheduled at least ${MIN_SLOT_LEAD_TIME_HOURS} hours in advance.`,
      policy,
      usage,
      normalizedSlotTime: slotTime,
    };
  }

  if (selectedDate > maxSelectableDate) {
    return {
      allowed: false,
      status: 400,
      code: "outside_subscription_window",
      message: `Availability can only be created within the next ${MAX_SLOT_WINDOW_DAYS} days of your active subscription cycle.`,
      policy,
      usage,
      normalizedSlotTime: slotTime,
    };
  }

  let existingSlotQuery = supabase
    .from("meeting_availability")
    .select("id")
    .eq("user_id", userId);

  if (input.scheduledAtIso) {
    existingSlotQuery = existingSlotQuery.eq(
      "scheduled_at_utc",
      input.scheduledAtIso
    );
  } else {
    existingSlotQuery = existingSlotQuery
      .eq("slot_date", slotDate)
      .eq("slot_time", slotTime);
  }

  const { data: existingSlot, error: existingSlotError } =
    await existingSlotQuery.maybeSingle();

  if (existingSlotError) {
    throw existingSlotError;
  }

  if (existingSlot) {
    return {
      allowed: false,
      status: 409,
      code: "duplicate_slot",
      message: "This time slot already exists on your calendar.",
      policy,
      usage,
      normalizedSlotTime: slotTime,
    };
  }

  if (input.source === "self_customized" && policy.customized_slots <= 0) {
    return {
      allowed: false,
      status: 403,
      code: "custom_slots_not_allowed",
      message:
        "Your current plan does not include custom slots. You can still create one using credits while your subscription is active.",
      policy,
      usage,
      normalizedSlotTime: slotTime,
    };
  }

  if (usage.total_slots_used >= policy.max_outgoing_slots) {
    return {
      allowed: false,
      status: 403,
      code: "max_slots_reached",
      message: `You have used all ${policy.max_outgoing_slots} included slots for your current subscription cycle. You can create another slot using credits while your subscription is active.`,
      policy,
      usage,
      normalizedSlotTime: slotTime,
    };
  }

  if (
    input.source === "self_customized" &&
    usage.custom_slots_used >= policy.customized_slots
  ) {
    return {
      allowed: false,
      status: 403,
      code: "max_custom_slots_reached",
      message: `You have used all ${policy.customized_slots} included custom slots for your current subscription cycle. You can create another slot using credits while your subscription is active.`,
      policy,
      usage,
      normalizedSlotTime: slotTime,
    };
  }

  return {
    allowed: true,
    status: 200,
    policy,
    usage,
    normalizedSlotTime: slotTime,
  };
}

export async function getUserTier(
  supabase: SupabaseClient,
  userId: string
): Promise<TierId> {
  const { data } = await supabase
    .from("accounts")
    .select("tier")
    .eq("id", userId)
    .single();
  return normalizeTier(data?.tier || "basic");
}
