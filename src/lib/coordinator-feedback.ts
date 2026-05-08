export type CoordinatorFeedbackStatus = "successful" | "not_successful";

export type CoordinatorFeedback = {
  id: string;
  coordinator_id: string | null;
  coordinator_name: string | null;
  status: CoordinatorFeedbackStatus | null;
  status_label: string | null;
  note: string;
  joined_at: string | null;
  submitted_at: string | null;
  finalized: boolean;
};

export type MeetingReportLike = {
  id: string;
  coordinator_id?: string | null;
  coordinator_name?: string | null;
  conclusion?: string | null;
  host_decision?: string | null;
  participant_yes_no?: unknown;
  finalized?: boolean | null;
  created_at?: string | null;
};

const FEEDBACK_METADATA_KEYS = new Set([
  "coordinator_status",
  "coordinator_note",
  "coordinator_joined_at",
  "coordinator_submitted_at",
  "coordinator_id",
  "coordinator_name",
]);

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeCoordinatorFeedbackStatus(
  value: unknown
): CoordinatorFeedbackStatus | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (
    normalized === "successful" ||
    normalized === "success" ||
    normalized === "completed"
  ) {
    return "successful";
  }

  if (
    normalized === "not_successful" ||
    normalized === "not_success" ||
    normalized === "unsuccessful" ||
    normalized === "failed"
  ) {
    return "not_successful";
  }

  return null;
}

export function getCoordinatorFeedbackStatusLabel(
  status: CoordinatorFeedbackStatus | null
) {
  if (status === "successful") return "Successful";
  if (status === "not_successful") return "Not Successful";
  return null;
}

export function extractCoordinatorFeedback(
  report: MeetingReportLike | null | undefined
): CoordinatorFeedback | null {
  if (!report) return null;

  const metadata = isPlainRecord(report.participant_yes_no)
    ? report.participant_yes_no
    : {};
  const status = normalizeCoordinatorFeedbackStatus(
    metadata.coordinator_status || report.host_decision || report.conclusion
  );
  const note =
    typeof metadata.coordinator_note === "string"
      ? metadata.coordinator_note
      : "";
  const joinedAt =
    typeof metadata.coordinator_joined_at === "string"
      ? metadata.coordinator_joined_at
      : null;
  const submittedAt =
    typeof metadata.coordinator_submitted_at === "string"
      ? metadata.coordinator_submitted_at
      : status || note
        ? report.created_at || null
        : null;

  if (!status && !note && !joinedAt && !submittedAt) {
    return null;
  }

  return {
    id: report.id,
    coordinator_id:
      typeof metadata.coordinator_id === "string"
        ? metadata.coordinator_id
        : report.coordinator_id || null,
    coordinator_name:
      typeof metadata.coordinator_name === "string"
        ? metadata.coordinator_name
        : report.coordinator_name || null,
    status,
    status_label: getCoordinatorFeedbackStatusLabel(status),
    note,
    joined_at: joinedAt,
    submitted_at: submittedAt,
    finalized: Boolean(report.finalized),
  };
}

export function getParticipantResponses(
  participantYesNo: unknown
): Record<string, string> {
  if (!isPlainRecord(participantYesNo)) return {};

  return Object.entries(participantYesNo).reduce<Record<string, string>>(
    (responses, [key, value]) => {
      if (FEEDBACK_METADATA_KEYS.has(key)) return responses;
      if (typeof value !== "string") return responses;
      responses[key] = value;
      return responses;
    },
    {}
  );
}

export function buildCoordinatorFeedbackMetadata({
  existing,
  coordinatorId,
  coordinatorName,
  joinedAt,
  status,
  note,
  submittedAt,
}: {
  existing: unknown;
  coordinatorId: string;
  coordinatorName: string;
  joinedAt?: string | null;
  status?: CoordinatorFeedbackStatus | null;
  note?: string | null;
  submittedAt?: string | null;
}) {
  const metadata = isPlainRecord(existing) ? { ...existing } : {};
  const previousJoinedAt =
    typeof metadata.coordinator_joined_at === "string"
      ? metadata.coordinator_joined_at
      : null;

  return {
    ...metadata,
    coordinator_id: coordinatorId,
    coordinator_name: coordinatorName,
    coordinator_joined_at: joinedAt || previousJoinedAt || null,
    ...(status
      ? {
          coordinator_status: status,
          coordinator_note: note?.trim() || "",
          coordinator_submitted_at: submittedAt || new Date().toISOString(),
        }
      : {}),
  };
}
