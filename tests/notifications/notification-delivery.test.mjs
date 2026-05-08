import test from "node:test";
import assert from "node:assert/strict";

import {
  summarizePushDelivery,
  isMissingNotificationDeliveryLogsTableError,
} from "../../src/lib/notification-delivery.ts";

test("summarizePushDelivery counts statuses and types", () => {
  const summary = summarizePushDelivery([
    { channel: "push", status: "sent", notification_type: "new_message" },
    { channel: "push", status: "sent", notification_type: "meeting_request" },
    {
      channel: "push",
      status: "quieted_recent_activity",
      notification_type: "profile_view",
    },
    {
      channel: "push",
      status: "skipped_preference",
      notification_type: "like",
    },
    { channel: "push", status: "failed_provider", notification_type: "like" },
  ]);

  assert.equal(summary.last_7_days, 5);
  assert.equal(summary.sent, 2);
  assert.equal(summary.quieted_recent_activity, 1);
  assert.equal(summary.skipped_preference, 1);
  assert.equal(summary.failed_provider, 1);
  assert.equal(summary.by_type.new_message, 1);
  assert.equal(summary.by_type.like, 2);
});

test("summarizePushDelivery ignores non-push rows", () => {
  const summary = summarizePushDelivery([
    { channel: "email", status: "sent", notification_type: "new_message" },
    { channel: "push", status: "sent", notification_type: "new_message" },
  ]);

  assert.equal(summary.last_7_days, 1);
  assert.equal(summary.sent, 1);
});

test("missing notification delivery table errors are detected", () => {
  assert.equal(
    isMissingNotificationDeliveryLogsTableError({
      code: "42P01",
      message: 'relation "notification_delivery_logs" does not exist',
    }),
    true
  );

  assert.equal(
    isMissingNotificationDeliveryLogsTableError({
      code: "PGRST205",
      message: "Could not find the table notification_delivery_logs",
    }),
    true
  );

  assert.equal(
    isMissingNotificationDeliveryLogsTableError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    }),
    false
  );
});
