import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createZoomMeeting, deleteZoomMeeting } from "@/lib/zoom";
import { validateMeetingsAccess } from "@/middleware/subscription-check";
import { MEETING_ETIQUETTE_CHECKLIST, getEtiquetteSummaryMessage } from "@/lib/meetings/etiquette";
import { persistConfirmedMeetingVideoLinkIfMissing } from "@/lib/meetings/video-link";
import {
  deriveWorkflowState,
  requireMeetingStateTransition,
} from "@/lib/meetings/state-machine";
import {
  canAccessStarterTrialMeeting,
  getStarterTrialState,
} from "@/lib/starter-trial";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MEETING_JOIN_EARLY_MINUTES = 10;
const MEETING_JOIN_DURATION_MINUTES = 30;

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

async function isAdminUser(userId: string): Promise<boolean> {
  const { data: account } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", userId)
    .single();

  return !!account?.role && ["admin", "superadmin"].includes(account.role);
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

    const isAdmin = await isAdminUser(user.id);

    // Verify user is a participant unless they are an admin.
    const { data: participant } = await supabase
      .from("meeting_participants")
      .select("role")
      .eq("meeting_id", meetingId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!participant && !isAdmin) {
      return NextResponse.json(
        { error: "You are not a participant in this meeting" },
        { status: 403 }
      );
    }

    const isAssignedCoordinator = participant?.role === "coordinator";
    if (!isAdmin && !isAssignedCoordinator) {
      const accessValidation = await validateMeetingsAccess(user.id);
      if (!accessValidation.allowed) {
        const starterTrialState = await getStarterTrialState(supabase, user.id, {
          verifyActiveSlot: true,
        });

        if (!canAccessStarterTrialMeeting(starterTrialState, meetingId)) {
          return NextResponse.json(
            { error: "access_denied", message: accessValidation.message },
            { status: 403 }
          );
        }
      }
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

    // Require meeting etiquette acknowledgment before joining (participant side).
    if (!isAdmin) {
      const { data: ack } = await supabase
        .from("meeting_rule_acknowledgments")
        .select("acknowledged_at")
        .eq("meeting_id", meetingId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!ack?.acknowledged_at) {
        return NextResponse.json(
          {
            error: "rules_not_acknowledged",
            message: getEtiquetteSummaryMessage(),
            checklist: MEETING_ETIQUETTE_CHECKLIST,
          },
          { status: 428 }
        );
      }
    }

    const now = new Date();
    const meetingStart = new Date(meeting.scheduled_at);
    const joinWindowOpen = new Date(
      meetingStart.getTime() - MEETING_JOIN_EARLY_MINUTES * 60 * 1000
    );
    const joinWindowClosed = new Date(
      meetingStart.getTime() + MEETING_JOIN_DURATION_MINUTES * 60 * 1000
    );
    if (!isAdmin && now < joinWindowOpen) {
      return NextResponse.json(
        {
          error: "meeting_window_not_open",
          message: "This meeting can be joined 10 minutes before the scheduled time.",
          scheduled_at: meeting.scheduled_at,
        },
        { status: 403 }
      );
    }
    if (!isAdmin && now > joinWindowClosed) {
      return NextResponse.json(
        {
          error: "meeting_window_closed",
          message: "This meeting has passed and can no longer be joined.",
          scheduled_at: meeting.scheduled_at,
        },
        { status: 403 }
      );
    }
    const withinJoinWindow = now >= joinWindowOpen;
    if (withinJoinWindow && meeting.status === "confirmed") {
      const currentWorkflowState = deriveWorkflowState({
        workflowState:
          typeof meeting.workflow_state === "string"
            ? meeting.workflow_state
            : null,
        status: meeting.status,
      });
      const transitionValidation = requireMeetingStateTransition({
        from: currentWorkflowState,
        to: "in_progress",
      });
      if (transitionValidation.allowed && currentWorkflowState !== "in_progress") {
        await supabase
          .from("meetings")
          .update({
            workflow_state: "in_progress",
            in_progress_at: now.toISOString(),
          })
          .eq("id", meetingId);
      }
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

    if (!result.success || result.is_fallback) {
      return NextResponse.json(
        {
          error:
            result.error ||
            "Failed to create a live Zoom meeting link",
        },
        { status: 500 }
      );
    }
    if (!result.join_url) {
      return NextResponse.json(
        { error: "Video meeting link was not returned by provider" },
        { status: 500 }
      );
    }

    let persistedMeetingLink;
    try {
      persistedMeetingLink = await persistConfirmedMeetingVideoLinkIfMissing({
        supabase,
        meetingId,
        zoomResult: result,
      });
    } catch (persistError) {
      if (result.meeting_id) {
        await deleteZoomMeeting(String(result.meeting_id)).catch((error) => {
          console.error(
            "[meetings/video-link][GET] failed to delete Zoom meeting after persist error:",
            error
          );
        });
      }

      console.error(
        "[meetings/video-link][GET] failed to persist generated meeting link:",
        persistError
      );
      return NextResponse.json(
        { error: "Failed to save the generated video meeting link" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      meeting_id: meetingId,
      video_link: persistedMeetingLink.video_link,
      video_password: persistedMeetingLink.video_password,
      zoom_meeting_id: persistedMeetingLink.zoom_meeting_id,
      scheduled_at: persistedMeetingLink.scheduled_at || meeting.scheduled_at,
      is_fallback: persistedMeetingLink.is_fallback,
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

    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin) {
      const accessValidation = await validateMeetingsAccess(user.id);
      if (!accessValidation.allowed) {
        const starterTrialState = await getStarterTrialState(supabase, user.id, {
          verifyActiveSlot: true,
        });

        if (!canAccessStarterTrialMeeting(starterTrialState, meeting_id)) {
          return NextResponse.json(
            { error: "access_denied", message: accessValidation.message },
            { status: 403 }
          );
        }
      }
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

    if (meeting.status !== "confirmed" && meeting.status !== "completed") {
      return NextResponse.json(
        {
          error: "Meeting must be confirmed before generating a video link",
          status: meeting.status,
        },
        { status: 400 }
      );
    }

    // Only host or admin can regenerate
    const { data: participant } = await supabase
      .from("meeting_participants")
      .select("role")
      .eq("meeting_id", meeting_id)
      .eq("user_id", user.id)
      .single();

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

    if (!result.success || result.is_fallback) {
      return NextResponse.json(
        {
          error:
            result.error || "Failed to create a live Zoom meeting",
        },
        { status: 500 }
      );
    }
    if (!result.join_url) {
      return NextResponse.json(
        { error: "Video meeting link was not returned by provider" },
        { status: 500 }
      );
    }

    // Update database
    const updateData: {
      video_link: string;
      video_password: string | null;
      video_link_is_fallback: boolean;
      zoom_meeting_id?: string;
    } = {
      video_link: result.join_url,
      video_password: result.password || null,
      video_link_is_fallback: result.is_fallback || false,
    };

    if (result.meeting_id) {
      updateData.zoom_meeting_id = String(result.meeting_id);
    }

    const { error: updateError } = await supabase
      .from("meetings")
      .update(updateData)
      .eq("id", meeting_id);

    if (updateError) {
      if (result.meeting_id) {
        await deleteZoomMeeting(String(result.meeting_id)).catch((error) => {
          console.error(
            "[meetings/video-link][POST] failed to delete Zoom meeting after update error:",
            error
          );
        });
      }

      console.error("[meetings/video-link][POST] update error:", updateError);
      return NextResponse.json(
        { error: "Failed to save the generated video meeting link" },
        { status: 500 }
      );
    }

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
