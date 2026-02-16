import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMeetingReminderEmail } from "@/lib/email";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/cron/meeting-notifications
 * 
 * Cron job endpoint to send pending meeting notifications
 * Should be called every minute by a cron service (Vercel Cron, etc.)
 * 
 * Headers:
 * - Authorization: Bearer <cron-secret> (for security)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    // Get notifications that should be sent now
    const { data: pendingNotifications, error: fetchError } = await supabase
      .from("meeting_notifications")
      .select(`
        *,
        meeting:meetings!inner(
          id,
          scheduled_at,
          status,
          meeting_participants(
            user_id,
            user:accounts!meeting_participants_user_id_fkey(
              id,
              email,
              display_name
            )
          )
        )
      `)
      .lte("sent_at", fiveMinutesFromNow.toISOString())
      .or("email_sent.is.null,email_sent.eq.false")
      .or("dashboard_sent.is.null,dashboard_sent.eq.false");

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
        count: 0
      });
    }

    const sentNotifications = [];
    const errors = [];

    for (const notification of pendingNotifications) {
      try {
        const meeting = notification.meeting as any;
        const participants = meeting.meeting_participants || [];
        
        // Get notification message based on type
        const notificationMessages: Record<string, string> = {
          "1hr": "Your video dating meeting is in 1 hour",
          "30min": "Your video dating meeting is in 30 minutes",
          "15min": "Your video dating meeting is in 15 minutes",
          "10min": "Your video dating meeting is in 10 minutes",
          "5min": "Your video dating meeting is in 5 minutes",
          "start": "Your video dating meeting is starting now",
          "rules": "Please review the meeting rules and etiquette",
        };

        const message = notificationMessages[notification.notification_type] || 
          "Meeting reminder";

        // Create dashboard notification
        if (!notification.dashboard_sent) {
          await supabase.from("notifications").insert({
            user_id: notification.user_id,
            type: "meeting_reminder",
            title: "Meeting Reminder",
            message: `${message}. Meeting scheduled for ${new Date(meeting.scheduled_at).toLocaleString()}`,
            data: { 
              meeting_id: meeting.id,
              notification_type: notification.notification_type 
            },
          });

          // Mark dashboard notification as sent
          await supabase
            .from("meeting_notifications")
            .update({ dashboard_sent: true })
            .eq("id", notification.id);
        }

        // Send email notification (if not already sent)
        if (!notification.email_sent) {
          try {
            const meeting = notification.meeting as any;
            const meetingParticipants = meeting.meeting_participants || [];

            // Build time-until string from notification type
            const timeUntilMap: Record<string, string> = {
              "1hr": "in 1 hour",
              "30min": "in 30 minutes",
              "15min": "in 15 minutes",
              "10min": "in 10 minutes",
              "5min": "in 5 minutes",
              "start": "starting now",
            };
            const timeUntil = timeUntilMap[notification.notification_type] || "soon";

            for (const p of meetingParticipants) {
              const { data: pAccount } = await supabase
                .from("accounts")
                .select("email")
                .eq("id", p.user_id)
                .single();

              const { data: pProfile } = await supabase
                .from("user_profiles")
                .select("first_name")
                .eq("user_id", p.user_id)
                .single();

              const otherP = meetingParticipants.find(
                (x: any) => x.user_id !== p.user_id
              );
              const { data: otherProfile } = await supabase
                .from("user_profiles")
                .select("first_name")
                .eq("user_id", otherP?.user_id || "")
                .single();

              if (pAccount?.email) {
                await sendMeetingReminderEmail(pAccount.email, {
                  recipientName: pProfile?.first_name || "User",
                  partnerName: otherProfile?.first_name || "Your match",
                  meetingDate: new Date(meeting.scheduled_at).toLocaleDateString(),
                  meetingTime: new Date(meeting.scheduled_at).toLocaleTimeString(),
                  timeUntil,
                });
              }
            }
          } catch (emailErr) {
            console.error("Error sending reminder email:", emailErr);
          }

          await supabase
            .from("meeting_notifications")
            .update({ 
              email_sent: true,
              sent_at: new Date().toISOString(),
            })
            .eq("id", notification.id);
        }

        sentNotifications.push(notification.id);
      } catch (error: any) {
        console.error(`Error processing notification ${notification.id}:`, error);
        errors.push({ notification_id: notification.id, error: error.message });
      }
    }

    return NextResponse.json({
      success: true,
      processed: pendingNotifications.length,
      sent: sentNotifications.length,
      errors: errors.length,
      error_details: errors,
    });
  } catch (error: any) {
    console.error("Error in cron job:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}
