export type MeetingWorkflowState =
  | "requested"
  | "accepted"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "rated"
  | "canceled";

const VALID_TRANSITIONS: Record<MeetingWorkflowState, MeetingWorkflowState[]> = {
  requested: ["accepted", "confirmed", "canceled"],
  accepted: ["confirmed", "canceled"],
  confirmed: ["in_progress", "completed", "canceled"],
  in_progress: ["completed", "canceled"],
  completed: ["rated"],
  rated: [],
  canceled: [],
};

export function normalizeWorkflowState(
  value?: string | null
): MeetingWorkflowState | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (
    [
      "requested",
      "accepted",
      "confirmed",
      "in_progress",
      "completed",
      "rated",
      "canceled",
    ].includes(normalized)
  ) {
    return normalized as MeetingWorkflowState;
  }
  return null;
}

export function deriveWorkflowState(params: {
  workflowState?: string | null;
  status?: string | null;
}): MeetingWorkflowState {
  const fromWorkflow = normalizeWorkflowState(params.workflowState);
  if (fromWorkflow) {
    return fromWorkflow;
  }

  switch ((params.status || "").toLowerCase()) {
    case "canceled":
      return "canceled";
    case "completed":
      return "completed";
    case "confirmed":
      return "confirmed";
    default:
      return "requested";
  }
}

export function canTransitionMeetingState(
  from: MeetingWorkflowState,
  to: MeetingWorkflowState
) {
  if (from === to) return true;
  return VALID_TRANSITIONS[from].includes(to);
}

export function requireMeetingStateTransition(params: {
  from: MeetingWorkflowState;
  to: MeetingWorkflowState;
  fallbackMessage?: string;
}): { allowed: boolean; message?: string } {
  if (canTransitionMeetingState(params.from, params.to)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    message:
      params.fallbackMessage ||
      `Invalid meeting state transition: ${params.from} -> ${params.to}.`,
  };
}

export function resolveStateForAcceptance(
  currentState: MeetingWorkflowState,
  allAccepted: boolean
): MeetingWorkflowState {
  void allAccepted;
  if (currentState === "requested") {
    return "accepted";
  }
  return currentState;
}

export function resolveStateForAdminApproval(
  currentState: MeetingWorkflowState
): MeetingWorkflowState {
  if (currentState === "requested" || currentState === "accepted") {
    return "confirmed";
  }

  return currentState;
}
