import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMeetingReminderEmail } from "@/lib/email";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/meetings/notifications/schedule
 * 
 * Schedule pre-meeting notifications for a meeting
 * This should be called when a meeting is confirmed
 * Body:
 * - meeting_id: Meeting ID
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { meeting_id } = body;

    if (!meeting_id) {
      return NextResponse.json(
        { error: "meeting_id is required" },
        { status: 400 }
      );
    }

    // Get meeting details
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("scheduled_at, status")
      .eq("id", meeting_id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    if (meeting.status !== "confirmed") {
      return NextResponse.json(
        { error: "Meeting must be confirmed to schedule notifications" },
        { status: 400 }
      );
    }

    // Get all participants
    const { data: participants, error: participantsError } = await supabase
      .from("meeting_participants")
      .select("user_id")
      .eq("meeting_id", meeting_id);

    if (participantsError || !participants) {
      return NextResponse.json(
        { error: "Failed to fetch participants" },
        { status: 500 }
      );
    }

    const scheduledAt = new Date(meeting.scheduled_at);
    const now = new Date();

    // Calculate notification times
    const notificationTimes = {
      "1hr": new Date(scheduledAt.getTime() - 60 * 60 * 1000),
      "30min": new Date(scheduledAt.getTime() - 30 * 60 * 1000),
      "15min": new Date(scheduledAt.getTime() - 15 * 60 * 1000),
      "10min": new Date(scheduledAt.getTime() - 10 * 60 * 1000),
      "5min": new Date(scheduledAt.getTime() - 5 * 60 * 1000),
      "start": scheduledAt,
      "rules": now, // Send rules immediately
    };

    // Create notification records for each participant
    const notifications = [];
    for (const participant of participants) {
      for (const [type, notifyTime] of Object.entries(notificationTimes)) {
        // Only schedule future notifications
        if (notifyTime > now) {
          notifications.push({
            meeting_id,
            user_id: participant.user_id,
            notification_type: type,
            sent_at: notifyTime.toISOString(),
            email_sent: false,
            dashboard_sent: false,
          });
        }
      }
    }

    if (notifications.length > 0) {
      const { error: insertError } = await supabase
        .from("meeting_notifications")
        .upsert(notifications, {
          onConflict: "meeting_id,user_id,notification_type",
        });

      if (insertError) {
        console.error("Error creating notifications:", insertError);
        return NextResponse.json(
          { error: "Failed to schedule notifications" },
          { status: 500 }
        );
      }
    }

    // Send rules notification immediately
    for (const participant of participants) {
      // Create dashboard notification
      await supabase.from("notifications").insert({
        user_id: participant.user_id,
        type: "meeting_rules",
        title: "Meeting Rules & Etiquette",
        message: "Please review the meeting rules and etiquette before your scheduled meeting.",
        data: { meeting_id },
      });

      // Send email with meeting rules/reminder
      try {
        const { data: pAccount } = await supabase
          .from("accounts")
          .select("email")
          .eq("id", participant.user_id)
          .single();

        const { data: pProfile } = await supabase
          .from("user_profiles")
          .select("first_name")
          .eq("user_id", participant.user_id)
          .single();

        const { data: meetingData } = await supabase
          .from("meetings")
          .select("scheduled_at")
          .eq("id", meeting_id)
          .single();

        // Get partner name
        const otherP = participants.find(
          (p: any) => p.user_id !== participant.user_id
        );
        const { data: otherProfile } = await supabase
          .from("user_profiles")
          .select("first_name")
          .eq("user_id", otherP?.user_id || "")
          .single();

        if (pAccount?.email && meetingData) {
          await sendMeetingReminderEmail(pAccount.email, {
            recipientName: pProfile?.first_name || "User",
            partnerName: otherProfile?.first_name || "Your match",
            meetingDate: new Date(meetingData.scheduled_at).toLocaleDateString(),
            meetingTime: new Date(meetingData.scheduled_at).toLocaleTimeString(),
            timeUntil: "coming up soon",
          });
        }
      } catch (emailErr) {
        console.error("Error sending meeting rules email:", emailErr);
      }
    }

    return NextResponse.json({ 
      success: true,
      notifications_scheduled: notifications.length
    });
  } catch (error) {
    console.error("Error in POST /api/meetings/notifications/schedule:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/meetings/notifications
 * 
 * Get pending notifications that need to be sent
 * This endpoint should be called by a cron job
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    // Get notifications that should be sent now
    const { data: pendingNotifications, error } = await supabase
      .from("meeting_notifications")
      .select(`
        *,
        meeting:meetings!inner(
          id,
          scheduled_at,
          status,
          meeting_participants(
            user_id
          )
        )
      `)
      .lte("sent_at", fiveMinutesFromNow.toISOString())
      .eq("email_sent", false)
      .eq("dashboard_sent", false);

    if (error) {
      console.error("Error fetching pending notifications:", error);
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      notifications: pendingNotifications || [],
      count: pendingNotifications?.length || 0
    });
  } catch (error) {
    console.error("Error in GET /api/meetings/notifications:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
