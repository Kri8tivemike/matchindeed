import type { SupabaseClient } from "@supabase/supabase-js";
import { refundConsumedCredits } from "@/lib/credits/actions";
import {
  getCalendarSlotPolicy,
  getCalendarSlotUsageForMonth,
  getCreditBackedCustomSlotCount,
  getUserTier,
  MIN_SLOT_LEAD_TIME_HOURS,
} from "@/lib/calendar/slot-allocation";
import { restoreCreditLockedProfileIfEligible } from "@/lib/profile/credit-lock";

type ExpiredAvailabilitySlot = {
  id: string;
  user_id: string;
  slot_date: string;
  slot_time: string;
  scheduled_at_utc: string | null;
  source: "self_customized" | "matchindeed";
};

type ExpiredSlotRefundDependencies = {
  refundConsumedCreditsFn?: typeof refundConsumedCredits;
  now?: Date;
  userId?: string;
};

const CUSTOM_SLOT_CREDIT_COST_BY_TIER: Record<string, number> = {
  basic: 4,
  standard: 6,
  premium: 8,
  vip: 10,
};

function getCustomSlotCreditCost(tier: string) {
  return CUSTOM_SLOT_CREDIT_COST_BY_TIER[tier] || 1;
}

async function hasAnyMeetingRequestForSlot(
  supabase: SupabaseClient,
  slot: ExpiredAvailabilitySlot
) {
  if (!slot.scheduled_at_utc) {
    return true;
  }

  const { data, error } = await supabase
    .from("meetings")
    .select("id")
    .eq("host_id", slot.user_id)
    .eq("scheduled_at", slot.scheduled_at_utc)
    .limit(1);

  if (error) {
    throw error;
  }

  return Boolean(data && data.length > 0);
}

export async function refundExpiredUnusedCreditBackedSlots(
  supabase: SupabaseClient,
  deps: ExpiredSlotRefundDependencies = {}
) {
  const refundConsumedCreditsFn =
    deps.refundConsumedCreditsFn || refundConsumedCredits;
  const now = deps.now || new Date();
  const cutoffIso = new Date(
    now.getTime() + MIN_SLOT_LEAD_TIME_HOURS * 60 * 60 * 1000
  ).toISOString();

  let query = supabase
    .from("meeting_availability")
    .select("id, user_id, slot_date, slot_time, scheduled_at_utc, source")
    .eq("source", "self_customized")
    .not("scheduled_at_utc", "is", null)
    .lt("scheduled_at_utc", cutoffIso)
    .order("scheduled_at_utc", { ascending: true })
    .limit(200);

  if (deps.userId) {
    query = query.eq("user_id", deps.userId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const slots = (data || []) as ExpiredAvailabilitySlot[];
  let removedCount = 0;
  let refundedCount = 0;
  let refundedCredits = 0;
  const refundedSlotIds: string[] = [];

  for (const slot of slots) {
    if (await hasAnyMeetingRequestForSlot(supabase, slot)) {
      continue;
    }

    const tier = await getUserTier(supabase, slot.user_id);
    const policy = await getCalendarSlotPolicy(supabase, slot.user_id, tier);
    const usageBeforeDelete = await getCalendarSlotUsageForMonth(
      supabase,
      slot.user_id,
      slot.slot_date
    );
    const creditBackedSlotsBeforeDelete = getCreditBackedCustomSlotCount(
      policy,
      usageBeforeDelete
    );

    const { error: deleteError } = await supabase
      .from("meeting_availability")
      .delete()
      .eq("id", slot.id)
      .eq("user_id", slot.user_id);

    if (deleteError) {
      throw deleteError;
    }

    removedCount += 1;

    const usageAfterDelete = await getCalendarSlotUsageForMonth(
      supabase,
      slot.user_id,
      slot.slot_date
    );
    const creditBackedSlotsAfterDelete = getCreditBackedCustomSlotCount(
      policy,
      usageAfterDelete
    );
    const shouldRefundCredit =
      creditBackedSlotsAfterDelete < creditBackedSlotsBeforeDelete;

    if (!shouldRefundCredit) {
      continue;
    }

    const creditCost = getCustomSlotCreditCost(tier);
    await refundConsumedCreditsFn(supabase, slot.user_id, creditCost, {
      actionType: "calendar_unused_slot_refund",
      description: `Refunded ${creditCost} credit${creditCost === 1 ? "" : "s"} because the availability slot on ${slot.slot_date} at ${slot.slot_time.slice(0, 5)} reached the 48-hour request cutoff without any meeting request.`,
    });

    refundedCount += 1;
    refundedCredits += creditCost;
    refundedSlotIds.push(slot.id);

    await restoreCreditLockedProfileIfEligible(supabase, slot.user_id);
  }

  return {
    removedCount,
    refundedCount,
    refundedCredits,
    refundedSlotIds,
  };
}
