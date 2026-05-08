import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateCronAuth } from "@/lib/cron-auth";
import { scheduleMeetingNotificationsForMeeting } from "@/lib/meetings/reminders";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Helper to get authenticated user from request
 */
async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

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
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Verify requester is a participant or admin.
    const { data: participant } = await supabase
      .from("meeting_participants")
      .select("user_id")
      .eq("meeting_id", meeting_id)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: account } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin =
      !!account?.role &&
      ["admin", "superadmin"].includes(account.role);

    if (!participant && !isAdmin) {
      return NextResponse.json(
        { error: "You are not authorized to schedule notifications for this meeting" },
        { status: 403 }
      );
    }

    if (meeting.status !== "confirmed") {
      return NextResponse.json(
        { error: "Meeting must be confirmed to schedule notifications" },
        { status: 400 }
      );
    }

    const { notificationsScheduled } =
      await scheduleMeetingNotificationsForMeeting(
        supabase,
        meeting_id,
        meeting.scheduled_at
      );

    return NextResponse.json({ 
      success: true,
      notifications_scheduled: notificationsScheduled
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
    const cronAuth = validateCronAuth(request);
    if (!cronAuth.authorized) {
      return NextResponse.json(
        { error: cronAuth.error || "Unauthorized" },
        { status: cronAuth.status }
      );
    }

    const now = new Date();
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
      .lte("sent_at", now.toISOString())
      .or("email_sent.is.null,email_sent.eq.false,dashboard_sent.is.null,dashboard_sent.eq.false");

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
