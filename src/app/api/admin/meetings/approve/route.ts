import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMeetingApprovedEmail } from "@/lib/email";
import { createZoomMeeting, deleteZoomMeeting } from "@/lib/zoom";
import { formatInTimeZone, getSafeTimeZone } from "@/lib/timezones";
import { requireAdminAccess } from "@/lib/admin/permissions";
import { persistConfirmedMeetingVideoLinkIfMissing } from "@/lib/meetings/video-link";
import { scheduleMeetingNotificationsForMeeting } from "@/lib/meetings/reminders";
import {
  deriveWorkflowState,
  requireMeetingStateTransition,
  resolveStateForAdminApproval,
} from "@/lib/meetings/state-machine";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function insertNotification(
  userId: string,
  payload: {
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }
) {
  const preferredInsert = await supabase.from("notifications").insert({
    user_id: userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    data: payload.data || {},
  });

  if (!preferredInsert.error) {
    return;
  }

  await supabase.from("notifications").insert({
    user_id: userId,
    notification_type: payload.type,
    site_enabled: true,
    push_enabled: true,
    email_enabled: true,
  });
}

async function getUserTimeZone(userId: string) {
  const { data } = await supabase
    .from("calendar_configurations")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  return getSafeTimeZone(data?.timezone);
}

async function rollbackClaimedMeetingApproval(meetingId: string) {
  const { error } = await supabase
    .from("meetings")
    .update({
      status: "pending",
      workflow_state: "accepted",
    })
    .eq("id", meetingId)
    .eq("status", "confirmed")
    .is("video_link", null);

  if (error) {
    console.error(
      "[admin/meetings/approve] failed to roll back confirmed meeting:",
      error
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_meetings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const admin = guard.context;

    const body = await request.json();
    const meetingId = typeof body.meeting_id === "string" ? body.meeting_id : "";

    if (!meetingId) {
      return NextResponse.json(
        { error: "meeting_id is required" },
        { status: 400 }
      );
    }

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select(
        "id, host_id, status, workflow_state, scheduled_at, video_link, zoom_meeting_id, video_link_is_fallback"
      )
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if (meeting.status === "confirmed") {
      return NextResponse.json({
        success: true,
        already_confirmed: true,
        meeting_status: "confirmed",
        video_link_created: false,
        is_fallback: meeting.video_link_is_fallback || false,
      });
    }

    if (meeting.status !== "pending") {
      return NextResponse.json(
        { error: `Meeting cannot be approved from status "${meeting.status}"` },
        { status: 400 }
      );
    }

    const { data: participants, error: participantsError } = await supabase
      .from("meeting_participants")
      .select("user_id, role, response")
      .eq("meeting_id", meetingId);

    if (participantsError || !participants || participants.length === 0) {
      return NextResponse.json(
        { error: "Meeting participants could not be loaded" },
        { status: 500 }
      );
    }

    const meetingUsers = participants.filter((participant) =>
      ["host", "guest"].includes(participant.role)
    );
    const allAccepted =
      meetingUsers.length >= 2 &&
      meetingUsers.every((participant) => participant.response === "accepted");
    if (!allAccepted) {
      return NextResponse.json(
        { error: "Both parties must accept the meeting before admin approval." },
        { status: 400 }
      );
    }

    const currentWorkflowState = deriveWorkflowState({
      workflowState:
        typeof meeting.workflow_state === "string" ? meeting.workflow_state : null,
      status: meeting.status,
    });
    const targetWorkflowState = resolveStateForAdminApproval(currentWorkflowState);

    const transitionValidation = requireMeetingStateTransition({
      from: currentWorkflowState,
      to: targetWorkflowState,
    });

    if (!transitionValidation.allowed) {
      return NextResponse.json(
        {
          error: "invalid_state_transition",
          message:
            transitionValidation.message ||
            "Meeting cannot be approved from its current workflow state.",
        },
        { status: 409 }
      );
    }

    const { data: claimedMeeting, error: claimError } = await supabase
      .from("meetings")
      .update({
        status: "confirmed",
        workflow_state: targetWorkflowState,
      })
      .eq("id", meetingId)
      .eq("status", "pending")
      .select(
        "id, host_id, status, workflow_state, scheduled_at, video_link, zoom_meeting_id, video_link_is_fallback"
      )
      .maybeSingle();

    if (claimError) {
      console.error("[admin/meetings/approve] claim error:", claimError);
      return NextResponse.json(
        { error: "Failed to claim meeting for approval" },
        { status: 500 }
      );
    }

    if (!claimedMeeting) {
      const { data: currentMeeting } = await supabase
        .from("meetings")
        .select("status, video_link, video_link_is_fallback")
        .eq("id", meetingId)
        .maybeSingle();

      if (currentMeeting?.status === "confirmed") {
        return NextResponse.json({
          success: true,
          already_confirmed: true,
          meeting_status: "confirmed",
          video_link_created: false,
          is_fallback: currentMeeting.video_link_is_fallback || false,
        });
      }

      return NextResponse.json(
        {
          error: "Meeting approval state changed. Refresh the list and try again.",
        },
        { status: 409 }
      );
    }

    const guest = meetingUsers.find((participant) => participant.role === "guest");
    const host = meetingUsers.find((participant) => participant.role === "host");

    const [{ data: guestProfile }, { data: hostProfile }] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("first_name")
        .eq("user_id", guest?.user_id || "")
        .single(),
      supabase
        .from("user_profiles")
        .select("first_name")
        .eq("user_id", host?.user_id || "")
        .single(),
    ]);

    const zoomResult = await createZoomMeeting({
      topic: `MatchIndeed: ${hostProfile?.first_name || "Host"} & ${guestProfile?.first_name || "Guest"}`,
      startTime: claimedMeeting.scheduled_at,
      durationMinutes: 30,
      hostName: hostProfile?.first_name || undefined,
      guestName: guestProfile?.first_name || undefined,
    });

    if (!zoomResult.success || !zoomResult.join_url || zoomResult.is_fallback) {
      await rollbackClaimedMeetingApproval(meetingId);
      return NextResponse.json(
        {
          error:
            zoomResult.error ||
            "Unable to generate a live Zoom meeting link. Please verify Zoom integration and try approval again.",
        },
        { status: 500 }
      );
    }

    let persistedMeetingLink;
    try {
      persistedMeetingLink = await persistConfirmedMeetingVideoLinkIfMissing({
        supabase,
        meetingId,
        zoomResult,
      });
    } catch (persistError) {
      await rollbackClaimedMeetingApproval(meetingId);
      if (zoomResult.meeting_id) {
        await deleteZoomMeeting(String(zoomResult.meeting_id)).catch((error) => {
          console.error(
            "[admin/meetings/approve] failed to delete Zoom meeting after persist error:",
            error
          );
        });
      }

      console.error("Error approving meeting:", persistError);
      return NextResponse.json(
        { error: "Failed to approve meeting" },
        { status: 500 }
      );
    }

    await supabase.from("admin_logs").insert({
      admin_id: admin.userId,
      target_user_id: claimedMeeting.host_id,
      action: "meeting_approved",
      meta: {
        meeting_id: meetingId,
        approved_at: new Date().toISOString(),
        zoom_meeting_id: persistedMeetingLink.zoom_meeting_id || null,
      },
    });

    try {
      await scheduleMeetingNotificationsForMeeting(
        supabase,
        meetingId,
        claimedMeeting.scheduled_at
      );
    } catch (notificationError) {
      console.error("Error scheduling meeting notifications:", notificationError);
    }

    const participantIds = meetingUsers.map((participant) => participant.user_id);
    const [{ data: accounts }, { data: profiles }] = await Promise.all([
      supabase
        .from("accounts")
        .select("id, email")
        .in("id", participantIds),
      supabase
        .from("user_profiles")
        .select("user_id, first_name")
        .in("user_id", participantIds),
    ]);

    for (const participant of meetingUsers) {
      const accountRow = accounts?.find((entry) => entry.id === participant.user_id);
      const profileRow = profiles?.find((entry) => entry.user_id === participant.user_id);
      const partner = meetingUsers.find((entry) => entry.user_id !== participant.user_id);
      const partnerProfile = profiles?.find((entry) => entry.user_id === partner?.user_id);

      await insertNotification(participant.user_id, {
        type: "meeting_accepted",
        title: "Meeting Approved",
        message: "Your meeting has been approved by MatchIndeed. The Zoom link is ready in your appointments.",
        data: {
          meeting_id: meetingId,
          scheduled_at: claimedMeeting.scheduled_at,
        },
      });

      if (accountRow?.email) {
        const participantTimeZone = await getUserTimeZone(participant.user_id);
        await sendMeetingApprovedEmail(accountRow.email, {
          recipientName: profileRow?.first_name || "User",
          partnerName: partnerProfile?.first_name || "Your match",
          meetingDate: formatInTimeZone(
            claimedMeeting.scheduled_at,
            participantTimeZone,
            "en-US",
            {
              month: "numeric",
              day: "numeric",
              year: "numeric",
            }
          ),
          meetingTime: formatInTimeZone(
            claimedMeeting.scheduled_at,
            participantTimeZone,
            "en-US",
            {
              hour: "numeric",
              minute: "2-digit",
            }
          ),
          meetingTimeZone: participantTimeZone,
        });
      }
    }

    return NextResponse.json({
      success: true,
      meeting_status: "confirmed",
      video_link_created: persistedMeetingLink.created_now,
      meeting_link_reused: !persistedMeetingLink.created_now,
      is_fallback: persistedMeetingLink.is_fallback,
    });
  } catch (error) {
    console.error("Error in POST /api/admin/meetings/approve:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
