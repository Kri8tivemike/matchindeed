import test from "node:test";
import assert from "node:assert/strict";
import {
  createReferralFromCode,
  evaluateFirstSubscriptionReferralReward,
  evaluateProfilePreferencesReferralReward,
} from "../../src/lib/referrals/rewards.ts";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId(table, rows) {
  return `${table}-${rows.length + 1}`;
}

class FakeQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.insertPayload = null;
    this.updatePayload = null;
    this.upsertPayload = null;
    this.selected = false;
    this.single = false;
  }

  select() {
    this.selected = true;
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this;
  }

  insert(payload) {
    this.insertPayload = payload;
    return this;
  }

  update(payload) {
    this.updatePayload = payload;
    return this;
  }

  upsert(payload) {
    this.upsertPayload = payload;
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  rows() {
    return this.db[this.table] || (this.db[this.table] = []);
  }

  matchingRows() {
    return this.rows().filter((row) => this.filters.every((filter) => filter(row)));
  }

  execute() {
    if (this.insertPayload) return this.executeInsert();
    if (this.updatePayload) return this.executeUpdate();
    if (this.upsertPayload) return this.executeUpsert();

    const rows = this.matchingRows().map(clone);
    if (this.single) return { data: rows[0] || null, error: null };
    return { data: rows, error: null };
  }

  executeInsert() {
    const rows = this.rows();
    const payloads = Array.isArray(this.insertPayload)
      ? this.insertPayload
      : [this.insertPayload];
    const inserted = [];

    for (const payload of payloads) {
      if (
        this.table === "referrals" &&
        rows.some((row) => row.referred_user_id === payload.referred_user_id)
      ) {
        return { data: null, error: { code: "23505", message: "duplicate referral" } };
      }

      if (
        this.table === "referral_rewards" &&
        rows.some(
          (row) =>
            row.referral_id === payload.referral_id &&
            row.milestone === payload.milestone
        )
      ) {
        return { data: null, error: { code: "23505", message: "duplicate reward" } };
      }

      const row = {
        id: payload.id || createId(this.table, rows),
        created_at: payload.created_at || new Date("2026-06-04T12:00:00.000Z").toISOString(),
        ...(this.table === "referrals" ? { status: "active" } : {}),
        ...clone(payload),
      };
      rows.push(row);
      inserted.push(row);
    }

    const data = this.single ? inserted[0] || null : inserted;
    return { data: this.selected ? clone(data) : null, error: null };
  }

  executeUpdate() {
    const rows = this.matchingRows();
    for (const row of rows) Object.assign(row, clone(this.updatePayload));
    const data = this.single ? rows[0] || null : rows;
    return { data: this.selected ? clone(data) : null, error: null };
  }

  executeUpsert() {
    const rows = this.rows();
    const payloads = Array.isArray(this.upsertPayload)
      ? this.upsertPayload
      : [this.upsertPayload];

    for (const payload of payloads) {
      const key = this.table === "credits" ? "user_id" : "key";
      const existing = rows.find((row) => row[key] === payload[key]);
      if (existing) {
        Object.assign(existing, clone(payload));
      } else {
        rows.push({
          id: payload.id || createId(this.table, rows),
          ...clone(payload),
        });
      }
    }

    return { data: null, error: null };
  }
}

function createFakeSupabase(overrides = {}) {
  const db = {
    referral_codes: [
      {
        id: "code-1",
        user_id: "referrer-1",
        code: "REFERRER-1234",
        status: "active",
      },
    ],
    referral_settings: [
      { key: "profile_preferences_completed_credits", value: 2 },
      { key: "first_subscription_purchased_credits", value: 2 },
      { key: "auto_approve_low_risk_rewards", value: true },
    ],
    referrals: [],
    referral_rewards: [],
    referral_audit_logs: [],
    referral_fraud_checks: [],
    credits: [{ user_id: "referrer-1", total: 0, used: 0, rollover: 0 }],
    credit_transactions: [],
    notifications: [],
    user_progress: [],
    user_profiles: [],
    user_preferences: [],
    ...overrides,
  };

  return {
    db,
    client: {
      from(table) {
        return new FakeQuery(db, table);
      },
    },
  };
}

test("referral lifecycle awards each configured milestone once", async () => {
  const { client, db } = createFakeSupabase({
    user_progress: [
      {
        user_id: "referred-1",
        profile_completed: false,
        preferences_completed: false,
      },
    ],
  });

  const captured = await createReferralFromCode(client, {
    referredUserId: "referred-1",
    referralCode: "referrer-1234",
  });

  assert.deepEqual(captured, { created: true, referralId: "referrals-1" });
  assert.equal(db.referrals.length, 1);

  const incomplete = await evaluateProfilePreferencesReferralReward(
    client,
    "referred-1"
  );
  assert.deepEqual(incomplete, {
    created: false,
    reason: "progress_incomplete",
  });
  assert.equal(db.referral_rewards.length, 0);
  assert.equal(db.credits[0].total, 0);

  db.user_progress[0].profile_completed = true;
  db.user_progress[0].preferences_completed = true;

  const profileReward = await evaluateProfilePreferencesReferralReward(
    client,
    "referred-1"
  );
  assert.equal(profileReward.created, true);
  assert.equal(profileReward.autoApproved, true);
  assert.equal(db.referral_rewards.length, 1);
  assert.equal(db.referral_rewards[0].status, "approved");
  assert.equal(db.referral_rewards[0].credits_awarded, 2);
  assert.equal(db.credits[0].total, 2);

  const duplicateProfileReward = await evaluateProfilePreferencesReferralReward(
    client,
    "referred-1"
  );
  assert.deepEqual(duplicateProfileReward, {
    created: false,
    reason: "already_rewarded",
  });
  assert.equal(db.referral_rewards.length, 1);
  assert.equal(db.credits[0].total, 2);

  const subscriptionReward = await evaluateFirstSubscriptionReferralReward(
    client,
    "referred-1",
    { payment_provider: "flutterwave", transaction_ref: "test-ref-1" }
  );
  assert.equal(subscriptionReward.created, true);
  assert.equal(subscriptionReward.autoApproved, true);
  assert.equal(db.referral_rewards.length, 2);
  assert.equal(db.credits[0].total, 4);

  const duplicateSubscriptionReward = await evaluateFirstSubscriptionReferralReward(
    client,
    "referred-1",
    { payment_provider: "flutterwave", transaction_ref: "test-ref-1-repeat" }
  );
  assert.deepEqual(duplicateSubscriptionReward, {
    created: false,
    reason: "already_rewarded",
  });
  assert.equal(db.referral_rewards.length, 2);
  assert.equal(db.credits[0].total, 4);

  assert.deepEqual(
    db.credit_transactions.map((transaction) => transaction.action_type),
    ["referral_reward", "referral_reward"]
  );
  assert.deepEqual(
    db.referral_audit_logs.map((log) => log.action),
    [
      "referral_created",
      "referral_reward_created",
      "referral_reward_approved",
      "referral_reward_created",
      "referral_reward_approved",
    ]
  );
});

test("self-referral is blocked and logged as fraud", async () => {
  const { client, db } = createFakeSupabase();

  const result = await createReferralFromCode(client, {
    referredUserId: "referrer-1",
    referralCode: "REFERRER-1234",
  });

  assert.deepEqual(result, { created: false, reason: "self_referral" });
  assert.equal(db.referrals.length, 0);
  assert.equal(db.referral_fraud_checks.length, 1);
  assert.equal(db.referral_fraud_checks[0].check_type, "self_referral");
  assert.equal(db.referral_fraud_checks[0].risk_level, "blocked");
});
