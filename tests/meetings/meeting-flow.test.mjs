import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionMeetingState,
  deriveWorkflowState,
  requireMeetingStateTransition,
  resolveStateForAcceptance,
} from "../../src/lib/meetings/state-machine.ts";

test("deriveWorkflowState falls back from meeting status when workflow state is missing", () => {
  assert.equal(
    deriveWorkflowState({ workflowState: null, status: "confirmed" }),
    "confirmed"
  );
  assert.equal(
    deriveWorkflowState({ workflowState: null, status: "completed" }),
    "completed"
  );
  assert.equal(
    deriveWorkflowState({ workflowState: null, status: "canceled" }),
    "canceled"
  );
});

test("resolveStateForAcceptance progresses from requested to accepted/confirmed", () => {
  assert.equal(resolveStateForAcceptance("requested", false), "accepted");
  assert.equal(resolveStateForAcceptance("requested", true), "confirmed");
  assert.equal(resolveStateForAcceptance("accepted", false), "accepted");
});

test("meeting transition guard allows valid transitions", () => {
  assert.equal(canTransitionMeetingState("confirmed", "in_progress"), true);
  assert.equal(
    requireMeetingStateTransition({ from: "completed", to: "rated" }).allowed,
    true
  );
});

test("meeting transition guard blocks invalid transitions", () => {
  assert.equal(canTransitionMeetingState("completed", "requested"), false);

  const result = requireMeetingStateTransition({
    from: "completed",
    to: "requested",
  });

  assert.equal(result.allowed, false);
  assert.match(result.message || "", /Invalid meeting state transition/i);
});
