import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createZoomMeeting, deleteZoomMeeting } from "@/lib/zoom";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Helper to get authenticated user from request
 */
async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  return error || !user ? null : user;
}

/**
 * GET /api/meetings/video-link?meeting_id=xxx
 *
 * Fetch the video meeting link for a confirmed meeting.
 * Only participants can access the link.
 * If the link doesn't exist yet, generates one on-the-fly.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get("meeting_id");

    if (!meetingId) {
      return NextResponse.json(
        { error: "meeting_id is required" },
        { status: 400 }
      );
    }

    // Verify user is a participant
    const { data: participant } = await supabase
      .from("meeting_participants")
      .select("role")
      .eq("meeting_id", meetingId)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "You are not a participant in this meeting" },
        { status: 403 }
      );
    }

    // Get the meeting
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    // Meeting must be confirmed to get the video link
    if (meeting.status !== "confirmed" && meeting.status !== "completed") {
      return NextResponse.json(
        {
          error: "Meeting must be confirmed before accessing the video link",
          status: meeting.status,
        },
        { status: 400 }
      );
    }

    // Check if link already exists
    if (meeting.video_link) {
      return NextResponse.json({
        meeting_id: meetingId,
        video_link: meeting.video_link,
        video_password: meeting.video_password || null,
        zoom_meeting_id: meeting.zoom_meeting_id || null,
        scheduled_at: meeting.scheduled_at,
        is_fallback: meeting.video_link_is_fallback || false,
      });
    }

    // -------------------------------------------------------
    // Link doesn't exist yet — generate it now
    // -------------------------------------------------------

    // Get participant names for the meeting topic
    const { data: participants } = await supabase
      .from("meeting_participants")
      .select("user_id, role")
      .eq("meeting_id", meetingId);

    const guest = participants?.find((p) => p.role === "guest");
    const host = participants?.find((p) => p.role === "host");

    const { data: guestProfile } = await supabase
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", guest?.user_id || "")
      .single();

    const { data: hostProfile } = await supabase
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", host?.user_id || "")
      .single();

    const hostName = hostProfile?.first_name || "Host";
    const guestName = guestProfile?.first_name || "Guest";

    // Create the Zoom meeting
    const result = await createZoomMeeting({
      topic: `MatchIndeed: ${hostName} & ${guestName}`,
      startTime: meeting.scheduled_at,
      durationMinutes: 30,
      hostName,
      guestName,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to create video meeting link" },
        { status: 500 }
      );
    }

    // Store the link in the database
    const updateData: Record<string, any> = {
      video_link: result.join_url,
      video_password: result.password || null,
      video_link_is_fallback: result.is_fallback || false,
    };

    if (result.meeting_id) {
      updateData.zoom_meeting_id = String(result.meeting_id);
    }

    await supabase
      .from("meetings")
      .update(updateData)
      .eq("id", meetingId);

    return NextResponse.json({
      meeting_id: meetingId,
      video_link: result.join_url,
      video_password: result.password || null,
      zoom_meeting_id: result.meeting_id || null,
      scheduled_at: meeting.scheduled_at,
      is_fallback: result.is_fallback || false,
    });
  } catch (error) {
    console.error("Error in GET /api/meetings/video-link:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/meetings/video-link
 *
 * Manually generate/regenerate a video meeting link.
 * Only the host or admin can regenerate.
 *
 * Body:
 *   meeting_id — the meeting to generate a link for
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

    // Get the meeting
    const { data: meeting } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    // Only host or admin can regenerate
    const { data: participant } = await supabase
      .from("meeting_participants")
      .select("role")
      .eq("meeting_id", meeting_id)
      .eq("user_id", user.id)
      .single();

    const { data: account } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin =
      account?.role &&
      ["admin", "superadmin", "moderator"].includes(account.role);

    if (!isAdmin && participant?.role !== "host") {
      return NextResponse.json(
        { error: "Only the host or admin can regenerate meeting links" },
        { status: 403 }
      );
    }

    // Delete old Zoom meeting if it exists
    if (meeting.zoom_meeting_id) {
      await deleteZoomMeeting(meeting.zoom_meeting_id);
    }

    // Get participant names
    const { data: participants } = await supabase
      .from("meeting_participants")
      .select("user_id, role")
      .eq("meeting_id", meeting_id);

    const guest = participants?.find((p) => p.role === "guest");
    const host = participants?.find((p) => p.role === "host");

    const { data: guestProfile } = await supabase
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", guest?.user_id || "")
      .single();

    const { data: hostProfile } = await supabase
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", host?.user_id || "")
      .single();

    // Create new meeting
    const result = await createZoomMeeting({
      topic: `MatchIndeed: ${hostProfile?.first_name || "Host"} & ${guestProfile?.first_name || "Guest"}`,
      startTime: meeting.scheduled_at,
      durationMinutes: 30,
      hostName: hostProfile?.first_name,
      guestName: guestProfile?.first_name,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to create video meeting" },
        { status: 500 }
      );
    }

    // Update database
    const updateData: Record<string, any> = {
      video_link: result.join_url,
      video_password: result.password || null,
      video_link_is_fallback: result.is_fallback || false,
    };

    if (result.meeting_id) {
      updateData.zoom_meeting_id = String(result.meeting_id);
    }

    await supabase
      .from("meetings")
      .update(updateData)
      .eq("id", meeting_id);

    // Notify participants about the new meeting link
    for (const p of participants || []) {
      if (p.user_id !== user.id) {
        await supabase.from("notifications").insert({
          user_id: p.user_id,
          type: "meeting_link_updated",
          title: "Meeting Link Updated",
          message:
            "The video meeting link for your upcoming meeting has been updated. Please use the new link.",
          data: { meeting_id },
        });
      }
    }

    return NextResponse.json({
      success: true,
      video_link: result.join_url,
      video_password: result.password || null,
      zoom_meeting_id: result.meeting_id || null,
      is_fallback: result.is_fallback || false,
    });
  } catch (error) {
    console.error("Error in POST /api/meetings/video-link:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
