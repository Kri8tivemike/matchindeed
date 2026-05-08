import test from "node:test";
import assert from "node:assert/strict";

import {
  getPushQuietWindowMs,
  shouldQuietPushForRecentActivity,
} from "../../src/lib/push-policy.ts";

test("passive engagement pushes use quiet windows", () => {
  assert.equal(getPushQuietWindowMs("like"), 120000);
  assert.equal(getPushQuietWindowMs("profile_view"), 180000);
  assert.equal(getPushQuietWindowMs("new_message"), 0);
});

test("quiet policy suppresses passive pushes for recently active users", () => {
  const now = Date.UTC(2026, 3, 5, 19, 0, 0);

  assert.equal(
    shouldQuietPushForRecentActivity(
      "like",
      new Date(now - 30 * 1000).toISOString(),
      now
    ),
    true
  );

  assert.equal(
    shouldQuietPushForRecentActivity(
      "profile_view",
      new Date(now - 5 * 60 * 1000).toISOString(),
      now
    ),
    false
  );
});

test("quiet policy does not suppress actionable pushes", () => {
  const now = Date.UTC(2026, 3, 5, 19, 0, 0);

  assert.equal(
    shouldQuietPushForRecentActivity(
      "new_message",
      new Date(now - 15 * 1000).toISOString(),
      now
    ),
    false
  );
});
