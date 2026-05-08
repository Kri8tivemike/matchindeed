import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { COORDINATOR_PERMISSIONS } from "@/lib/admin-permissions";
import { loadEffectiveAccountPermissions } from "@/lib/account-permissions";
import { loadCoordinatorAccessForUser } from "@/lib/coordinator/server-access";
import { extractCoordinatorFeedback } from "@/lib/coordinator-feedback";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AccountRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: string | null;
  account_status: string | null;
};

type MeetingRow = {
  id: string;
  host_id: string;
  type: string | null;
  status: string;
  workflow_state: string | null;
  scheduled_at: string;
  location_pref: string | null;
  video_link: string | null;
  zoom_meeting_id: string | null;
  video_link_is_fallback: boolean | null;
  created_at: string;
};

type ParticipantRow = {
  meeting_id: string;
  user_id: string;
  role: string;
  response: string | null;
  responded_at: string | null;
};

type MeetingReportRow = {
  id: string;
  meeting_id: string;
  coordinator_id: string | null;
  coordinator_name: string | null;
  conclusion: string | null;
  participant_yes_no: unknown;
  host_decision: string | null;
  admin_notes: string | null;
  finalized: boolean | null;
  created_at: string | null;
};

const COORDINATOR_JOIN_EARLY_MINUTES = 10;
const COORDINATOR_JOIN_DURATION_MINUTES = 30;

