import test from "node:test";
import assert from "node:assert/strict";

import {
  getMinimumRequestableMeetingStartDate,
  getMinimumRequestableMeetingStartIso,
  MEETING_REQUEST_LEAD_TIME_HOURS,
  NO_ACTIVE_MEETING_AVAILABILITY_TEXT,
  hasRequestableMeetingAvailability,
} from "../../src/lib/meetings/request-availability.ts";

test("requestable meeting availability requires a future slot", () => {
  assert.equal(
    hasRequestableMeetingAvailability(
      {
        account_status: "active",
        profile_visible: true,
        calendar_enabled: true,
      },
      false
    ),
    false
  );
});

test("requestable meeting availability starts 48 hours from now", () => {
  const referenceDate = new Date("2026-04-28T13:22:00.000Z");

  assert.equal(MEETING_REQUEST_LEAD_TIME_HOURS, 48);
  assert.equal(
    getMinimumRequestableMeetingStartDate(referenceDate).toISOString(),
    "2026-04-30T13:22:00.000Z"
  );
  assert.equal(
    getMinimumRequestableMeetingStartIso(referenceDate),
    "2026-04-30T13:22:00.000Z"
  );
});

test("requestable meeting availability is blocked by account visibility flags", () => {
  assert.equal(
    hasRequestableMeetingAvailability(
      {
        account_status: "active",
        profile_visible: false,
        calendar_enabled: true,
      },
      true
    ),
    false
  );

  assert.equal(
    hasRequestableMeetingAvailability(
      {
        account_status: "inactive",
        profile_visible: true,
        calendar_enabled: true,
      },
      true
    ),
    false
  );
});

test("requestable meeting availability is allowed only for active visible calendars with slots", () => {
  assert.equal(
    hasRequestableMeetingAvailability(
      {
        account_status: "active",
        profile_visible: true,
        calendar_enabled: true,
      },
      true
    ),
    true
  );

  assert.equal(
    NO_ACTIVE_MEETING_AVAILABILITY_TEXT,
    "This member has no active availability right now."
  );
});
