export const PUSH_DELIVERY_STATUSES = [
  "sent",
  "skipped_preference",
  "quieted_recent_activity",
  "missing_config",
  "failed_provider",
  "error",
] as const;

export type PushDeliveryStatus = (typeof PUSH_DELIVERY_STATUSES)[number];

export interface NotificationDeliveryLogRow {
  channel?: string | null;
  status?: string | null;
  notification_type?: string | null;
  created_at?: string | null;
}

export interface PushDeliverySummary {
  last_7_days: number;
  sent: number;
  skipped_preference: number;
  quieted_recent_activity: number;
  missing_config: number;
  failed_provider: number;
  error: number;
  by_type: Record<string, number>;
}

const PUSH_STATUSES = new Set<string>(PUSH_DELIVERY_STATUSES);

function createEmptySummary(): PushDeliverySummary {
  return {
    last_7_days: 0,
    sent: 0,
    skipped_preference: 0,
    quieted_recent_activity: 0,
    missing_config: 0,
    failed_provider: 0,
    error: 0,
    by_type: {},
  };
}

export function summarizePushDelivery(
  rows: NotificationDeliveryLogRow[]
): PushDeliverySummary {
  const summary = createEmptySummary();

  for (const row of rows) {
    if ((row.channel ?? "push") !== "push") {
      continue;
    }

    summary.last_7_days += 1;

    const rawStatus = row.status ?? "error";
    if (PUSH_STATUSES.has(rawStatus)) {
      const status = rawStatus as PushDeliveryStatus;
      summary[status] += 1;
    } else {
      summary.error += 1;
    }

    const type = (row.notification_type ?? "unknown").trim() || "unknown";
    summary.by_type[type] = (summary.by_type[type] || 0) + 1;
  }

  return summary;
}

export function isMissingNotificationDeliveryLogsTableError(
  error: unknown
): boolean {
  if (!error || typeof error !== "object") return false;

  const record = error as { code?: unknown; message?: unknown };
  const code = String(record.code ?? "");
  const message = String(record.message ?? "").toLowerCase();

  return (
    code === "42P01" ||
    code.startsWith("PGRST20") ||
    message.includes("notification_delivery_logs")
  );
}
