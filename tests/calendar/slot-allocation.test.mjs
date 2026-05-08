import test from "node:test";
import assert from "node:assert/strict";
import {
  doesNextCustomSlotUseCredits,
  getCreditBackedCustomSlotCount,
  getMaxSlotCreationDate,
  getMinSlotCreationDate,
  getMinSlotCreationDateKey,
  getRollingSlotWindowDays,
  getSlotUsageRange,
  MIN_SLOT_LEAD_TIME_HOURS,
} from "../../src/lib/calendar/slot-allocation.ts";

test("doesNextCustomSlotUseCredits returns false while included monthly and custom allowances remain", () => {
  const result = doesNextCustomSlotUseCredits(
    {
      tier: "standard",
      monthly_outgoing_credits: 10,
      max_outgoing_slots: 15,
      customized_slots: 5,
      matchindeed_slots: 10,
      credit_rollover: true,
      simultaneous_bookings_limit: 1,
      allow_multibooking: false,
    },
    {
      total_slots_used: 4,
      custom_slots_used: 2,
      matchindeed_slots_used: 2,
      month_start: "2026-03-01T00:00:00.000Z",
      month_end: "2026-04-01T00:00:00.000Z",
    }
  );

  assert.equal(result, false);
});

test("doesNextCustomSlotUseCredits returns true once the included monthly slot allowance is exhausted", () => {
  const result = doesNextCustomSlotUseCredits(
    {
      tier: "standard",
      monthly_outgoing_credits: 10,
      max_outgoing_slots: 15,
      customized_slots: 5,
      matchindeed_slots: 10,
      credit_rollover: true,
      simultaneous_bookings_limit: 1,
      allow_multibooking: false,
    },
    {
      total_slots_used: 15,
      custom_slots_used: 5,
      matchindeed_slots_used: 10,
      month_start: "2026-03-01T00:00:00.000Z",
      month_end: "2026-04-01T00:00:00.000Z",
    }
  );

  assert.equal(result, true);
});

test("doesNextCustomSlotUseCredits returns true for plans with no included custom slots", () => {
  const result = doesNextCustomSlotUseCredits(
    {
      tier: "basic",
      monthly_outgoing_credits: 5,
      max_outgoing_slots: 5,
      customized_slots: 0,
      matchindeed_slots: 5,
      credit_rollover: false,
      simultaneous_bookings_limit: 1,
      allow_multibooking: false,
    },
    {
      total_slots_used: 0,
      custom_slots_used: 0,
      matchindeed_slots_used: 0,
      month_start: "2026-03-01T00:00:00.000Z",
      month_end: "2026-04-01T00:00:00.000Z",
    }
  );

  assert.equal(result, true);
});

test("getSlotUsageRange uses the active subscription cycle instead of the calendar month", () => {
  const { rangeStart, rangeEndExclusive, maxSelectableDate } = getSlotUsageRange(
    "2026-04-02",
    {
      starts_at: "2026-03-25T09:00:00.000Z",
      expires_at: "2026-04-23T09:00:00.000Z",
    }
  );

  assert.equal(rangeStart.toISOString(), "2026-03-25T00:00:00.000Z");
  assert.equal(rangeEndExclusive.toISOString(), "2026-04-24T00:00:00.000Z");
  assert.equal(maxSelectableDate.toISOString(), "2026-04-23T00:00:00.000Z");
});

test("free starter trial uses a rolling 30-day window instead of month end", () => {
  const referenceDate = new Date(2026, 3, 16, 12, 0, 0);
  const maxSelectableDate = getMaxSlotCreationDate(referenceDate);

  assert.equal(getRollingSlotWindowDays(referenceDate), 30);
  assert.equal(maxSelectableDate.getMonth(), 4);
  assert.equal(maxSelectableDate.getDate(), 15);
});

test("minimum slot creation date starts 48 hours after the current time", () => {
  const referenceDate = new Date("2026-04-28T13:22:00.000Z");
  const minimumDate = getMinSlotCreationDate(referenceDate);

  assert.equal(MIN_SLOT_LEAD_TIME_HOURS, 48);
  assert.equal(minimumDate.toISOString(), "2026-04-30T13:22:00.000Z");
  assert.equal(getMinSlotCreationDateKey(referenceDate), "2026-04-30");
});

test("getCreditBackedCustomSlotCount counts extra custom slots beyond the included custom allowance", () => {
  const result = getCreditBackedCustomSlotCount(
    {
      tier: "standard",
      monthly_outgoing_credits: 10,
      max_outgoing_slots: 15,
      customized_slots: 5,
      matchindeed_slots: 10,
      credit_rollover: true,
      simultaneous_bookings_limit: 1,
      allow_multibooking: false,
    },
    {
      total_slots_used: 6,
      custom_slots_used: 6,
      matchindeed_slots_used: 0,
      month_start: "2026-03-25T00:00:00.000Z",
      month_end: "2026-04-24T00:00:00.000Z",
    }
  );

  assert.equal(result, 1);
});

test("getCreditBackedCustomSlotCount counts custom slots pushed over the total slot cap by matchindeed slots", () => {
  const result = getCreditBackedCustomSlotCount(
    {
      tier: "standard",
      monthly_outgoing_credits: 10,
      max_outgoing_slots: 15,
      customized_slots: 5,
      matchindeed_slots: 10,
      credit_rollover: true,
      simultaneous_bookings_limit: 1,
      allow_multibooking: false,
    },
    {
      total_slots_used: 16,
      custom_slots_used: 5,
      matchindeed_slots_used: 11,
      month_start: "2026-03-25T00:00:00.000Z",
      month_end: "2026-04-24T00:00:00.000Z",
    }
  );

  assert.equal(result, 1);
});
