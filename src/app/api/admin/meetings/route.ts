import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import { extractCoordinatorFeedback } from "@/lib/coordinator-feedback";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type MeetingHostRow = {
  email: string;
  display_name: string | null;
};

type MeetingRow = {
  id: string;
  host_id: string;
  type: string;
  status: string;
  workflow_state: string | null;
  scheduled_at: string;
  canceled_at: string | null;
  matched_at: string | null;
  in_progress_at: string | null;
  completed_at: string | null;
  rated_at: string | null;
  responses_completed_at: string | null;
  location_pref: string | null;
  fee_cents: number;
  charge_status: string;
  video_link: string | null;
  zoom_meeting_id: string | null;
  video_link_is_fallback: boolean | null;
  created_at: string;
};

type MeetingParticipantRow = {
  meeting_id: string;
  user_id: string;
  role: string;
  response: string | null;
  responded_at: string | null;
};

type ParticipantUserRow = {
  id: string;
  email: string;
  display_name: string | null;
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

type MeetingMatchRow = {
  id: string;
  meeting_id: string | null;
  messaging_enabled: boolean | null;
  relationship_agreement_status: string | null;
};

const isValidTimestamp = (value: string | null | undefined): value is string => {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
};

const latestTimestamp = (
  timestamps: Array<string | null | undefined>
): string | null => {
  const validTimestamps = timestamps.filter(isValidTimestamp);
  if (validTimestamps.length === 0) return null;

  return validTimestamps.reduce((latest, timestamp) =>
    new Date(timestamp).getTime() > new Date(latest).getTime()
      ? timestamp
      : latest
  );
};

const getMeetingActivityTimestamp = (
  meeting: MeetingRow,
  participants: MeetingParticipantRow[]
) =>
  latestTimestamp([
    meeting.canceled_at,
    meeting.rated_at,
    meeting.completed_at,
    meeting.responses_completed_at,
    meeting.in_progress_at,
    meeting.matched_at,
    latestTimestamp(participants.map((participant) => participant.responded_at)),
    meeting.created_at,
    meeting.scheduled_at,
  ]) || meeting.created_at;

const isMeetingAwaitingApproval = (meeting: {
  status: string;
  participants: Array<{ role: string; response: string | null }>;
}) => {
  const meetingUsers = meeting.participants.filter((participant) =>
    ["host", "guest"].includes(participant.role)
  );

  return (
    meeting.status === "pending" &&
    meetingUsers.length >= 2 &&
    meetingUsers.every((participant) => participant.response === "accepted")
  );
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["view_meetings", "manage_meetings"],
    });

    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { data: meetingsData, error: meetingsError } = await supabase
      .from("meetings")
      .select(`
        id,
        host_id,
        type,
        status,
        workflow_state,
        scheduled_at,
        canceled_at,
        matched_at,
        in_progress_at,
        completed_at,
        rated_at,
        responses_completed_at,
        location_pref,
        fee_cents,
        charge_status,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (meetingsError) {
      console.error("[admin/meetings][GET] meetings error:", meetingsError);
      return NextResponse.json(
        { error: "Failed to fetch meetings" },
        { status: 500 }
      );
    }

    const typedMeetings = (meetingsData || []) as MeetingRow[];
    const meetingIds = typedMeetings.map((meeting) => meeting.id);
    const hostIds = [...new Set(typedMeetings.map((meeting) => meeting.host_id).filter(Boolean))];

    let hostMap: Record<string, MeetingHostRow> = {};

    if (hostIds.length > 0) {
      const { data: hostAccounts, error: hostAccountsError } = await supabase
        .from("accounts")
        .select("id, email, display_name")
        .in("id", hostIds);

      if (hostAccountsError) {
        console.error("[admin/meetings][GET] host accounts error:", hostAccountsError);
        return NextResponse.json(
          { error: "Failed to fetch host accounts" },
          { status: 500 }
        );
      }

      hostMap = ((hostAccounts || []) as ParticipantUserRow[]).reduce<
        Record<string, MeetingHostRow>
      >((acc, account) => {
        acc[account.id] = {
          email: account.email,
          display_name: account.display_name,
        };
        return acc;
      }, {});
    }

    let zoomFieldsByMeetingId: Record<
      string,
      {
        video_link: string | null;
        zoom_meeting_id: string | null;
        video_link_is_fallback: boolean;
      }
    > = {};

    if (meetingIds.length > 0) {
      const { data: zoomFieldRows, error: zoomFieldError } = await supabase
        .from("meetings")
        .select("id, video_link, zoom_meeting_id, video_link_is_fallback")
        .in("id", meetingIds);

      if (zoomFieldError && zoomFieldError.code !== "42703") {
        console.error("[admin/meetings][GET] zoom fields error:", zoomFieldError);
        return NextResponse.json(
          { error: "Failed to fetch meeting video details" },
          { status: 500 }
        );
      }

      if (!zoomFieldError) {
        zoomFieldsByMeetingId = ((zoomFieldRows || []) as Array<{
          id: string;
          video_link?: string | null;
          zoom_meeting_id?: string | null;
          video_link_is_fallback?: boolean | null;
        }>).reduce<
          Record<
            string,
            {
              video_link: string | null;
              zoom_meeting_id: string | null;
              video_link_is_fallback: boolean;
            }
          >
        >((acc, row) => {
          acc[row.id] = {
            video_link: row.video_link || null,
            zoom_meeting_id: row.zoom_meeting_id || null,
            video_link_is_fallback: !!row.video_link_is_fallback,
          };
          return acc;
        }, {});
      }
    }

    const coordinatorFeedbackMap: Record<
      string,
      NonNullable<ReturnType<typeof extractCoordinatorFeedback>>[]
    > = {};
    const matchByMeetingId: Record<
      string,
      {
        id: string;
        messaging_enabled: boolean;
        relationship_agreement_status: string | null;
      }
    > = {};

    if (meetingIds.length > 0) {
      const { data: reportRows, error: reportError } = await supabase
        .from("meeting_reports")
        .select(
          "id, meeting_id, coordinator_id, coordinator_name, conclusion, participant_yes_no, host_decision, admin_notes, finalized, created_at"
        )
        .in("meeting_id", meetingIds)
        .order("created_at", { ascending: false });

      if (reportError) {
        console.error("[admin/meetings][GET] coordinator reports error:", reportError);
        return NextResponse.json(
          { error: "Failed to fetch coordinator meeting feedback" },
          { status: 500 }
        );
      }

      for (const report of (reportRows || []) as MeetingReportRow[]) {
        const feedback = extractCoordinatorFeedback(report);
        if (!feedback) continue;
        if (!coordinatorFeedbackMap[report.meeting_id]) {
          coordinatorFeedbackMap[report.meeting_id] = [];
        }
        coordinatorFeedbackMap[report.meeting_id].push(feedback);
      }

      const { data: matchRows, error: matchRowsError } = await supabase
        .from("user_matches")
        .select("id, meeting_id, messaging_enabled, relationship_agreement_status")
        .in("meeting_id", meetingIds);

      if (matchRowsError && matchRowsError.code !== "42703") {
        console.error("[admin/meetings][GET] match lookup error:", matchRowsError);
        return NextResponse.json(
          { error: "Failed to fetch meeting chat status" },
          { status: 500 }
        );
      }

      if (!matchRowsError) {
        for (const row of (matchRows || []) as MeetingMatchRow[]) {
          if (!row.meeting_id) continue;
          matchByMeetingId[row.meeting_id] = {
            id: row.id,
            messaging_enabled: !!row.messaging_enabled,
            relationship_agreement_status: row.relationship_agreement_status || null,
          };
        }
      }
    }

    const participantsMap: Record<
      string,
      {
        user_id: string;
        role: string;
        response: string | null;
        responded_at: string | null;
        user: {
          email: string;
          display_name: string | null;
        } | null;
      }[]
    > = {};

    if (meetingIds.length > 0) {
      const { data: participantsData, error: participantsError } = await supabase
        .from("meeting_participants")
        .select("meeting_id, user_id, role, response, responded_at")
        .in("meeting_id", meetingIds);

      if (participantsError) {
        console.error("[admin/meetings][GET] participants error:", participantsError);
        return NextResponse.json(
          { error: "Failed to fetch meeting participants" },
          { status: 500 }
        );
      }

      const typedParticipants = (participantsData || []) as MeetingParticipantRow[];

      for (const participant of typedParticipants) {
        if (!participantsMap[participant.meeting_id]) {
          participantsMap[participant.meeting_id] = [];
        }

        participantsMap[participant.meeting_id].push({
          user_id: participant.user_id,
          role: participant.role,
          response: participant.response,
          responded_at: participant.responded_at,
          user: null,
        });
      }

      const participantUserIds = [
        ...new Set(typedParticipants.map((participant) => participant.user_id)),
      ];

      if (participantUserIds.length > 0) {
        const { data: participantUsers, error: participantUsersError } = await supabase
          .from("accounts")
          .select("id, email, display_name")
          .in("id", participantUserIds);

        if (participantUsersError) {
          console.error(
            "[admin/meetings][GET] participant accounts error:",
            participantUsersError
          );
          return NextResponse.json(
            { error: "Failed to fetch participant accounts" },
            { status: 500 }
          );
        }

        const userMap = ((participantUsers || []) as ParticipantUserRow[]).reduce<
          Record<string, ParticipantUserRow>
        >((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {});

        for (const meetingId of Object.keys(participantsMap)) {
          participantsMap[meetingId] = participantsMap[meetingId].map((participant) => ({
            ...participant,
            user: userMap[participant.user_id]
              ? {
                  email: userMap[participant.user_id].email,
                  display_name: userMap[participant.user_id].display_name,
                }
              : null,
          }));
        }
      }
    }

    const meetings = typedMeetings
      .map((meeting) => {
        const meetingParticipants = participantsMap[meeting.id] || [];

        return {
          id: meeting.id,
          host_id: meeting.host_id,
          type: meeting.type,
          status: meeting.status,
          workflow_state: meeting.workflow_state,
          scheduled_at: meeting.scheduled_at,
          canceled_at: meeting.canceled_at,
          matched_at: meeting.matched_at,
          in_progress_at: meeting.in_progress_at,
          completed_at: meeting.completed_at,
          rated_at: meeting.rated_at,
          responses_completed_at: meeting.responses_completed_at,
          location_pref: meeting.location_pref,
          fee_cents: meeting.fee_cents,
          charge_status: meeting.charge_status,
          video_link: zoomFieldsByMeetingId[meeting.id]?.video_link || null,
          zoom_meeting_id:
            zoomFieldsByMeetingId[meeting.id]?.zoom_meeting_id || null,
          video_link_is_fallback:
            zoomFieldsByMeetingId[meeting.id]?.video_link_is_fallback || false,
          created_at: meeting.created_at,
          recent_activity_at: getMeetingActivityTimestamp(
            meeting,
            meetingParticipants.map((participant) => ({
              meeting_id: meeting.id,
              user_id: participant.user_id,
              role: participant.role,
              response: participant.response,
              responded_at: participant.responded_at,
            }))
          ),
          host: hostMap[meeting.host_id] || null,
          participants: meetingParticipants,
          coordinator_feedback: coordinatorFeedbackMap[meeting.id] || [],
          chat_match: matchByMeetingId[meeting.id] || null,
        };
      })
      .sort(
        (a, b) => {
          const aAwaitingApproval = isMeetingAwaitingApproval(a);
          const bAwaitingApproval = isMeetingAwaitingApproval(b);

          if (aAwaitingApproval !== bAwaitingApproval) {
            return aAwaitingApproval ? -1 : 1;
          }

          return (
            new Date(b.recent_activity_at).getTime() -
            new Date(a.recent_activity_at).getTime()
          );
        }
      );

    return NextResponse.json({
      meetings,
      count: meetings.length,
    });
  } catch (error) {
    console.error("[admin/meetings][GET] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
