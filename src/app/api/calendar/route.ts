import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  consumeCredits,
  getAvailableCredits,
  refundConsumedCredits,
} from "@/lib/credits/actions";
import { validateMeetingsAccess } from "@/middleware/subscription-check";
import {
  getMaxSlotCreationDateKey,
  getActiveSubscriptionWindow,
  doesNextCustomSlotUseCredits,
  getCalendarSlotPolicy,
  getCalendarSlotUsageForMonth,
  getCreditBackedCustomSlotCount,
  getMaxSlotCreationDateKeyForWindow,
  getRollingSlotWindowDays,
  getRemainingSlotWindowDays,
  getRemainingIncludedCustomSlots,
  getUserTier,
  isUnlimitedSlotCount,
  normalizeSlotTime,
  validateSlotCreation,
} from "@/lib/calendar/slot-allocation";
import {
  getDateKeyInTimeZone,
  getSafeTimeZone,
  getTimeValueInTimeZone,
  isValidTimeZone,
  toScheduledAtIso,
} from "@/lib/timezones";
import {
  bindStarterTrialSlot,
  clearStarterTrialSlot,
  getStarterTrialState,
  type StarterTrialState,
  validateStarterTrialSlotCreation,
} from "@/lib/starter-trial";
import { refundExpiredUnusedCreditBackedSlots } from "@/lib/calendar/unused-slot-refunds";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AvailabilityRow = {
  id: string;
  user_id: string;
  slot_date: string;
  slot_time: string;
  scheduled_at_utc?: string | null;
  source: "self_customized" | "matchindeed";
  created_at: string;
};

type AvailabilityResponseRow = AvailabilityRow & {
  scheduled_at: string | null;
};

