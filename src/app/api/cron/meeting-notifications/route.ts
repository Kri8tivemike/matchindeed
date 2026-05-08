import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMeetingReminderEmail, sendRawHtmlEmail } from "@/lib/email";
import { validateCronAuth } from "@/lib/cron-auth";
import { getEtiquetteSummaryMessage } from "@/lib/meetings/etiquette";
import { expireStalePendingMeetingRequests } from "@/lib/meetings/pending-expiration";
import { refundExpiredUnusedCreditBackedSlots } from "@/lib/calendar/unused-slot-refunds";
import { sendPushNotificationIfAllowed } from "@/lib/onesignal";
import { adminAbsoluteUrl, adminPath } from "@/lib/admin/path";
import { formatInTimeZone, getSafeTimeZone } from "@/lib/timezones";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AccountData = {
  id: string;
  email: string | null;
  display_name: string | null;
  role?: string | null;
};

type MeetingParticipant = {
  user_id: string;
  role?: string | null;
  user?: AccountData | AccountData[] | null;
};

type MeetingData = {
  id: string;
  scheduled_at: string;
  status: string;
  meeting_participants: MeetingParticipant[] | null;
};

type MeetingNotification = {
  id: string;
  user_id: string;
  notification_type: string;
  email_sent: boolean | null;
  dashboard_sent: boolean | null;
  recipient?: AccountData | AccountData[] | null;
  meeting: MeetingData | MeetingData[] | null;
};

type NotificationError = {
  notification_id: string;
  error: string;
};

const ADMIN_ROLES = new Set(["admin", "superadmin"]);

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

