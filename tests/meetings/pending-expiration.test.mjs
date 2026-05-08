import test from "node:test";
import assert from "node:assert/strict";
import {
  MEETING_REQUEST_EXPIRATION_REASON,
  expireStalePendingMeetingRequests,
} from "../../src/lib/meetings/pending-expiration.ts";

class MockQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.operation = "select";
    this.payload = null;
  }

  select() {
    this.operation = this.operation === "update" ? "update-select" : "select";
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;
    return this.execute();
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  lte(column, value) {
    this.filters.push((row) => row[column] <= value);
    return this;
  }

  in(column, values) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    const rows = this.db[this.table];
    if (!rows) {
      throw new Error(`Unknown table: ${this.table}`);
    }

    const matches = rows.filter((row) => this.filters.every((filter) => filter(row)));

    if (this.operation === "select") {
      return { data: matches, error: null };
    }

    if (this.operation === "update") {
      for (const row of matches) {
        Object.assign(row, this.payload);
      }
      return { data: null, error: null };
    }

    if (this.operation === "update-select") {
      for (const row of matches) {
        Object.assign(row, this.payload);
      }
      return { data: matches.map((row) => ({ id: row.id })), error: null };
    }

    if (this.operation === "insert") {
      const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const row of payloadRows) {
        rows.push({ ...row, id: row.id || `generated-${rows.length + 1}` });
      }
      return { data: payloadRows, error: null };
    }

    throw new Error(`Unsupported operation: ${this.operation}`);
  }
}

function createSupabaseMock(seed) {
  return {
    db: seed,
    from(table) {
      return new MockQuery(seed, table);
    },
  };
}

test("expireStalePendingMeetingRequests cancels stale pending requests, refunds credits, and notifies participants", async () => {
  const staleCreatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const freshCreatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const db = {
    meetings: [
      {
        id: "meeting-stale",
        status: "pending",
        workflow_state: "requested",
        scheduled_at: "2026-03-25T10:00:00.000Z",
        requester_credit_cost: 6,
        created_at: staleCreatedAt,
      },
      {
        id: "meeting-fresh",
        status: "pending",
        workflow_state: "requested",
        scheduled_at: "2026-03-26T10:00:00.000Z",
        requester_credit_cost: 6,
        created_at: freshCreatedAt,
      },
    ],
    meeting_participants: [
      {
        meeting_id: "meeting-stale",
        user_id: "host-1",
        role: "host",
        response: "requested",
        responded_at: null,
      },
      {
        meeting_id: "meeting-stale",
        user_id: "guest-1",
        role: "guest",
        response: "accepted",
        responded_at: staleCreatedAt,
      },
      {
        meeting_id: "meeting-fresh",
        user_id: "host-2",
        role: "host",
        response: "requested",
        responded_at: null,
      },
      {
        meeting_id: "meeting-fresh",
        user_id: "guest-2",
        role: "guest",
        response: "accepted",
        responded_at: freshCreatedAt,
      },
    ],
    accounts: [
      { id: "host-1", email: "host1@example.com", display_name: "Host One" },
      { id: "guest-1", email: "guest1@example.com", display_name: "Guest One" },
      { id: "host-2", email: "host2@example.com", display_name: "Host Two" },
      { id: "guest-2", email: "guest2@example.com", display_name: "Guest Two" },
    ],
    user_profiles: [
      { user_id: "host-1", first_name: "Host" },
      { user_id: "guest-1", first_name: "Guest" },
      { user_id: "host-2", first_name: "Other Host" },
      { user_id: "guest-2", first_name: "Other Guest" },
    ],
    notifications: [],
  };

  const refundCalls = [];
  const emailCalls = [];
  const starterTrialRestoreCalls = [];
  const supabase = createSupabaseMock(db);

  const result = await expireStalePendingMeetingRequests(supabase, {
    refundConsumedCreditsFn: async (_supabase, userId, amount, meta) => {
      refundCalls.push({ userId, amount, meta });
      return { success: true };
    },
    sendMeetingCancelledEmailFn: async (email, payload, recipientUserId) => {
      emailCalls.push({ email, payload, recipientUserId });
      return { success: true };
    },
    restoreStarterTrialMeetingFn: async (_supabase, userId, meetingId) => {
      starterTrialRestoreCalls.push({ userId, meetingId });
      return { restored: true };
    },
  });

  assert.equal(result.expiredCount, 1);

  const staleMeeting = db.meetings.find((meeting) => meeting.id === "meeting-stale");
  const freshMeeting = db.meetings.find((meeting) => meeting.id === "meeting-fresh");

  assert.equal(staleMeeting.status, "canceled");
  assert.equal(staleMeeting.workflow_state, "canceled");
  assert.equal(staleMeeting.cancellation_reason, MEETING_REQUEST_EXPIRATION_REASON);
  assert.equal(freshMeeting.status, "pending");

  const staleHost = db.meeting_participants.find(
    (participant) =>
      participant.meeting_id === "meeting-stale" && participant.user_id === "host-1"
  );
  assert.equal(staleHost.response, "declined");
  assert.ok(staleHost.responded_at);

  assert.deepEqual(refundCalls, [
    {
      userId: "guest-1",
      amount: 6,
      meta: {
        actionType: "meeting_request_expired_refund",
        description:
          "Meeting request expired after 24 hours without acceptance; refunded requester credits.",
      },
    },
  ]);

  assert.equal(emailCalls.length, 2);
  assert.deepEqual(
    emailCalls.map((call) => call.recipientUserId).sort(),
    ["guest-1", "host-1"]
  );

  assert.deepEqual(starterTrialRestoreCalls, [
    { userId: "host-1", meetingId: "meeting-stale" },
    { userId: "guest-1", meetingId: "meeting-stale" },
  ]);

  assert.equal(db.notifications.length, 2);
  assert.ok(
    db.notifications.every(
      (notification) => notification.type === "meeting_request_expired"
    )
  );
});
