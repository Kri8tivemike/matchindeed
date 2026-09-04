import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountModerationChange,
  getAuthBanDurationForAccount,
  getInactiveAccountMessage,
  getModerationTargetError,
  isExpiredSuspension,
  normalizeSuspensionDays,
} from "../../src/lib/admin/account-moderation.ts";

const target = {
  id: "target-user",
  role: "user",
  account_status: "active",
  suspended_until: null,
  suspension_reason: null,
};

test("builds a seven-day suspension with matching auth and database expiry", () => {
  const change = buildAccountModerationChange(
    "suspend",
    "Safety review",
    7,
    new Date("2026-09-04T12:00:00.000Z")
  );

  assert.equal(change.update.account_status, "suspended");
  assert.equal(change.update.suspended_until, "2026-09-11T12:00:00.000Z");
  assert.equal(change.authBanDuration, "168h");
  assert.match(change.notification.message, /Safety review/);
});

test("ban and activation synchronize Supabase Auth access", () => {
  assert.equal(
    buildAccountModerationChange("ban", "Repeated abuse", undefined)
      .authBanDuration,
    "876000h"
  );
  assert.equal(
    buildAccountModerationChange("active", undefined, undefined)
      .authBanDuration,
    "none"
  );
});

test("suspension days are constrained to a safe range", () => {
  assert.equal(normalizeSuspensionDays(undefined), 7);
  assert.equal(normalizeSuspensionDays(0), 1);
  assert.equal(normalizeSuspensionDays(999), 365);
});

test("restores the previous authentication restriction during rollback", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");
  assert.equal(
    getAuthBanDurationForAccount(
      {
        account_status: "suspended",
        suspended_until: "2026-09-05T12:00:00.000Z",
      },
      now
    ),
    "24h"
  );
  assert.equal(
    getAuthBanDurationForAccount(
      { account_status: "active", suspended_until: null },
      now
    ),
    "none"
  );
});

test("prevents self moderation and protects administrators", () => {
  assert.match(
    getModerationTargetError(
      { userId: target.id, role: "superadmin" },
      target
    ),
    /own account/
  );
  assert.match(
    getModerationTargetError(
      { userId: "admin", role: "admin" },
      { ...target, role: "superadmin" }
    ),
    /super admin/
  );
  assert.equal(
    getModerationTargetError(
      { userId: "super-admin", role: "superadmin" },
      { ...target, role: "admin" }
    ),
    null
  );
});

test("returns clear access messages for suspended and banned users", () => {
  assert.match(
    getInactiveAccountMessage("suspended", "2026-09-11T12:00:00.000Z"),
    /11 Sept 2026/
  );
  assert.match(getInactiveAccountMessage("banned"), /has been banned/);
  assert.equal(getInactiveAccountMessage("active"), null);
});

test("an expired suspension no longer blocks access", () => {
  assert.equal(
    getInactiveAccountMessage("suspended", "2020-01-01T00:00:00.000Z"),
    null
  );
  assert.equal(
    isExpiredSuspension(
      {
        account_status: "suspended",
        suspended_until: "2020-01-01T00:00:00.000Z",
      },
      new Date("2026-09-04T12:00:00.000Z")
    ),
    true
  );
});
