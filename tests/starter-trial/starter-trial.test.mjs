import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStarterTrialState,
  canUseStarterTrialMeetingRequest,
  canAccessStarterTrialMeeting,
  isStarterTrialLaunchEligibleAccount,
  shouldRestoreConsumedStarterTrialMeeting,
} from "../../src/lib/starter-trial.ts";

test("buildStarterTrialState marks seeded new users as eligible with one remaining slot", () => {
  const state = buildStarterTrialState({
    trial: {
      user_id: "user-1",
      active_slot_id: null,
      consumed_meeting_id: null,
      consumed_at: null,
    },
    hasPaidMembershipHistory: false,
    hasActiveMembership: false,
  });

  assert.equal(state.has_trial, true);
  assert.equal(state.eligible, true);
  assert.equal(state.has_active_slot, false);
  assert.equal(state.remaining_slots, 1);
  assert.equal(state.upgrade_required, false);
});

test("buildStarterTrialState tracks an active starter slot before first booking acceptance", () => {
  const state = buildStarterTrialState({
    trial: {
      user_id: "user-2",
      active_slot_id: "slot-1",
      consumed_meeting_id: null,
      consumed_at: null,
    },
    hasPaidMembershipHistory: false,
    hasActiveMembership: false,
  });

  assert.equal(state.eligible, true);
  assert.equal(state.has_active_slot, true);
  assert.equal(state.active_slot_id, "slot-1");
  assert.equal(state.remaining_slots, 0);
  assert.equal(canUseStarterTrialMeetingRequest(state), false);
});

test("buildStarterTrialState marks the trial as consumed after the first accepted meeting", () => {
  const state = buildStarterTrialState({
    trial: {
      user_id: "user-3",
      active_slot_id: null,
      consumed_meeting_id: "meeting-1",
      consumed_at: "2026-04-13T10:00:00.000Z",
    },
    hasPaidMembershipHistory: false,
    hasActiveMembership: false,
  });

  assert.equal(state.consumed, true);
  assert.equal(state.upgrade_required, true);
  assert.equal(state.remaining_slots, 0);
  assert.equal(canUseStarterTrialMeetingRequest(state), false);
  assert.equal(canAccessStarterTrialMeeting(state, "meeting-1"), true);
  assert.equal(canAccessStarterTrialMeeting(state, "meeting-2"), false);
});

test("unused starter-trial accounts can spend their one free access on an outgoing request", () => {
  const state = buildStarterTrialState({
    trial: {
      user_id: "user-6",
      active_slot_id: null,
      consumed_meeting_id: null,
      consumed_at: null,
    },
    hasPaidMembershipHistory: false,
    hasActiveMembership: false,
  });

  assert.equal(canUseStarterTrialMeetingRequest(state), true);
});

test("starter trial does not stay eligible once the user has paid membership history", () => {
  const state = buildStarterTrialState({
    trial: {
      user_id: "user-4",
      active_slot_id: null,
      consumed_meeting_id: null,
      consumed_at: null,
    },
    hasPaidMembershipHistory: true,
    hasActiveMembership: false,
  });

  assert.equal(state.eligible, false);
  assert.equal(state.has_paid_membership_history, true);
  assert.equal(state.remaining_slots, 0);
});

test("consumed starter-trial meetings are not used when the user already has an active membership", () => {
  const state = buildStarterTrialState({
    trial: {
      user_id: "user-5",
      active_slot_id: null,
      consumed_meeting_id: "meeting-9",
      consumed_at: "2026-04-13T12:00:00.000Z",
    },
    hasPaidMembershipHistory: true,
    hasActiveMembership: true,
  });

  assert.equal(state.has_active_membership, true);
  assert.equal(canAccessStarterTrialMeeting(state, "meeting-9"), false);
});

test("starter trial repair only applies to accounts created on or after launch day", () => {
  assert.equal(
    isStarterTrialLaunchEligibleAccount("2026-04-13T00:00:00.000Z"),
    true
  );
  assert.equal(
    isStarterTrialLaunchEligibleAccount("2026-04-12T23:59:59.000Z"),
    false
  );
});

test("consumed starter request is restorable when the other user canceled the meeting", () => {
  assert.equal(
    shouldRestoreConsumedStarterTrialMeeting(
      {
        id: "meeting-10",
        status: "canceled",
        canceled_by: "other-user",
        canceled_at: "2026-04-14T17:12:43.974Z",
      },
      "starter-user"
    ),
    true
  );

  assert.equal(
    shouldRestoreConsumedStarterTrialMeeting(
      {
        id: "meeting-11",
        status: "canceled",
        canceled_by: "starter-user",
        canceled_at: "2026-04-14T17:12:43.974Z",
      },
      "starter-user"
    ),
    false
  );
});