function isAdminRole(role: string | null | undefined) {
  return !!role && ADMIN_ROLES.has(role);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getUserTimeZone(userId: string) {
  const { data } = await supabase
    .from("calendar_configurations")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  return getSafeTimeZone(data?.timezone);
}

function getParticipantAccount(participant: MeetingParticipant) {
  return firstOrNull(participant.user);
}

function getParticipantName(participant: MeetingParticipant | undefined) {
  if (!participant) return "Your match";
  return getParticipantAccount(participant)?.display_name || "Your match";
}

function getMeetingPairNames(meetingParticipants: MeetingParticipant[]) {
  const host = meetingParticipants.find((participant) => participant.role === "host");
  const guest = meetingParticipants.find((participant) => participant.role === "guest");

  return {
    hostName: getParticipantName(host),
    guestName: getParticipantName(guest),
    pairName: [getParticipantName(host), getParticipantName(guest)]
      .filter(Boolean)
      .join(" and "),
  };
}

function getReminderMetadata(notificationType: string) {
  const notificationMessages: Record<string, string> = {
    "1hr": "Your video meeting starts in 1 hour",
    "30min": "Your video meeting starts in 30 minutes",
    "15min": "Your video meeting starts in 15 minutes",
    "10min": "Your video meeting starts in 10 minutes",
    "5min": "Your video meeting starts in 5 minutes",
    start: "Your video meeting is starting now",
    rules: getEtiquetteSummaryMessage(),
  };
  const reminderTitles: Record<string, string> = {
    "1hr": "Meeting starts in 1 hour",
    "30min": "Meeting starts in 30 minutes",
    "15min": "Meeting starts in 15 minutes",
    "10min": "Meeting starts in 10 minutes",
    "5min": "Meeting starts in 5 minutes",
    start: "Meeting is starting now",
    rules: "Meeting rules reminder",
  };
  const timeUntilMap: Record<string, string> = {
    "1hr": "in 1 hour",
    "30min": "in 30 minutes",
    "15min": "in 15 minutes",
    "10min": "in 10 minutes",
    "5min": "in 5 minutes",
    start: "starting now",
    rules: "in 1 hour (etiquette acknowledgment required)",
  };

  return {
    message: notificationMessages[notificationType] || "Meeting reminder",
    title: reminderTitles[notificationType] || "Meeting reminder",
    timeUntil: timeUntilMap[notificationType] || "soon",
  };
}

function buildOperationsReminderHtml({
  recipientName,
  hostName,
  guestName,
  meetingDateTime,
  timeUntil,
  actionUrl,
}: {
  recipientName: string;
  hostName: string;
  guestName: string;
  meetingDateTime: string;
  timeUntil: string;
  actionUrl: string;
}) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:24px;color:#111827;">
      <div style="background:#1f419a;color:#ffffff;border-radius:16px 16px 0 0;padding:24px;text-align:center;">
        <h1 style="margin:0;font-size:24px;">MatchIndeed Meeting Reminder</h1>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 16px 16px;padding:24px;">
        <p>Hi ${escapeHtml(recipientName)},</p>
        <p>A MatchIndeed video meeting is coming up <strong>${escapeHtml(timeUntil)}</strong>.</p>
        <div style="background:#eef4ff;border-left:4px solid #1f419a;border-radius:8px;padding:16px;margin:18px 0;">
          <p style="margin:0 0 8px;"><strong>Meeting:</strong> ${escapeHtml(hostName)} and ${escapeHtml(guestName)}</p>
          <p style="margin:0;"><strong>Scheduled:</strong> ${escapeHtml(meetingDateTime)}</p>
        </div>
        <p>Please be ready to monitor or support the meeting if needed.</p>
        <p style="text-align:center;margin-top:24px;">
          <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#1f419a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Open Meeting Management</a>
        </p>
      </div>
    </div>
  `;
}

async function markNotificationSent(
  notificationId: string,
  updates: { email_sent?: boolean; dashboard_sent?: boolean }
) {
  await supabase
    .from("meeting_notifications")
    .update({
      ...updates,
      sent_at: new Date().toISOString(),
    })
    .eq("id", notificationId);
}

async function insertReminderNotification(payload: {
  userId: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
}) {
  const modernInsert = await supabase.from("notifications").insert({
    user_id: payload.userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    data: payload.data,
  });

  if (!modernInsert.error) {
    return { ok: true, error: null as string | null };
  }

  const fallbackInsert = await supabase.from("notifications").insert({
    user_id: payload.userId,
    notification_type: payload.type,
    site_enabled: true,
    push_enabled: true,
    email_enabled: true,
  });

  if (fallbackInsert.error) {
    return {
      ok: false,
      error: `${modernInsert.error.message}; ${fallbackInsert.error.message}`,
    };
  }

  return { ok: true, error: null as string | null };
}

/**
 * GET /api/cron/meeting-notifications
 *
 * Cron job endpoint to send pending meeting notifications.
 * Should be called every minute by a cron service.
 *
 * Headers:
 * - Authorization: Bearer <cron-secret> (for security)
 */
export async function GET(request: NextRequest) {
  try {
    const cronAuth = validateCronAuth(request);
    if (!cronAuth.authorized) {
      return NextResponse.json(
        { error: cronAuth.error || "Unauthorized" },
        { status: cronAuth.status }
      );
    }

    const expirationResult = await expireStalePendingMeetingRequests(supabase);
    const unusedSlotRefundResult =
      await refundExpiredUnusedCreditBackedSlots(supabase);
    const now = new Date();

    const { data: pendingNotifications, error: fetchError } = await supabase
      .from("meeting_notifications")
      .select(`
        *,
        recipient:accounts!meeting_notifications_user_id_fkey(
          id,
          email,
          display_name,
          role
        ),
        meeting:meetings!inner(
          id,
          scheduled_at,
          status,
          meeting_participants(
            user_id,
            role,
            user:accounts!meeting_participants_user_id_fkey(
              id,
              email,
              display_name
            )
          )
        )
      `)
      .lte("sent_at", now.toISOString())
      .or("email_sent.is.null,email_sent.eq.false,dashboard_sent.is.null,dashboard_sent.eq.false");

    if (fetchError) {
      console.error("Error fetching pending notifications:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 }
      );
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      return NextResponse.json({
        message: "No pending notifications",
        count: 0,
        expired_requests: expirationResult.expiredCount,
        unused_slots_removed: unusedSlotRefundResult.removedCount,
        unused_slot_refunds: unusedSlotRefundResult.refundedCount,
        unused_slot_refunded_credits: unusedSlotRefundResult.refundedCredits,
      });
    }

    const sentNotifications: string[] = [];
    const errors: NotificationError[] = [];

    for (const notification of pendingNotifications as MeetingNotification[]) {
      try {
        const meeting = firstOrNull(notification.meeting);
        const recipient = firstOrNull(notification.recipient);

        if (!meeting) {
          errors.push({ notification_id: notification.id, error: "Meeting data missing" });
          continue;
        }

        if (meeting.status !== "confirmed" || new Date(meeting.scheduled_at) <= now) {
          await markNotificationSent(notification.id, {
            email_sent: true,
            dashboard_sent: true,
          });
          continue;
        }

        const meetingParticipants = meeting.meeting_participants || [];
        const participantForRecipient = meetingParticipants.find(
          (participant) => participant.user_id === notification.user_id
        );
        const isAdminRecipient = isAdminRole(recipient?.role);
        const isCoordinatorRecipient = participantForRecipient?.role === "coordinator";
        const isOperationsRecipient =
          isAdminRecipient || isCoordinatorRecipient;
        const isMeetingUser =
          !!participantForRecipient && participantForRecipient.role !== "coordinator";

        if (!isAdminRecipient && !participantForRecipient) {
          await markNotificationSent(notification.id, {
            email_sent: true,
            dashboard_sent: true,
          });
          continue;
        }

        const recipientTimeZone = await getUserTimeZone(notification.user_id);
        const scheduledForRecipient = formatInTimeZone(
          meeting.scheduled_at,
          recipientTimeZone,
          "en-US",
          {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }
        );
        const meetingDate = formatInTimeZone(
          meeting.scheduled_at,
          recipientTimeZone,
          "en-US",
          {
            month: "short",
            day: "numeric",
            year: "numeric",
          }
        );
        const meetingTime = formatInTimeZone(
          meeting.scheduled_at,
          recipientTimeZone,
          "en-US",
          {
            hour: "numeric",
            minute: "2-digit",
          }
        );
        const { hostName, guestName, pairName } =
          getMeetingPairNames(meetingParticipants);
        const { message, title, timeUntil } = getReminderMetadata(
          notification.notification_type
        );
        const notificationType =
          notification.notification_type === "rules"
            ? "meeting_rules"
            : "meeting_reminder";
        const dashboardMessage = isOperationsRecipient
          ? `A MatchIndeed video meeting starts ${timeUntil}: ${pairName || "participants"} at ${scheduledForRecipient}.`
          : `${message}. Meeting scheduled for ${scheduledForRecipient}.`;
        const pushUrl = isAdminRecipient
          ? adminPath("/meetings")
          : isCoordinatorRecipient
            ? "/coordinator/dashboard"
            : "/dashboard/meetings?tab=upcoming";

        if (!notification.dashboard_sent) {
          const insertResult = await insertReminderNotification({
            userId: notification.user_id,
            type: notificationType,
            title: isOperationsRecipient ? `Admin: ${title}` : title,
            message: dashboardMessage,
            data: {
              meeting_id: meeting.id,
              notification_type: notification.notification_type,
              recipient_context: isOperationsRecipient ? "operations" : "participant",
            },
          });

          if (!insertResult.ok) {
            errors.push({
              notification_id: notification.id,
              error: `Dashboard notification failed: ${insertResult.error}`,
            });
          } else {
            await sendPushNotificationIfAllowed({
              userId: notification.user_id,
              type: notificationType,
              title: isOperationsRecipient ? `Admin: ${title}` : title,
              message: dashboardMessage,
              url: pushUrl,
              data: {
                meeting_id: meeting.id,
                notification_type: notification.notification_type,
              },
            });

            await markNotificationSent(notification.id, { dashboard_sent: true });
          }
        }

        if (!notification.email_sent) {
          if (!recipient?.email) {
            await markNotificationSent(notification.id, { email_sent: true });
          } else if (isMeetingUser) {
            const otherParticipant = meetingParticipants.find(
              (participant) => participant.user_id !== notification.user_id
            );
            const emailResult = await sendMeetingReminderEmail(
              recipient.email,
              {
                recipientName: recipient.display_name || "User",
                partnerName: getParticipantName(otherParticipant),
                meetingDate,
                meetingTime,
                meetingTimeZone: recipientTimeZone,
                timeUntil,
              },
              notification.user_id
            );

            if (emailResult.success) {
              await markNotificationSent(notification.id, { email_sent: true });
            } else {
              errors.push({
                notification_id: notification.id,
                error: emailResult.error || "Reminder email failed",
              });
            }
          } else if (isOperationsRecipient) {
            const actionUrl = isAdminRecipient
              ? adminAbsoluteUrl("/meetings")
              : `${process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com"}/coordinator/dashboard`;
            const emailResult = await sendRawHtmlEmail(
              recipient.email,
              `Reminder: MatchIndeed meeting starts ${timeUntil}`,
              buildOperationsReminderHtml({
                recipientName: recipient.display_name || "Coordinator",
                hostName,
                guestName,
                meetingDateTime: scheduledForRecipient,
                timeUntil,
                actionUrl,
              })
            );

            if (emailResult.success) {
              await markNotificationSent(notification.id, { email_sent: true });
            } else {
              errors.push({
                notification_id: notification.id,
                error: emailResult.error || "Operations reminder email failed",
              });
            }
          } else {
            await markNotificationSent(notification.id, { email_sent: true });
          }
        }

        sentNotifications.push(notification.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`Error processing notification ${notification.id}:`, error);
        errors.push({ notification_id: notification.id, error: message });
      }
    }

    return NextResponse.json({
      success: true,
      processed: pendingNotifications.length,
      sent: sentNotifications.length,
      expired_requests: expirationResult.expiredCount,
      unused_slots_removed: unusedSlotRefundResult.removedCount,
      unused_slot_refunds: unusedSlotRefundResult.refundedCount,
      unused_slot_refunded_credits: unusedSlotRefundResult.refundedCredits,
      errors: errors.length,
      error_details: errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in cron job:", error);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
