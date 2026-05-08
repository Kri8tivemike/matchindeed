import type { SupabaseClient } from "@supabase/supabase-js";

type ReminderRecipientRole = "participant" | "coordinator" | "admin";

export type MeetingReminderRecipient = {
  user_id: string;
  recipient_role: ReminderRecipientRole;
};

export type ScheduledMeetingNotification = {
  meeting_id: string;
  user_id: string;
  notification_type: string;
  sent_at: string;
  email_sent: boolean;
  dashboard_sent: boolean;
};

const ADMIN_ROLES = ["admin", "superadmin"];

const PARTICIPANT_NOTIFICATION_OFFSETS = [
  { type: "1hr", minutesBefore: 60 },
  { type: "30min", minutesBefore: 30 },
  { type: "15min", minutesBefore: 15 },
  { type: "10min", minutesBefore: 10 },
  { type: "5min", minutesBefore: 5 },
  { type: "start", minutesBefore: 0 },
  { type: "rules", minutesBefore: 60 },
];

const OPERATIONS_NOTIFICATION_OFFSETS = [
  { type: "30min", minutesBefore: 30 },
  { type: "10min", minutesBefore: 10 },
];

function addRecipient(
  recipients: Map<string, MeetingReminderRecipient>,
  userId: string | null | undefined,
  recipientRole: ReminderRecipientRole
) {
  if (!userId) return;

  const existing = recipients.get(userId);
  if (existing?.recipient_role === "participant") return;

  recipients.set(userId, {
    user_id: userId,
    recipient_role: recipientRole,
  });
}

export async function getMeetingReminderRecipients(
  supabase: SupabaseClient,
  meetingId: string
): Promise<MeetingReminderRecipient[]> {
  const recipients = new Map<string, MeetingReminderRecipient>();

  const { data: participants, error: participantsError } = await supabase
    .from("meeting_participants")
    .select("user_id, role")
    .eq("meeting_id", meetingId);

  if (participantsError) {
    throw participantsError;
  }

  for (const participant of participants || []) {
    addRecipient(
      recipients,
      participant.user_id,
      participant.role === "coordinator" ? "coordinator" : "participant"
    );
  }

  const { data: admins, error: adminsError } = await supabase
    .from("accounts")
    .select("id")
    .in("role", ADMIN_ROLES)
    .eq("account_status", "active");

  if (adminsError) {
    throw adminsError;
  }

  for (const admin of admins || []) {
    addRecipient(recipients, admin.id, "admin");
  }

  return Array.from(recipients.values());
}

export function buildMeetingReminderNotifications({
  meetingId,
  scheduledAtIso,
  recipients,
  now = new Date(),
}: {
  meetingId: string;
  scheduledAtIso: string;
  recipients: MeetingReminderRecipient[];
  now?: Date;
}): ScheduledMeetingNotification[] {
  const scheduledAt = new Date(scheduledAtIso);
  const notifications: ScheduledMeetingNotification[] = [];

  for (const recipient of recipients) {
    const offsets =
      recipient.recipient_role === "participant"
        ? PARTICIPANT_NOTIFICATION_OFFSETS
        : OPERATIONS_NOTIFICATION_OFFSETS;

    for (const offset of offsets) {
      const notifyTime = new Date(
        scheduledAt.getTime() - offset.minutesBefore * 60 * 1000
      );

      if (notifyTime <= now) {
        if (offset.type !== "rules" || scheduledAt <= now) {
          continue;
        }
      }

      notifications.push({
        meeting_id: meetingId,
        user_id: recipient.user_id,
        notification_type: offset.type,
        sent_at: notifyTime > now ? notifyTime.toISOString() : now.toISOString(),
        email_sent: false,
        dashboard_sent: false,
      });
    }
  }

  return notifications;
}

export async function scheduleMeetingNotificationsForMeeting(
  supabase: SupabaseClient,
  meetingId: string,
  scheduledAtIso: string
) {
  const recipients = await getMeetingReminderRecipients(supabase, meetingId);
  const notifications = buildMeetingReminderNotifications({
    meetingId,
    scheduledAtIso,
    recipients,
  });

  if (notifications.length === 0) {
    return { recipients, notificationsScheduled: 0 };
  }

  const { error } = await supabase
    .from("meeting_notifications")
    .upsert(notifications, {
      onConflict: "meeting_id,user_id,notification_type",
    });

  if (error) {
    throw error;
  }

  return { recipients, notificationsScheduled: notifications.length };
}
