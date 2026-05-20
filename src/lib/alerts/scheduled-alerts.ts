import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendInactiveNewPeopleReengagementEmail,
  sendMeetingRequestReminderEmail,
  sendNewMatchesReengagementEmail,
  sendNoActiveVideoSlotEmail,
  sendUnreadMessagesReengagementEmail,
} from "@/lib/email";
import { sendPushNotificationIfAllowed } from "@/lib/onesignal";
import { formatInTimeZone, getSafeTimeZone } from "@/lib/timezones";

type AlertChannel = "email" | "push";
type ScheduledAlertStatus = "pending" | "sent" | "cancelled" | "failed";
type NoActiveVideoSlotTrigger = "like" | "wink" | "interested" | "profile_view";

export type ScheduledAlertType =
  | "meeting_request_reminder"
  | "no_active_video_slot_reminder"
  | "reengagement_unread_messages"
  | "reengagement_new_people"
  | "reengagement_new_matches";

type ScheduledAlertPayload = Record<string, unknown>;

type ScheduledAlertRow = {
  id: string;
  user_id: string;
  alert_type: ScheduledAlertType;
  channel: AlertChannel;
  payload: ScheduledAlertPayload | null;
  status: ScheduledAlertStatus;
  attempt_count: number | null;
};

type ScheduleAlertParams = {
  supabase: SupabaseClient;
  userId: string;
  alertType: ScheduledAlertType;
  channels: AlertChannel[];
  sendAt: Date;
  payload: ScheduledAlertPayload;
  idempotencyKey: string;
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com";

function isMissingScheduledAlertsTable(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  const code = String(value?.code || "");
  const message = String(value?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code.startsWith("PGRST20") ||
    message.includes("scheduled_alerts")
  );
}

function normalizeName(value: unknown, fallback = "there") {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

function normalizeIso(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pushDataValue(value: unknown) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  return null;
}

function timestamp(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadUserEmailIdentity(supabase: SupabaseClient, userId: string) {
  const [{ data: account }, { data: profile }] = await Promise.all([
    supabase
      .from("accounts")
      .select("email, display_name, last_active_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  return {
    email: account?.email || null,
    lastActiveAt: normalizeIso(account?.last_active_at),
    recipientName: normalizeName(
      profile?.first_name || account?.display_name || account?.email?.split("@")[0]
    ),
  };
}

async function hasUnreadMessagesWaiting(
  supabase: SupabaseClient,
  userId: string,
  payload: ScheduledAlertPayload
) {
  const matchId = normalizeIso(payload.matchId);
  if (!matchId) return false;

  const { data: match, error: matchError } = await supabase
    .from("user_matches")
    .select("user1_id, user2_id")
    .eq("id", matchId)
    .maybeSingle();

  if (matchError || !match) {
    if (matchError) {
      console.error("[scheduled-alerts] Unable to check unread message match:", matchError);
    }
    return false;
  }

  if (match.user1_id !== userId && match.user2_id !== userId) {
    return false;
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("match_id", matchId)
    .neq("sender_id", userId)
    .is("read_at", null)
    .limit(1);

  if (error) {
    console.error("[scheduled-alerts] Unable to check unread messages:", error);
    return false;
  }

  return (data || []).length > 0;
}

async function isStillInactive(
  supabase: SupabaseClient,
  userId: string,
  inactiveDays: number
) {
  const { data, error } = await supabase
    .from("accounts")
    .select("last_active_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[scheduled-alerts] Unable to check account activity:", error);
    return false;
  }

  const lastActiveAt = timestamp(normalizeIso(data?.last_active_at));
  if (!lastActiveAt) return true;

  return lastActiveAt <= Date.now() - inactiveDays * 24 * 60 * 60 * 1000;
}

async function hasNewMatchesWaiting(
  supabase: SupabaseClient,
  userId: string,
  payload: ScheduledAlertPayload
) {
  const matchId = normalizeIso(payload.matchId);
  const sinceIso = normalizeIso(payload.sinceIso) || normalizeIso(payload.matchCreatedAt);
  const sinceAt = timestamp(sinceIso);

  const identity = await loadUserEmailIdentity(supabase, userId);
  const lastActiveAt = timestamp(identity.lastActiveAt);
  if (sinceAt && lastActiveAt && lastActiveAt >= sinceAt) {
    return false;
  }

  let query = supabase
    .from("user_matches")
    .select("id")
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .limit(1);

  if (matchId) {
    query = query.eq("id", matchId);
  } else if (sinceIso) {
    query = query.gte("created_at", sinceIso);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[scheduled-alerts] Unable to check new matches:", error);
    return false;
  }

  return (data || []).length > 0;
}

async function markAlert(
  supabase: SupabaseClient,
  id: string,
  status: ScheduledAlertStatus,
  extra: Record<string, unknown> = {}
) {
  await supabase
    .from("scheduled_alerts")
    .update({
      status,
      ...extra,
      ...(status === "sent" ? { sent_at: new Date().toISOString() } : {}),
      ...(status === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
}

export async function scheduleAlert(params: ScheduleAlertParams) {
  const rows = params.channels.map((channel) => ({
    user_id: params.userId,
    alert_type: params.alertType,
    channel,
    payload: params.payload,
    send_at: params.sendAt.toISOString(),
    status: "pending",
    idempotency_key: `${params.idempotencyKey}:${channel}`,
  }));

  const { data, error } = await params.supabase
    .from("scheduled_alerts")
    .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("id");

  if (error) {
    if (isMissingScheduledAlertsTable(error)) {
      console.warn(
        "[scheduled-alerts] scheduled_alerts table is missing; reminder was not persisted",
        { alertType: params.alertType, userId: params.userId }
      );
      return { scheduled: 0, skipped: true };
    }
    throw error;
  }

  return { scheduled: (data || []).length, skipped: false };
}

async function hasFutureVideoSlot(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("meeting_availability")
    .select("id")
    .eq("user_id", userId)
    .gte("scheduled_at_utc", new Date().toISOString())
    .limit(1);

  if (error) {
    console.error("[scheduled-alerts] Unable to check meeting availability:", error);
    return false;
  }

  return (data || []).length > 0;
}

async function isMeetingRequestStillPending(
  supabase: SupabaseClient,
  meetingId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("meeting_participants")
    .select("response, meetings!inner(status, workflow_state, scheduled_at)")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("[scheduled-alerts] Unable to check meeting request status:", error);
    }
    return false;
  }

  const meeting = Array.isArray(data.meetings) ? data.meetings[0] : data.meetings;
  const status = String(meeting?.status || "");
  const workflowState = String(meeting?.workflow_state || "");
  const scheduledAt = normalizeIso(meeting?.scheduled_at);

  return (
    data.response === "requested" &&
    status === "pending" &&
    (!workflowState || workflowState === "requested") &&
    (!scheduledAt || new Date(scheduledAt) > new Date())
  );
}

async function deliverMeetingRequestReminder(
  supabase: SupabaseClient,
  alert: ScheduledAlertRow
) {
  const payload = alert.payload || {};
  const meetingId = normalizeIso(payload.meetingId);
  if (!meetingId) {
    return { sent: false, cancelled: true, reason: "missing_meeting_id" };
  }

  const stillPending = await isMeetingRequestStillPending(
    supabase,
    meetingId,
    alert.user_id
  );
  if (!stillPending) {
    return { sent: false, cancelled: true, reason: "meeting_request_resolved" };
  }

  const [{ data: account }, { data: profile }] = await Promise.all([
    supabase
      .from("accounts")
      .select("email, display_name")
      .eq("id", alert.user_id)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", alert.user_id)
      .maybeSingle(),
  ]);

  const recipientName = normalizeName(
    profile?.first_name || account?.display_name || account?.email?.split("@")[0]
  );
  const requesterName = normalizeName(payload.requesterName, "Someone");
  const meetingDate = normalizeName(payload.meetingDate, "your selected date");
  const meetingTime = normalizeName(payload.meetingTime, "your selected time");
  const meetingTimeZone = normalizeName(payload.meetingTimeZone, "");

  if (alert.channel === "email") {
    if (!account?.email) {
      return { sent: false, cancelled: true, reason: "missing_email" };
    }
    const result = await sendMeetingRequestReminderEmail(
      account.email,
      {
        recipientName,
        requesterName,
        meetingDate,
        meetingTime,
        meetingTimeZone: meetingTimeZone || undefined,
      },
      alert.user_id
    );
    return { sent: result.success, error: result.error };
  }

  const pushSent = await sendPushNotificationIfAllowed({
    userId: alert.user_id,
    type: "meeting_request",
    title: "Video date request waiting",
    message: `${requesterName}'s request for ${meetingDate} at ${meetingTime} is still waiting for your reply.`,
    url: "/dashboard/meetings?tab=pending",
    data: {
      meeting_id: meetingId,
      requester_id: pushDataValue(payload.requesterId),
    },
  });

  return { sent: pushSent };
}

async function deliverNoActiveVideoSlotReminder(
  supabase: SupabaseClient,
  alert: ScheduledAlertRow
) {
  if (await hasFutureVideoSlot(supabase, alert.user_id)) {
    return { sent: false, cancelled: true, reason: "slot_created" };
  }

  const payload = alert.payload || {};
  const [{ data: account }, { data: profile }] = await Promise.all([
    supabase
      .from("accounts")
      .select("email, display_name")
      .eq("id", alert.user_id)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", alert.user_id)
      .maybeSingle(),
  ]);

  const recipientName = normalizeName(
    profile?.first_name || account?.display_name || account?.email?.split("@")[0]
  );
  const actorName = normalizeName(payload.actorName, "Someone");
  const triggerLabel = normalizeName(payload.triggerLabel, "showed interest");

  if (alert.channel === "email") {
    if (!account?.email) {
      return { sent: false, cancelled: true, reason: "missing_email" };
    }
    const result = await sendNoActiveVideoSlotEmail(
      account.email,
      {
        recipientName,
        actorName,
        triggerLabel,
      },
      alert.user_id
    );
    return { sent: result.success, error: result.error };
  }

  const pushSent = await sendPushNotificationIfAllowed({
    userId: alert.user_id,
    type: "no_active_video_slot",
    title: "Add a video date slot",
    message: `${actorName} ${triggerLabel}. Add a calendar slot so people can request a video date.`,
    url: "/dashboard/calendar",
    data: {
      actor_user_id: pushDataValue(payload.actorUserId),
      trigger_type: pushDataValue(payload.triggerType),
    },
  });

  return { sent: pushSent };
}

async function deliverUnreadMessagesReengagement(
  supabase: SupabaseClient,
  alert: ScheduledAlertRow
) {
  const payload = alert.payload || {};
  const matchId = normalizeIso(payload.matchId);
  if (!matchId) {
    return { sent: false, cancelled: true, reason: "missing_match_id" };
  }

  if (!(await hasUnreadMessagesWaiting(supabase, alert.user_id, payload))) {
    return { sent: false, cancelled: true, reason: "chat_opened_or_no_unread_messages" };
  }

  if (alert.channel !== "email") {
    return { sent: false, cancelled: true, reason: "unsupported_channel" };
  }

  const identity = await loadUserEmailIdentity(supabase, alert.user_id);
  if (!identity.email) {
    return { sent: false, cancelled: true, reason: "missing_email" };
  }

  const result = await sendUnreadMessagesReengagementEmail(
    identity.email,
    {
      recipientName: identity.recipientName,
      matchId,
    },
    alert.user_id
  );
  return { sent: result.success, error: result.error };
}

async function deliverInactiveNewPeopleReengagement(
  supabase: SupabaseClient,
  alert: ScheduledAlertRow
) {
  if (!(await isStillInactive(supabase, alert.user_id, 6))) {
    return { sent: false, cancelled: true, reason: "user_returned" };
  }

  if (alert.channel !== "email") {
    return { sent: false, cancelled: true, reason: "unsupported_channel" };
  }

  const identity = await loadUserEmailIdentity(supabase, alert.user_id);
  if (!identity.email) {
    return { sent: false, cancelled: true, reason: "missing_email" };
  }

  const result = await sendInactiveNewPeopleReengagementEmail(
    identity.email,
    { recipientName: identity.recipientName },
    alert.user_id
  );
  return { sent: result.success, error: result.error };
}

async function deliverNewMatchesReengagement(
  supabase: SupabaseClient,
  alert: ScheduledAlertRow
) {
  const payload = alert.payload || {};
  if (!(await hasNewMatchesWaiting(supabase, alert.user_id, payload))) {
    return { sent: false, cancelled: true, reason: "matches_seen_or_missing" };
  }

  if (alert.channel !== "email") {
    return { sent: false, cancelled: true, reason: "unsupported_channel" };
  }

  const identity = await loadUserEmailIdentity(supabase, alert.user_id);
  if (!identity.email) {
    return { sent: false, cancelled: true, reason: "missing_email" };
  }

  const result = await sendNewMatchesReengagementEmail(
    identity.email,
    { recipientName: identity.recipientName },
    alert.user_id
  );
  return { sent: result.success, error: result.error };
}

async function deliverScheduledAlert(
  supabase: SupabaseClient,
  alert: ScheduledAlertRow
) {
  switch (alert.alert_type) {
    case "meeting_request_reminder":
      return deliverMeetingRequestReminder(supabase, alert);
    case "no_active_video_slot_reminder":
      return deliverNoActiveVideoSlotReminder(supabase, alert);
    case "reengagement_unread_messages":
      return deliverUnreadMessagesReengagement(supabase, alert);
    case "reengagement_new_people":
      return deliverInactiveNewPeopleReengagement(supabase, alert);
    case "reengagement_new_matches":
      return deliverNewMatchesReengagement(supabase, alert);
    default:
      return { sent: false, cancelled: true, reason: "unknown_alert_type" };
  }
}

export async function processDueScheduledAlerts(
  supabase: SupabaseClient,
  options: { limit?: number } = {}
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("scheduled_alerts")
    .select("*")
    .eq("status", "pending")
    .lte("send_at", now)
    .order("send_at", { ascending: true })
    .limit(options.limit || 100);

  if (error) {
    if (isMissingScheduledAlertsTable(error)) {
      return { processed: 0, sent: 0, cancelled: 0, failed: 0, missingTable: true };
    }
    throw error;
  }

  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  for (const alert of (data || []) as ScheduledAlertRow[]) {
    try {
      const result = await deliverScheduledAlert(supabase, alert);
      if (result.cancelled) {
        cancelled += 1;
        await markAlert(supabase, alert.id, "cancelled", {
          last_error: result.reason || null,
        });
      } else if (result.sent) {
        sent += 1;
        await markAlert(supabase, alert.id, "sent", { last_error: null });
      } else {
        failed += 1;
        await markAlert(supabase, alert.id, "failed", {
          last_error: result.error || "Delivery failed",
          attempt_count: (alert.attempt_count || 0) + 1,
        });
      }
    } catch (error) {
      failed += 1;
      await markAlert(supabase, alert.id, "failed", {
        last_error: error instanceof Error ? error.message : "Unexpected error",
        attempt_count: (alert.attempt_count || 0) + 1,
      });
    }
  }

  return {
    processed: (data || []).length,
    sent,
    cancelled,
    failed,
    missingTable: false,
  };
}

export async function scheduleMeetingRequestReminder(params: {
  supabase: SupabaseClient;
  meetingId: string;
  targetUserId: string;
  requesterId: string;
  requesterName: string;
  meetingDate: string;
  meetingTime: string;
  meetingTimeZone?: string;
}) {
  const sendAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  return scheduleAlert({
    supabase: params.supabase,
    userId: params.targetUserId,
    alertType: "meeting_request_reminder",
    channels: ["email", "push"],
    sendAt,
    idempotencyKey: `meeting-request-reminder:${params.meetingId}:${params.targetUserId}`,
    payload: {
      meetingId: params.meetingId,
      requesterId: params.requesterId,
      requesterName: params.requesterName,
      meetingDate: params.meetingDate,
      meetingTime: params.meetingTime,
      meetingTimeZone: params.meetingTimeZone,
    },
  });
}

export async function sendNoActiveVideoSlotAlert(params: {
  supabase: SupabaseClient;
  userId: string;
  actorUserId: string;
  actorName: string;
  triggerType: NoActiveVideoSlotTrigger;
}) {
  if (await hasFutureVideoSlot(params.supabase, params.userId)) {
    return { sent: false, scheduled: 0, skipped: "slot_exists" };
  }

  const triggerLabels: Record<NoActiveVideoSlotTrigger, string> = {
    like: "liked your profile",
    wink: "winked at you",
    interested: "showed interest in you",
    profile_view: "viewed your profile",
  };
  const triggerLabel = triggerLabels[params.triggerType];

  const immediatePayload = {
    actorUserId: params.actorUserId,
    actorName: params.actorName,
    triggerType: params.triggerType,
    triggerLabel,
  };

  await Promise.all([
    deliverNoActiveVideoSlotReminder(params.supabase, {
      id: "immediate",
      user_id: params.userId,
      alert_type: "no_active_video_slot_reminder",
      channel: "email",
      payload: immediatePayload,
      status: "pending",
      attempt_count: 0,
    }),
    deliverNoActiveVideoSlotReminder(params.supabase, {
      id: "immediate",
      user_id: params.userId,
      alert_type: "no_active_video_slot_reminder",
      channel: "push",
      payload: immediatePayload,
      status: "pending",
      attempt_count: 0,
    }),
  ]);

  const schedule = await scheduleAlert({
    supabase: params.supabase,
    userId: params.userId,
    alertType: "no_active_video_slot_reminder",
    channels: ["email", "push"],
    sendAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    idempotencyKey: `no-active-slot:${params.userId}:${params.triggerType}:${params.actorUserId}`,
    payload: immediatePayload,
  });

  return { sent: true, scheduled: schedule.scheduled, skipped: false };
}

export function buildMeetingRequestUrl() {
  return `${APP_URL}/dashboard/meetings?tab=pending`;
}

export function formatMeetingDateParts(
  scheduledAt: Date | string,
  timeZone?: string | null
) {
  const safeTimeZone = getSafeTimeZone(timeZone || undefined);
  return {
    meetingDate: formatInTimeZone(scheduledAt, safeTimeZone, "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    meetingTime: formatInTimeZone(scheduledAt, safeTimeZone, "en-US", {
      hour: "numeric",
      minute: "2-digit",
    }),
    meetingTimeZone: safeTimeZone,
  };
}