function getCoordinatorJoinWindow(scheduledAt: string) {
  const scheduledTime = new Date(scheduledAt).getTime();
  if (Number.isNaN(scheduledTime)) {
    return {
      openAt: Number.POSITIVE_INFINITY,
      closeAt: Number.NEGATIVE_INFINITY,
    };
  }

  return {
    openAt: scheduledTime - COORDINATOR_JOIN_EARLY_MINUTES * 60 * 1000,
    closeAt: scheduledTime + COORDINATOR_JOIN_DURATION_MINUTES * 60 * 1000,
  };
}

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadCoordinatorAccessForUser(user.id);

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error || "Coordinator access required" },
        { status: access.status }
      );
    }

    const typedAccount = access.account as AccountRow | null;
    const coordinatorProfile = access.coordinator;
    const coordinatorPermissions =
      typedAccount?.role && ["admin", "superadmin"].includes(typedAccount.role)
        ? new Set<string>(COORDINATOR_PERMISSIONS)
        : (
            await loadEffectiveAccountPermissions(user.id, "coordinator")
          ).permissions;
    const canJoinApprovedMeetings = coordinatorPermissions.has(
      "join_approved_meetings"
    );

    const { data: assignedRows, error: assignedError } = await supabase
      .from("meeting_participants")
      .select("meeting_id")
      .eq("user_id", user.id)
      .eq("role", "coordinator");

    if (assignedError) {
      console.error("[coordinator/meetings][GET] assignments error:", assignedError);
      return NextResponse.json(
        { error: "Failed to load assigned meetings" },
        { status: 500 }
      );
    }

    const meetingIds = [
      ...new Set((assignedRows || []).map((row) => row.meeting_id).filter(Boolean)),
    ];

    if (meetingIds.length === 0) {
      return NextResponse.json({
        coordinator: coordinatorProfile || {
          name: typedAccount?.display_name || typedAccount?.email || "Coordinator",
          email: typedAccount?.email || null,
        },
        meetings: [],
        permissions: [...coordinatorPermissions],
      });
    }

    // coordinator_id in meeting_reports stores the meeting_coordinators record ID,
    // not the auth user ID — use coordinatorProfile.id when available.
    const coordinatorRecordId = (coordinatorProfile as { id?: string } | null)?.id;

    const [
      { data: meetings, error: meetingsError },
      { data: participants, error: participantsError },
      { data: reports, error: reportsError },
    ] =
      await Promise.all([
        supabase
          .from("meetings")
          .select(
            "id, host_id, type, status, workflow_state, scheduled_at, location_pref, video_link, zoom_meeting_id, video_link_is_fallback, created_at"
          )
          .in("id", meetingIds),
        supabase
          .from("meeting_participants")
          .select("meeting_id, user_id, role, response, responded_at")
          .in("meeting_id", meetingIds),
        coordinatorRecordId
          ? supabase
              .from("meeting_reports")
              .select(
                "id, meeting_id, coordinator_id, coordinator_name, conclusion, participant_yes_no, host_decision, admin_notes, finalized, created_at"
              )
              .in("meeting_id", meetingIds)
              .eq("coordinator_id", coordinatorRecordId)
              .order("created_at", { ascending: false })
          : supabase
              .from("meeting_reports")
              .select(
                "id, meeting_id, coordinator_id, coordinator_name, conclusion, participant_yes_no, host_decision, admin_notes, finalized, created_at"
              )
              .in("meeting_id", meetingIds)
              .order("created_at", { ascending: false }),
      ]);

    if (meetingsError || participantsError || reportsError) {
      console.error("[coordinator/meetings][GET] meeting load error:", {
        meetingsError,
        participantsError,
        reportsError,
      });
      return NextResponse.json(
        { error: "Failed to load assigned meetings" },
        { status: 500 }
      );
    }

    const typedParticipants = (participants || []) as ParticipantRow[];
    const participantUserIds = [
      ...new Set(typedParticipants.map((participant) => participant.user_id)),
    ];
    const accountMap = new Map<string, AccountRow>();

    if (participantUserIds.length > 0) {
      const { data: participantAccounts, error: accountError } = await supabase
        .from("accounts")
        .select("id, email, display_name, role, account_status")
        .in("id", participantUserIds);

      if (accountError) {
        console.error("[coordinator/meetings][GET] participant accounts error:", accountError);
        return NextResponse.json(
          { error: "Failed to load meeting participants" },
          { status: 500 }
        );
      }

      for (const row of (participantAccounts || []) as AccountRow[]) {
        accountMap.set(row.id, row);
      }
    }

    const participantsByMeeting = typedParticipants.reduce<
      Record<string, ParticipantRow[]>
    >((acc, participant) => {
      if (!acc[participant.meeting_id]) acc[participant.meeting_id] = [];
      acc[participant.meeting_id].push(participant);
      return acc;
    }, {});
    const reportByMeetingId = new Map<string, MeetingReportRow>();

    for (const report of (reports || []) as MeetingReportRow[]) {
      if (!reportByMeetingId.has(report.meeting_id)) {
        reportByMeetingId.set(report.meeting_id, report);
      }
    }

    const now = Date.now();
    const payload = ((meetings || []) as MeetingRow[])
      .map((meeting) => {
        const meetingParticipants = participantsByMeeting[meeting.id] || [];
        const hostGuestParticipants = meetingParticipants.filter((participant) =>
          ["host", "guest"].includes(participant.role)
        );

        const videoLinkReady = Boolean(meeting.video_link || meeting.zoom_meeting_id);
        const joinWindow = getCoordinatorJoinWindow(meeting.scheduled_at);
        const isWithinJoinWindow =
          now >= joinWindow.openAt && now <= joinWindow.closeAt;

        return {
          id: meeting.id,
          type: meeting.type || "one_on_one",
          status: meeting.status,
          workflow_state: meeting.workflow_state,
          scheduled_at: meeting.scheduled_at,
          location_pref: meeting.location_pref,
          video_link_ready: videoLinkReady,
          is_fallback: Boolean(meeting.video_link_is_fallback),
          feedback: extractCoordinatorFeedback(reportByMeetingId.get(meeting.id)),
          can_join:
            canJoinApprovedMeetings &&
            meeting.status === "confirmed" &&
            videoLinkReady &&
            isWithinJoinWindow,
          participants: hostGuestParticipants.map((participant) => {
            const accountRow = accountMap.get(participant.user_id);
            return {
              user_id: participant.user_id,
              role: participant.role,
              response: participant.response,
              responded_at: participant.responded_at,
              display_name: accountRow?.display_name || "Unknown",
              tier: accountRow?.role || null,
            };
          }),
        };
      })
      .sort((a, b) => {
        const aTime = new Date(a.scheduled_at).getTime();
        const bTime = new Date(b.scheduled_at).getTime();
        const aUpcoming = aTime >= now;
        const bUpcoming = bTime >= now;

        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        return aUpcoming ? aTime - bTime : bTime - aTime;
      });

    return NextResponse.json({
      coordinator: coordinatorProfile || {
        name: typedAccount?.display_name || typedAccount?.email || "Coordinator",
        email: typedAccount?.email || null,
      },
      meetings: payload,
      permissions: [...coordinatorPermissions],
    });
  } catch (error) {
    console.error("[coordinator/meetings][GET] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
