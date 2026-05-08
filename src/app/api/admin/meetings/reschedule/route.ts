import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import { createZoomMeeting, deleteZoomMeeting } from "@/lib/zoom";
import { buildMeetingVideoLinkUpdate } from "@/lib/meetings/video-link";
import { scheduleMeetingNotificationsForMeeting } from "@/lib/meetings/reminders";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type MeetingRow = {
  id: string;
  host_id: string;
  status: string;
  workflow_state: string | null;
  scheduled_at: string;
  video_link: string | null;
  zoom_meeting_id: string | null;
  video_link_is_fallback: boolean | null;
};

const RESCHEDULABLE_MEETING_STATUSES = new Set(["pending", "confirmed"]);

async function insertNotification(payload: {
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

  if (!modernInsert.error) return;

  await supabase.from("notifications").insert({
    user_id: payload.userId,
    notification_type: payload.type,
    site_enabled: true,
    push_enabled: true,
    email_enabled: true,
  });
}

async function createVideoLinkForMeeting(meetingId: string, scheduledAt: string) {
  const { data: participants } = await supabase
    .from("meeting_participants")
    .select("user_id, role")
    .eq("meeting_id", meetingId);

  const guest = participants?.find((participant) => participant.role === "guest");
  const host = participants?.find((participant) => participant.role === "host");

  const [{ data: guestProfile }, { data: hostProfile }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", guest?.user_id || "")
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", host?.user_id || "")
      .maybeSingle(),
  ]);

  const zoomResult = await createZoomMeeting({
    topic: `MatchIndeed: ${hostProfile?.first_name || "Host"} & ${guestProfile?.first_name || "Guest"}`,
    startTime: scheduledAt,
    durationMinutes: 30,
    hostName: hostProfile?.first_name || undefined,
    guestName: guestProfile?.first_name || undefined,
  });

  if (!zoomResult.success || !zoomResult.join_url || zoomResult.is_fallback) {
    return {
      ok: false as const,
      error:
        zoomResult.error ||
        "Unable to generate a live Zoom meeting link for this time.",
    };
  }

  return {
    ok: true as const,
    zoomResult,
    updateData: buildMeetingVideoLinkUpdate(zoomResult),
  };
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_meetings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json();
    const meetingId = typeof body.meeting_id === "string" ? body.meeting_id : "";
    const scheduledAtInput =
      typeof body.scheduled_at === "string" ? body.scheduled_at : "";
    const scheduledAt = new Date(scheduledAtInput);

    if (!meetingId || !scheduledAtInput || Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json(
        { error: "meeting_id and a valid scheduled_at are required" },
        { status: 400 }
      );
    }

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select(
        "id, host_id, status, workflow_state, scheduled_at, video_link, zoom_meeting_id, video_link_is_fallback"
      )
      .eq("id", meetingId)
      .maybeSingle();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const typedMeeting = meeting as MeetingRow;
    if (!RESCHEDULABLE_MEETING_STATUSES.has(typedMeeting.status)) {
      return NextResponse.json(
        {
          error: `Meeting cannot be rescheduled from status "${typedMeeting.status}"`,
          code: "meeting_not_reschedulable",
          status: typedMeeting.status,
        },
        { status: 400 }
      );
    }

    if (scheduledAt <= new Date()) {
      return NextResponse.json(
        {
          error: "Meeting must be rescheduled to a future date and time",
          code: "reschedule_time_in_past",
        },
        { status: 400 }
      );
    }

    let videoUpdate: Record<string, unknown> = {
      video_link: null,
      video_password: null,
      zoom_meeting_id: null,
      video_link_is_fallback: false,
    };
    let createdZoomMeetingId: string | null = null;

    if (typedMeeting.status === "confirmed") {
      const linkResult = await createVideoLinkForMeeting(
        meetingId,
        scheduledAt.toISOString()
      );

      if (!linkResult.ok) {
        return NextResponse.json({ error: linkResult.error }, { status: 500 });
      }

      videoUpdate = linkResult.updateData;
      createdZoomMeetingId = linkResult.zoomResult.meeting_id
        ? String(linkResult.zoomResult.meeting_id)
        : null;
    }

    if (typedMeeting.zoom_meeting_id) {
      await deleteZoomMeeting(typedMeeting.zoom_meeting_id).catch((error) => {
        console.warn(
          "[admin/meetings/reschedule] old Zoom delete failed:",
          error
        );
      });
    }

    const updatePayload = {
      scheduled_at: scheduledAt.toISOString(),
      ...videoUpdate,
    };

    const { data: updatedMeeting, error: updateError } = await supabase
      .from("meetings")
      .update(updatePayload)
      .eq("id", meetingId)
      .select(
        "id, status, workflow_state, scheduled_at, video_link, zoom_meeting_id, video_link_is_fallback"
      )
      .single();

    if (updateError) {
      if (createdZoomMeetingId) {
        await deleteZoomMeeting(createdZoomMeetingId).catch((error) => {
          console.warn(
            "[admin/meetings/reschedule] new Zoom cleanup failed:",
            error
          );
        });
      }
      console.error("[admin/meetings/reschedule] update error:", updateError);
      return NextResponse.json(
        {
          error: updateError.message || "Failed to reschedule meeting",
          code: updateError.code || "reschedule_update_failed",
        },
        { status: 500 }
      );
    }

    await scheduleMeetingNotificationsForMeeting(
      supabase,
      meetingId,
      scheduledAt.toISOString()
    ).catch((error) => {
      console.error(
        "[admin/meetings/reschedule] reminder scheduling error:",
        error
      );
    });

    const { data: participants } = await supabase
      .from("meeting_participants")
      .select("user_id")
      .eq("meeting_id", meetingId);

    await Promise.all(
      (participants || []).map((participant) =>
        insertNotification({
          userId: participant.user_id,
          type: "meeting_rescheduled",
          title: "Meeting rescheduled",
          message:
            "Your MatchIndeed meeting time has been updated. Please review your appointment details.",
          data: {
            meeting_id: meetingId,
            old_scheduled_at: typedMeeting.scheduled_at,
            scheduled_at: scheduledAt.toISOString(),
          },
        }).catch((error) => {
          console.warn(
            "[admin/meetings/reschedule] participant notification skipped:",
            error
          );
        })
      )
    );

    await supabase.from("admin_logs").insert({
      admin_id: guard.context.userId,
      target_user_id: typedMeeting.host_id,
      action: "meeting_rescheduled",
      meta: {
        meeting_id: meetingId,
        old_scheduled_at: typedMeeting.scheduled_at,
        new_scheduled_at: scheduledAt.toISOString(),
        zoom_meeting_id: updatedMeeting.zoom_meeting_id || null,
      },
    });

    return NextResponse.json({
      success: true,
      meeting: updatedMeeting,
    });
  } catch (error) {
    console.error("[admin/meetings/reschedule] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
