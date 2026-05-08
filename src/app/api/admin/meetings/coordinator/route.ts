import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import { sendRawHtmlEmail } from "@/lib/email";
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
  scheduled_at: string;
};

type CoordinatorRow = {
  id: string;
  name: string;
  email: string;
  user_id: string | null;
  enabled: boolean | null;
};

const COORDINATOR_ASSIGNABLE_MEETING_STATUSES = new Set(["pending", "confirmed"]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

  if (!modernInsert.error) {
    return;
  }

  await supabase.from("notifications").insert({
    user_id: payload.userId,
    notification_type: payload.type,
    site_enabled: true,
    push_enabled: true,
    email_enabled: true,
  });
}

async function loadMeeting(meetingId: string): Promise<MeetingRow | null> {
  const { data, error } = await supabase
    .from("meetings")
    .select("id, host_id, status, scheduled_at")
    .eq("id", meetingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as MeetingRow | null) || null;
}

async function deleteCoordinatorReminderRows(meetingId: string, userIds: string[]) {
  if (userIds.length === 0) return;

  await supabase
    .from("meeting_notifications")
    .delete()
    .eq("meeting_id", meetingId)
    .in("user_id", userIds)
    .in("notification_type", ["30min", "10min"]);
}

function buildAssignmentEmail({
  coordinatorName,
  scheduledAt,
}: {
  coordinatorName: string;
  scheduledAt: string;
}) {
  const dashboardUrl = `${
    process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com"
  }/coordinator/dashboard`;
  const scheduled = new Date(scheduledAt).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:24px;color:#111827;">
      <div style="background:#1f419a;color:#ffffff;border-radius:16px 16px 0 0;padding:24px;text-align:center;">
        <h1 style="margin:0;font-size:24px;">Meeting Assigned</h1>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 16px 16px;padding:24px;">
        <p>Hi ${escapeHtml(coordinatorName)},</p>
        <p>You have been assigned to support a MatchIndeed video meeting.</p>
        <div style="background:#eef4ff;border-left:4px solid #1f419a;border-radius:8px;padding:16px;margin:18px 0;">
          <p style="margin:0;"><strong>Scheduled:</strong> ${escapeHtml(scheduled)}</p>
        </div>
        <p>Please open your coordinator dashboard to review the meeting and join when it is time.</p>
        <p style="text-align:center;margin-top:24px;">
          <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#1f419a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Open Coordinator Dashboard</a>
        </p>
      </div>
    </div>
  `;
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
    const coordinatorId =
      typeof body.coordinator_id === "string" ? body.coordinator_id : "";

    if (!meetingId || !coordinatorId) {
      return NextResponse.json(
        { error: "meeting_id and coordinator_id are required" },
        { status: 400 }
      );
    }

    const meeting = await loadMeeting(meetingId);
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if (!COORDINATOR_ASSIGNABLE_MEETING_STATUSES.has(meeting.status)) {
      return NextResponse.json(
        {
          error:
            "Only pending or confirmed meetings can be assigned to a coordinator.",
        },
        { status: 400 }
      );
    }

    const { data: coordinator, error: coordinatorError } = await supabase
      .from("meeting_coordinators")
      .select("id, name, email, user_id, enabled")
      .eq("id", coordinatorId)
      .maybeSingle();

    if (coordinatorError) {
      console.error("[admin/meetings/coordinator][POST] coordinator error:", coordinatorError);
      return NextResponse.json(
        { error: "Failed to load coordinator" },
        { status: 500 }
      );
    }

    const typedCoordinator = coordinator as CoordinatorRow | null;
    if (!typedCoordinator || typedCoordinator.enabled === false || !typedCoordinator.user_id) {
      return NextResponse.json(
        { error: "Coordinator must be enabled and linked to a user account." },
        { status: 400 }
      );
    }

    const { data: existingParticipant, error: participantError } = await supabase
      .from("meeting_participants")
      .select("role")
      .eq("meeting_id", meetingId)
      .eq("user_id", typedCoordinator.user_id)
      .maybeSingle();

    if (participantError) {
      console.error(
        "[admin/meetings/coordinator][POST] participant lookup error:",
        participantError
      );
      return NextResponse.json(
        { error: "Failed to verify meeting participants" },
        { status: 500 }
      );
    }

    if (
      existingParticipant &&
      ["host", "guest"].includes(String(existingParticipant.role))
    ) {
      return NextResponse.json(
        { error: "A host or guest cannot be assigned as this meeting coordinator." },
        { status: 400 }
      );
    }

    const { data: oldCoordinators } = await supabase
      .from("meeting_participants")
      .select("user_id")
      .eq("meeting_id", meetingId)
      .eq("role", "coordinator");

    const oldCoordinatorIds = (oldCoordinators || [])
      .map((row) => row.user_id)
      .filter((userId): userId is string => typeof userId === "string");

    await supabase
      .from("meeting_participants")
      .delete()
      .eq("meeting_id", meetingId)
      .eq("role", "coordinator");

    const nowIso = new Date().toISOString();
    const { error: assignError } = await supabase
      .from("meeting_participants")
      .upsert(
        {
          meeting_id: meetingId,
          user_id: typedCoordinator.user_id,
          role: "coordinator",
          response: "accepted",
          responded_at: nowIso,
        },
        { onConflict: "meeting_id,user_id" }
      );

    if (assignError) {
      console.error("[admin/meetings/coordinator][POST] assign error:", assignError);
      return NextResponse.json(
        { error: "Failed to assign coordinator" },
        { status: 500 }
      );
    }

    await deleteCoordinatorReminderRows(meetingId, oldCoordinatorIds);

    if (
      meeting.status === "confirmed" &&
      new Date(meeting.scheduled_at).getTime() > Date.now()
    ) {
      await scheduleMeetingNotificationsForMeeting(
        supabase,
        meetingId,
        meeting.scheduled_at
      ).catch((error) => {
        console.error(
          "[admin/meetings/coordinator][POST] reminder scheduling error:",
          error
        );
      });
    }

    await insertNotification({
      userId: typedCoordinator.user_id,
      type: "meeting_coordinator_assigned",
      title: "Meeting assigned",
      message: "You have been assigned to support a MatchIndeed video meeting.",
      data: {
        meeting_id: meetingId,
        scheduled_at: meeting.scheduled_at,
        coordinator_id: typedCoordinator.id,
      },
    }).catch((error) => {
      console.warn(
        "[admin/meetings/coordinator][POST] notification skipped:",
        error
      );
    });

    if (typedCoordinator.email) {
      await sendRawHtmlEmail(
        typedCoordinator.email,
        "MatchIndeed meeting assigned to you",
        buildAssignmentEmail({
          coordinatorName: typedCoordinator.name,
          scheduledAt: meeting.scheduled_at,
        })
      ).catch((error) => {
        console.warn("[admin/meetings/coordinator][POST] email skipped:", error);
      });
    }

    await supabase.from("admin_logs").insert({
      admin_id: guard.context.userId,
      target_user_id: typedCoordinator.user_id,
      action: "meeting_coordinator_assigned",
      meta: {
        meeting_id: meetingId,
        coordinator_id: typedCoordinator.id,
        previous_coordinator_user_ids: oldCoordinatorIds,
      },
    });

    return NextResponse.json({
      success: true,
      coordinator: {
        id: typedCoordinator.id,
        user_id: typedCoordinator.user_id,
        name: typedCoordinator.name,
        email: typedCoordinator.email,
      },
    });
  } catch (error) {
    console.error("[admin/meetings/coordinator][POST] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_meetings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json();
    const meetingId = typeof body.meeting_id === "string" ? body.meeting_id : "";

    if (!meetingId) {
      return NextResponse.json(
        { error: "meeting_id is required" },
        { status: 400 }
      );
    }

    const { data: oldCoordinators } = await supabase
      .from("meeting_participants")
      .select("user_id")
      .eq("meeting_id", meetingId)
      .eq("role", "coordinator");

    const oldCoordinatorIds = (oldCoordinators || [])
      .map((row) => row.user_id)
      .filter((userId): userId is string => typeof userId === "string");

    const { error } = await supabase
      .from("meeting_participants")
      .delete()
      .eq("meeting_id", meetingId)
      .eq("role", "coordinator");

    if (error) {
      console.error("[admin/meetings/coordinator][DELETE] unassign error:", error);
      return NextResponse.json(
        { error: "Failed to unassign coordinator" },
        { status: 500 }
      );
    }

    await deleteCoordinatorReminderRows(meetingId, oldCoordinatorIds);

    await supabase.from("admin_logs").insert({
      admin_id: guard.context.userId,
      target_user_id: oldCoordinatorIds[0] || null,
      action: "meeting_coordinator_unassigned",
      meta: {
        meeting_id: meetingId,
        coordinator_user_ids: oldCoordinatorIds,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/meetings/coordinator][DELETE] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
