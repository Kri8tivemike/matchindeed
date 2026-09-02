import test from "node:test";
import assert from "node:assert/strict";

import {
  ENGAGEMENT_NOTIFICATION_TYPES,
  getEngagementNotificationCategory,
} from "@/lib/engagement-notifications";

test("groups received engagement notification types", () => {
  assert.deepEqual(ENGAGEMENT_NOTIFICATION_TYPES.received, [
    "like",
    "wink",
    "interested",
  ]);
  assert.equal(getEngagementNotificationCategory("like"), "received");
  assert.equal(getEngagementNotificationCategory("wink"), "received");
  assert.equal(getEngagementNotificationCategory("interested"), "received");
});

test("keeps profile views separate from received reactions", () => {
  assert.deepEqual(ENGAGEMENT_NOTIFICATION_TYPES.views, ["profile_view"]);
  assert.equal(getEngagementNotificationCategory("profile_view"), "views");
  assert.equal(getEngagementNotificationCategory("new_message"), null);
});
