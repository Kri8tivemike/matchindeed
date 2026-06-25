import test from "node:test";
import assert from "node:assert/strict";

import {
  getGenderChangeNextEligibleAt,
  getGenderChangeStatus,
  isGenderChangeInCooldown,
  normalizePartnerGenderPreference,
  normalizeProfileGender,
  resolvePartnerGenderAfterGenderChange,
} from "../../src/lib/profile/gender-change.ts";

test("gender normalization accepts only profile gender values", () => {
  assert.equal(normalizeProfileGender("male"), "male");
  assert.equal(normalizeProfileGender(" Female "), "female");
  assert.equal(normalizeProfileGender("prefer_not_to_say"), "prefer_not_to_say");
  assert.equal(normalizeProfileGender("non-binary"), null);
  assert.equal(normalizeProfileGender(null), null);
});

test("show me normalization accepts only binary partner gender preferences", () => {
  assert.equal(normalizePartnerGenderPreference("male"), "male");
  assert.equal(normalizePartnerGenderPreference(" Female "), "female");
  assert.equal(normalizePartnerGenderPreference("other"), null);
  assert.equal(normalizePartnerGenderPreference(null), null);
});

test("gender changes reset partner preference to the opposite binary gender", () => {
  assert.equal(resolvePartnerGenderAfterGenderChange("male"), "female");
  assert.equal(resolvePartnerGenderAfterGenderChange("female"), "male");
});

test("non-binary profile gender values clear partner gender preference", () => {
  assert.equal(resolvePartnerGenderAfterGenderChange("other"), null);
  assert.equal(resolvePartnerGenderAfterGenderChange("prefer_not_to_say"), null);
  assert.equal(resolvePartnerGenderAfterGenderChange(null), null);
});

test("gender change cooldown lasts for a rolling 90 day window", () => {
  const changedAt = "2026-06-01T10:00:00.000Z";

  assert.equal(
    isGenderChangeInCooldown(changedAt, new Date("2026-08-29T09:59:59.000Z")),
    true
  );
  assert.equal(
    isGenderChangeInCooldown(changedAt, new Date("2026-08-30T10:00:00.000Z")),
    false
  );
  assert.equal(
    getGenderChangeNextEligibleAt(changedAt)?.toISOString(),
    "2026-08-30T10:00:00.000Z"
  );
});

test("gender change status reports locked and eligible states from latest event", async () => {
  const latestEvent = {
    changed_at: "2026-06-01T10:00:00.000Z",
    pause_until: "2026-06-02T10:00:00.000Z",
    status: "pending_approval",
    approval_notes: null,
    restored_at: null,
  };
  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle() {
          return { data: latestEvent, error: null };
        },
      };
    },
  };

  const locked = await getGenderChangeStatus(
    supabase,
    "user-1",
    new Date("2026-08-01T10:00:00.000Z")
  );
  assert.equal(locked.canChange, false);
  assert.equal(locked.nextEligibleAt, "2026-08-30T10:00:00.000Z");
  assert.equal(locked.pauseUntil, latestEvent.pause_until);
  assert.equal(locked.status, "pending_approval");

  const eligible = await getGenderChangeStatus(
    supabase,
    "user-1",
    new Date("2026-08-30T10:00:00.000Z")
  );
  assert.equal(eligible.canChange, true);
});

test("gender change status allows change when no prior event exists", async () => {
  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle() {
          return { data: null, error: null };
        },
      };
    },
  };

  const status = await getGenderChangeStatus(
    supabase,
    "user-1",
    new Date("2026-08-01T10:00:00.000Z")
  );
  assert.deepEqual(status, {
    canChange: true,
    latestChangedAt: null,
    nextEligibleAt: null,
    pauseUntil: null,
    status: null,
    approvalNotes: null,
    restoredAt: null,
  });
});
