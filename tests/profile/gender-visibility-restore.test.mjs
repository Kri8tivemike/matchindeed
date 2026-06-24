import test from "node:test";
import assert from "node:assert/strict";

import { processGenderVisibilityRestores } from "../../src/lib/profile/gender-change.ts";

function createRestoreSupabase({ events, accounts }) {
  const accountUpdates = [];
  const eventUpdates = [];

  return {
    accountUpdates,
    eventUpdates,
    from(table) {
      const state = {
        table,
        filters: {},
        updatePayload: null,
      };
      const chain = {
        select() {
          return this;
        },
        is() {
          return this;
        },
        lte() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return { data: events, error: null };
        },
        update(payload) {
          state.updatePayload = payload;
          return this;
        },
        eq(column, value) {
          state.filters[column] = value;
          return this;
        },
        maybeSingle() {
          return {
            data: accounts[state.filters.id] || null,
            error: null,
          };
        },
        then(resolve) {
          if (state.table === "accounts") {
            accountUpdates.push({
              filters: { ...state.filters },
              payload: state.updatePayload,
            });
          }
          if (state.table === "gender_change_events") {
            eventUpdates.push({
              filters: { ...state.filters },
              payload: state.updatePayload,
            });
          }
          resolve({ error: null });
        },
      };
      return chain;
    },
  };
}

test("due gender pause restores visible profile only when account is active and was previously visible", async () => {
  const supabase = createRestoreSupabase({
    events: [
      {
        id: "event-1",
        user_id: "user-1",
        pause_until: "2026-06-02T10:00:00.000Z",
        previous_profile_visible: true,
        restored_at: null,
      },
    ],
    accounts: {
      "user-1": {
        account_status: "active",
        profile_visible: false,
        profile_status: "hidden",
      },
    },
  });

  const result = await processGenderVisibilityRestores(supabase, {
    now: new Date("2026-06-02T10:00:01.000Z"),
  });

  assert.deepEqual(result, {
    checked: 1,
    restored: 1,
    skipped: 0,
    errors: 0,
  });
  assert.deepEqual(supabase.accountUpdates, [
    {
      filters: {
        id: "user-1",
        account_status: "active",
        profile_visible: false,
        profile_status: "hidden",
      },
      payload: {
        profile_visible: true,
        profile_status: "online",
      },
    },
  ]);
  assert.equal(supabase.eventUpdates.length, 1);
  assert.equal(supabase.eventUpdates[0].filters.id, "event-1");
  assert.equal(
    supabase.eventUpdates[0].payload.restored_at,
    "2026-06-02T10:00:01.000Z"
  );
});

test("gender pause restore does not make previously hidden or deactivated accounts visible", async () => {
  const supabase = createRestoreSupabase({
    events: [
      {
        id: "event-hidden",
        user_id: "hidden-user",
        pause_until: "2026-06-02T10:00:00.000Z",
        previous_profile_visible: false,
        restored_at: null,
      },
      {
        id: "event-deactivated",
        user_id: "deactivated-user",
        pause_until: "2026-06-02T10:00:00.000Z",
        previous_profile_visible: true,
        restored_at: null,
      },
    ],
    accounts: {
      "hidden-user": {
        account_status: "active",
        profile_visible: false,
        profile_status: "hidden",
      },
      "deactivated-user": {
        account_status: "deactivated",
        profile_visible: false,
        profile_status: "hidden",
      },
    },
  });

  const result = await processGenderVisibilityRestores(supabase, {
    now: new Date("2026-06-02T10:00:01.000Z"),
  });

  assert.deepEqual(result, {
    checked: 2,
    restored: 0,
    skipped: 2,
    errors: 0,
  });
  assert.deepEqual(supabase.accountUpdates, []);
  assert.equal(supabase.eventUpdates.length, 2);
});