type CalendarConfigurationRow = {
  timezone: string | null;
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

function isCreditEligibleCustomSlotError(code?: string) {
  return (
    code === "max_custom_slots_reached" ||
    code === "custom_slots_not_allowed" ||
    code === "max_slots_reached"
  );
}

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

function formatAvailabilityRow(
  slot: AvailabilityRow,
  timeZone: string
): AvailabilityResponseRow {
  const scheduledAt =
    slot.scheduled_at_utc ||
    toScheduledAtIso(slot.slot_date, slot.slot_time, timeZone);

  return {
    ...slot,
    slot_date: scheduledAt
      ? getDateKeyInTimeZone(scheduledAt, timeZone)
      : slot.slot_date,
    slot_time: scheduledAt
      ? getTimeValueInTimeZone(scheduledAt, timeZone, true)
      : normalizeSlotTime(slot.slot_time) || slot.slot_time,
    scheduled_at: scheduledAt,
  };
}

function getStarterTrialCalendarFlags(
  starterTrial: StarterTrialState,
  baseFlags: {
    creditsExhausted: boolean;
    creditLockRequired: boolean;
    nextCustomSlotUsesCredits: boolean;
    includedCustomSlotsRemaining: number | null;
  }
) {
  if (starterTrial.eligible && !starterTrial.consumed) {
    return {
      creditsExhausted: false,
      creditLockRequired: false,
      nextCustomSlotUsesCredits: false,
      includedCustomSlotsRemaining: starterTrial.remaining_slots,
    };
  }

  if (starterTrial.upgrade_required) {
    return {
      creditsExhausted: false,
      creditLockRequired: false,
      nextCustomSlotUsesCredits: false,
      includedCustomSlotsRemaining: 0,
    };
  }

  return baseFlags;
}

/**
 * GET /api/calendar
 * Returns authenticated user's calendar slots + tier policy + current subscription-cycle usage.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await refundExpiredUnusedCreditBackedSlots(supabase, { userId: user.id });

    const month = request.nextUrl.searchParams.get("month");
    const usageDate =
      month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : new Date().toISOString().slice(0, 10);

    const tier = await getUserTier(supabase, user.id);
    const activeWindow = await getActiveSubscriptionWindow(supabase, user.id);
    const policy = await getCalendarSlotPolicy(supabase, user.id, tier);
    const usage = await getCalendarSlotUsageForMonth(supabase, user.id, usageDate);
    const starterTrial = await getStarterTrialState(supabase, user.id, {
      verifyActiveSlot: true,
    });
    const customSlotCreditCost = getCustomSlotCreditCost(tier);

    const { data: slots, error: slotsError } = await supabase
      .from("meeting_availability")
      .select("id, user_id, slot_date, slot_time, scheduled_at_utc, source, created_at")
      .eq("user_id", user.id)
      .order("scheduled_at_utc", { ascending: true, nullsFirst: false })
      .order("slot_date", { ascending: true })
      .order("slot_time", { ascending: true });

    if (slotsError) {
      return NextResponse.json(
        { error: "Failed to fetch calendar slots" },
        { status: 500 }
      );
    }

    const { data: credits } = await supabase
      .from("credits")
      .select("total, used, rollover")
      .eq("user_id", user.id)
      .maybeSingle();
    const creditsRemaining = getAvailableCredits({
      total: credits?.total || 0,
      used: credits?.used || 0,
      rollover: credits?.rollover || 0,
    });
    const nextCustomSlotUsesCredits = doesNextCustomSlotUseCredits(policy, usage);
    const includedCustomSlotsRemaining = isUnlimitedSlotCount(policy.customized_slots)
      ? null
      : getRemainingIncludedCustomSlots(policy, usage);
    const starterTrialFlags = getStarterTrialCalendarFlags(starterTrial, {
      creditsExhausted:
        nextCustomSlotUsesCredits && creditsRemaining < customSlotCreditCost,
      creditLockRequired:
        nextCustomSlotUsesCredits && creditsRemaining <= 0,
      nextCustomSlotUsesCredits,
      includedCustomSlotsRemaining,
    });
    const starterTrialWindowActive =
      starterTrial.eligible && !starterTrial.upgrade_required;

    const { data: account } = await supabase
      .from("accounts")
      .select("calendar_enabled")
      .eq("id", user.id)
      .maybeSingle();

    const { data: calendarConfig } = await supabase
      .from("calendar_configurations")
      .select("timezone")
      .eq("user_id", user.id)
      .maybeSingle();

    const timeZone =
      (calendarConfig as CalendarConfigurationRow | null)?.timezone || "UTC";

    return NextResponse.json({
      slots: ((slots || []) as AvailabilityRow[]).map((slot) =>
        formatAvailabilityRow(slot, timeZone)
      ),
      tier_config: policy,
      usage,
      credits_remaining: creditsRemaining,
      credits_exhausted: starterTrialFlags.creditsExhausted,
      credit_lock_required: starterTrialFlags.creditLockRequired,
      custom_slot_credit_cost: customSlotCreditCost,
      next_custom_slot_uses_credits: starterTrialFlags.nextCustomSlotUsesCredits,
      included_custom_slots_remaining:
        starterTrialFlags.includedCustomSlotsRemaining,
      calendar_enabled: account?.calendar_enabled ?? true,
      timezone: timeZone,
      slot_window_days: starterTrialWindowActive
        ? getRollingSlotWindowDays()
        : getRemainingSlotWindowDays(activeWindow),
      max_slot_date: starterTrialWindowActive
        ? getMaxSlotCreationDateKey()
        : getMaxSlotCreationDateKeyForWindow(activeWindow),
      starter_trial: starterTrial,
    });
  } catch (error) {
    console.error("Error in GET /api/calendar:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/calendar
 * Adds an availability slot for authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const slotDate = String(body.slot_date || "").trim();
    const slotTime = String(body.slot_time || "").trim();
    const source =
      body.source === "matchindeed" ? "matchindeed" : "self_customized";

    if (!slotDate || !slotTime) {
      return NextResponse.json(
        { error: "slot_date and slot_time are required" },
        { status: 400 }
      );
    }

    const tier = await getUserTier(supabase, user.id);
    const policy = await getCalendarSlotPolicy(supabase, user.id, tier);
    const { data: calendarConfig } = await supabase
      .from("calendar_configurations")
      .select("timezone")
      .eq("user_id", user.id)
      .maybeSingle();
    const timeZone =
      (calendarConfig as CalendarConfigurationRow | null)?.timezone || "UTC";
    const normalizedSlotTime = normalizeSlotTime(slotTime);
    const scheduledAtIso =
      normalizedSlotTime && toScheduledAtIso(slotDate, normalizedSlotTime, timeZone);
    const customSlotCreditCost = getCustomSlotCreditCost(tier);
    let creditsRemaining = Number.POSITIVE_INFINITY;
    const access = await validateMeetingsAccess(user.id);
    const starterTrialState = await getStarterTrialState(supabase, user.id, {
      verifyActiveSlot: true,
    });
    const canUseStarterTrial = !access.allowed && starterTrialState.eligible;

    const { data: credits } = await supabase
      .from("credits")
      .select("total, used, rollover")
      .eq("user_id", user.id)
      .maybeSingle();
    creditsRemaining = getAvailableCredits({
      total: credits?.total || 0,
      used: credits?.used || 0,
      rollover: credits?.rollover || 0,
    });

    if (!access.allowed && !canUseStarterTrial) {
      if (starterTrialState.upgrade_required) {
        return NextResponse.json(
          {
            error: "starter_trial_exhausted",
            message:
              "Your free starter slot has already been used. Subscribe to create more availability and accept new bookings.",
            requires_upgrade: true,
            starter_trial: starterTrialState,
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        {
          error: "access_denied",
          message: access.message,
          starter_trial: starterTrialState,
        },
        { status: 403 }
      );
    }

    if (canUseStarterTrial) {
      const starterValidation = await validateStarterTrialSlotCreation({
        supabase,
        userId: user.id,
        slotDate,
        slotTime,
        source,
        state: starterTrialState,
      });

      if (!starterValidation.allowed) {
        return NextResponse.json(
          {
            error: starterValidation.code || "starter_trial_unavailable",
            message: starterValidation.message || "Starter slot creation failed.",
            requires_upgrade: starterValidation.code === "starter_trial_exhausted",
            starter_trial: starterTrialState,
          },
          { status: starterValidation.status }
        );
      }

      const { data: slot, error: slotError } = await supabase
        .from("meeting_availability")
        .insert({
          user_id: user.id,
          slot_date: slotDate,
          slot_time: starterValidation.normalizedSlotTime,
          scheduled_at_utc: starterValidation.scheduledAtIso,
          source,
        })
        .select("id, user_id, slot_date, slot_time, scheduled_at_utc, source, created_at")
        .single();

      if (slotError || !slot) {
        console.error("Error creating starter availability slot:", slotError);
        return NextResponse.json(
          { error: "Failed to create availability slot" },
          { status: 500 }
        );
      }

      const bindResult = await bindStarterTrialSlot(supabase, user.id, slot.id);
      if (bindResult.error) {
        await supabase.from("meeting_availability").delete().eq("id", slot.id);
        console.error("Error binding starter slot:", bindResult.error);
        return NextResponse.json(
          { error: "Failed to activate starter slot" },
          { status: 500 }
        );
      }

      const updatedUsage = await getCalendarSlotUsageForMonth(
        supabase,
        user.id,
        slotDate
      );
      const updatedStarterTrial = await getStarterTrialState(supabase, user.id, {
        verifyActiveSlot: true,
      });

      return NextResponse.json(
        {
          slot: formatAvailabilityRow(slot as AvailabilityRow, timeZone),
          tier_config: policy,
          usage: updatedUsage,
          charged_credit: false,
          custom_slot_credit_cost: 0,
          credits_remaining: creditsRemaining,
          credits_exhausted: false,
          credit_lock_required: false,
          next_custom_slot_uses_credits: false,
          included_custom_slots_remaining: updatedStarterTrial.remaining_slots,
          starter_trial: updatedStarterTrial,
          message:
            "Your free starter slot is live. Other users can now request it, and you can accept one booking before subscribing.",
        },
        { status: 201 }
      );
    }

    const validation = await validateSlotCreation(
      supabase,
      user.id,
      { slotDate, slotTime, source, scheduledAtIso },
      tier
    );
    const requiresCreditBackedCustomSlot =
      source === "self_customized" &&
      (validation.allowed
        ? doesNextCustomSlotUseCredits(validation.policy, validation.usage)
        : isCreditEligibleCustomSlotError(validation.code));
    const allowExtraCustomSlotWithCredits =
      !validation.allowed &&
      source === "self_customized" &&
      isCreditEligibleCustomSlotError(validation.code) &&
      creditsRemaining >= customSlotCreditCost;
    const shouldChargeCredit =
      source === "self_customized" && requiresCreditBackedCustomSlot;

    if (!validation.allowed && !allowExtraCustomSlotWithCredits) {
      if (requiresCreditBackedCustomSlot) {
        return NextResponse.json(
          {
            error: "credits_exhausted",
            message: `You have used your included slot allowance for this subscription cycle. You need at least ${customSlotCreditCost} available credit${customSlotCreditCost === 1 ? "" : "s"} to create another slot while your ${tier} subscription is active.`,
            credits_remaining: creditsRemaining,
            custom_slot_credit_cost: customSlotCreditCost,
            next_custom_slot_uses_credits: true,
            included_custom_slots_remaining: getRemainingIncludedCustomSlots(
              validation.policy,
              validation.usage
            ),
            tier_config: validation.policy,
            usage: validation.usage,
          },
          { status: 402 }
        );
      }

      return NextResponse.json(
        {
          error: validation.code || "slot_not_allowed",
          message: validation.message || "Slot creation failed.",
          tier_config: validation.policy,
          usage: validation.usage,
        },
        { status: validation.status }
      );
    }

    if (shouldChargeCredit && creditsRemaining < customSlotCreditCost) {
      return NextResponse.json(
        {
          error: "credits_exhausted",
          message: `You have used your included slot allowance for this subscription cycle. You need at least ${customSlotCreditCost} available credit${customSlotCreditCost === 1 ? "" : "s"} to create another slot while your ${tier} subscription is active.`,
          credits_remaining: creditsRemaining,
          custom_slot_credit_cost: customSlotCreditCost,
          next_custom_slot_uses_credits: true,
          included_custom_slots_remaining: getRemainingIncludedCustomSlots(
            validation.policy,
            validation.usage
          ),
        },
        { status: 402 }
      );
    }

    const { data: slot, error: slotError } = await supabase
      .from("meeting_availability")
      .insert({
        user_id: user.id,
        slot_date: slotDate,
        slot_time: validation.normalizedSlotTime,
        scheduled_at_utc: scheduledAtIso,
        source,
      })
      .select("id, user_id, slot_date, slot_time, scheduled_at_utc, source, created_at")
      .single();

    if (slotError || !slot) {
      console.error("Error creating availability slot:", slotError);
      return NextResponse.json(
        { error: "Failed to create availability slot" },
        { status: 500 }
      );
    }

    let chargedCredit = false;
    let updatedCreditsRemaining = creditsRemaining;

    if (shouldChargeCredit) {
      const description =
        !validation.allowed && isCreditEligibleCustomSlotError(validation.code)
          ? `Credit-backed calendar slot for ${slotDate} at ${validation.normalizedSlotTime.slice(0, 5)} after the included slot allowance for this subscription cycle was exhausted.`
          : `Custom calendar slot for ${slotDate} at ${validation.normalizedSlotTime.slice(0, 5)}.`;

      const consumption = await consumeCredits(
        supabase,
        user.id,
        customSlotCreditCost,
        {
          actionType: "calendar_custom_slot",
          description,
        }
      );

      if (!consumption.success) {
        await supabase.from("meeting_availability").delete().eq("id", slot.id);
        return NextResponse.json(
          {
            error: "credits_exhausted",
            message: `You have used your included slot allowance for this subscription cycle. You need at least ${customSlotCreditCost} available credit${customSlotCreditCost === 1 ? "" : "s"} to create another slot while your ${tier} subscription is active.`,
            credits_remaining: consumption.available,
            custom_slot_credit_cost: customSlotCreditCost,
          },
          { status: 402 }
        );
      }

      chargedCredit = true;
      updatedCreditsRemaining = Math.max(creditsRemaining - customSlotCreditCost, 0);
    }

    const updatedUsage = await getCalendarSlotUsageForMonth(
      supabase,
      user.id,
      slotDate
    );

    const nextCustomSlotUsesCredits = doesNextCustomSlotUseCredits(
      validation.policy,
      updatedUsage
    );
    const includedCustomSlotsRemaining = isUnlimitedSlotCount(
      validation.policy.customized_slots
    )
      ? null
      : getRemainingIncludedCustomSlots(validation.policy, updatedUsage);

    const responseMessage = chargedCredit
      ? `Availability slot added using ${customSlotCreditCost} credit${customSlotCreditCost === 1 ? "" : "s"} after your included slot allowance for this subscription cycle was used.`
      : "Custom slot added using your included slot allowance for this subscription cycle.";

    return NextResponse.json(
      {
        slot: formatAvailabilityRow(slot as AvailabilityRow, timeZone),
        tier_config: validation.policy,
        usage: updatedUsage,
        charged_credit: chargedCredit,
        custom_slot_credit_cost: chargedCredit ? customSlotCreditCost : 0,
        credits_remaining: updatedCreditsRemaining,
        credits_exhausted:
          nextCustomSlotUsesCredits &&
          updatedCreditsRemaining < customSlotCreditCost,
        credit_lock_required:
          nextCustomSlotUsesCredits &&
          updatedCreditsRemaining <= 0,
        next_custom_slot_uses_credits: nextCustomSlotUsesCredits,
        included_custom_slots_remaining: includedCustomSlotsRemaining,
        starter_trial: starterTrialState,
        message: responseMessage,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/calendar:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/calendar
 * Updates calendar configuration values such as timezone.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const timezone = String(body.timezone || "").trim();

    if (!timezone) {
      return NextResponse.json(
        { error: "timezone is required" },
        { status: 400 }
      );
    }

    if (!isValidTimeZone(timezone)) {
      return NextResponse.json(
        { error: "Please select a valid timezone." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("calendar_configurations")
      .upsert(
        {
          user_id: user.id,
          timezone,
        },
        { onConflict: "user_id" }
      )
      .select("timezone")
      .single();

    if (error) {
      console.error("Error updating calendar timezone:", error);
      return NextResponse.json(
        { error: "Failed to update calendar timezone" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      timezone:
        (data as CalendarConfigurationRow | null)?.timezone || timezone,
    });
  } catch (error) {
    console.error("Error in PATCH /api/calendar:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/calendar?slot_id=<uuid>
 * Removes an availability slot if it is not already booked.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const slotId =
      request.nextUrl.searchParams.get("slot_id") ||
      String((await request.json().catch(() => ({}))).slot_id || "");

    if (!slotId) {
      return NextResponse.json({ error: "slot_id is required" }, { status: 400 });
    }

    const { data: slot, error: slotError } = await supabase
      .from("meeting_availability")
      .select("id, user_id, slot_date, slot_time, scheduled_at_utc, source")
      .eq("id", slotId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (slotError) {
      console.error("Error fetching slot:", slotError);
      return NextResponse.json({ error: "Failed to fetch slot" }, { status: 500 });
    }

    if (!slot) {
      return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    }

    const tier = await getUserTier(supabase, user.id);
    const policy = await getCalendarSlotPolicy(supabase, user.id, tier);
    const starterTrialStateBeforeDelete = await getStarterTrialState(
      supabase,
      user.id,
      { verifyActiveSlot: true }
    );
    const isStarterTrialSlot =
      starterTrialStateBeforeDelete.active_slot_id === slotId;
    const customSlotCreditCost = getCustomSlotCreditCost(tier);
    const usageBeforeDelete = await getCalendarSlotUsageForMonth(
      supabase,
      user.id,
      slot.slot_date
    );
    const creditBackedSlotsBeforeDelete = getCreditBackedCustomSlotCount(
      policy,
      usageBeforeDelete
    );

    let scheduledAtIso = slot.scheduled_at_utc || null;
    if (!scheduledAtIso) {
      const { data: calendarConfig } = await supabase
        .from("calendar_configurations")
        .select("timezone")
        .eq("user_id", user.id)
        .maybeSingle();

      scheduledAtIso = toScheduledAtIso(
        slot.slot_date,
        slot.slot_time,
        getSafeTimeZone(calendarConfig?.timezone)
      );
    }

    if (!scheduledAtIso) {
      return NextResponse.json(
        { error: "Failed to interpret slot time" },
        { status: 400 }
      );
    }

    const { data: existingMeetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id, status")
      .eq("host_id", user.id)
      .eq("scheduled_at", scheduledAtIso)
      .limit(50);

    if (meetingsError) {
      console.error("Error checking slot bookings:", meetingsError);
      return NextResponse.json(
        { error: "Failed to validate slot booking status" },
        { status: 500 }
      );
    }

    const activeMeetings = (existingMeetings || []).filter((meeting) =>
      ["pending", "confirmed"].includes(String(meeting.status || ""))
    );
    const hasEverBeenRequested = (existingMeetings || []).length > 0;

    if (activeMeetings.length > 0) {
      return NextResponse.json(
        {
          error: "slot_booked",
          message:
            "This slot already has active meeting bookings and cannot be removed.",
        },
        { status: 409 }
      );
    }

    const { error: deleteError } = await supabase
      .from("meeting_availability")
      .delete()
      .eq("id", slotId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting slot:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete slot" },
        { status: 500 }
      );
    }

    const clearStarterTrialResult = await clearStarterTrialSlot(
      supabase,
      user.id,
      slotId
    );

    if (clearStarterTrialResult.error) {
      console.error(
        "Error clearing starter slot binding after delete:",
        clearStarterTrialResult.error
      );
      return NextResponse.json(
        { error: "Failed to finalize slot deletion" },
        { status: 500 }
      );
    }

    const usageAfterDelete = await getCalendarSlotUsageForMonth(
      supabase,
      user.id,
      slot.slot_date
    );
    const creditBackedSlotsAfterDelete = getCreditBackedCustomSlotCount(
      policy,
      usageAfterDelete
    );

    const shouldRefundCredit =
      !isStarterTrialSlot &&
      !hasEverBeenRequested &&
      creditBackedSlotsAfterDelete < creditBackedSlotsBeforeDelete;

    if (shouldRefundCredit) {
      await refundConsumedCredits(supabase, user.id, customSlotCreditCost, {
        actionType: "calendar_custom_slot_refund",
        description: `Refunded ${customSlotCreditCost} credit${customSlotCreditCost === 1 ? "" : "s"} after removing the availability slot on ${slot.slot_date} at ${slot.slot_time.slice(0, 5)}.`,
      });
    }

    const { data: credits } = await supabase
      .from("credits")
      .select("total, used, rollover")
      .eq("user_id", user.id)
      .maybeSingle();
    const creditsRemaining = getAvailableCredits({
      total: credits?.total || 0,
      used: credits?.used || 0,
      rollover: credits?.rollover || 0,
    });
    const starterTrialState = await getStarterTrialState(supabase, user.id, {
      verifyActiveSlot: true,
    });
    const starterTrialFlags = getStarterTrialCalendarFlags(starterTrialState, {
      creditsExhausted:
        doesNextCustomSlotUseCredits(policy, usageAfterDelete) &&
        creditsRemaining < customSlotCreditCost,
      creditLockRequired:
        doesNextCustomSlotUseCredits(policy, usageAfterDelete) &&
        creditsRemaining <= 0,
      nextCustomSlotUsesCredits: doesNextCustomSlotUseCredits(policy, usageAfterDelete),
      includedCustomSlotsRemaining: isUnlimitedSlotCount(policy.customized_slots)
        ? null
        : getRemainingIncludedCustomSlots(policy, usageAfterDelete),
    });

    return NextResponse.json({
      success: true,
      slot_id: slotId,
      usage: usageAfterDelete,
      tier_config: policy,
      credit_refunded: shouldRefundCredit,
      refunded_credit_amount: shouldRefundCredit ? customSlotCreditCost : 0,
      credits_remaining: creditsRemaining,
      credits_exhausted: starterTrialFlags.creditsExhausted,
      credit_lock_required: starterTrialFlags.creditLockRequired,
      next_custom_slot_uses_credits:
        starterTrialFlags.nextCustomSlotUsesCredits,
      included_custom_slots_remaining:
        starterTrialFlags.includedCustomSlotsRemaining,
      starter_trial: starterTrialState,
      message: shouldRefundCredit
        ? `Slot removed. ${customSlotCreditCost} credit${customSlotCreditCost === 1 ? "" : "s"} returned to your balance.`
        : isStarterTrialSlot && !starterTrialState.has_active_slot
          ? "Your free plan have been returned"
          : starterTrialState.eligible && !starterTrialState.has_active_slot
          ? "Starter slot removed. You can create another free starter slot until it is booked."
          : "Slot removed.",
    });
  } catch (error) {
    console.error("Error in DELETE /api/calendar:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
