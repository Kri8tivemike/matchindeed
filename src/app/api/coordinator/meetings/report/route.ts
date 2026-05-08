import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCoordinatorAccess } from "@/lib/coordinator/permissions";
import {
  buildCoordinatorFeedbackMetadata,
  extractCoordinatorFeedback,
  getCoordinatorFeedbackStatusLabel,
  normalizeCoordinatorFeedbackStatus,
  type CoordinatorFeedbackStatus,
} from "@/lib/coordinator-feedback";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

type MeetingRow = {
  id: string;
  status: string;
  video_link: string | null;
  zoom_meeting_id: string | null;
};

const REPORT_SELECT =
  "id, meeting_id, coordinator_id, coordinator_name, conclusion, participant_yes_no, host_decision, admin_notes, finalized, created_at";

function getCoordinatorName(context: Awaited<ReturnType<typeof requireCoordinatorAccess>> & { ok: true }) {
  return (
    context.context.coordinator?.name ||
    context.context.account.display_name ||
    context.context.account.email ||
    context.context.email ||
    "Coordinator"
  );
}

async function loadExistingReport(meetingId: string, coordinatorId: string) {
  const { data, error } = await supabase
    .from("meeting_reports")
    .select(REPORT_SELECT)
    .eq("meeting_id", meetingId)
    .eq("coordinator_id", coordinatorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as MeetingReportRow | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const meetingId =
      typeof body.meeting_id === "string" ? body.meeting_id.trim() : "";
    const action = typeof body.action === "string" ? body.action : "submit";

    if (!meetingId) {
      return NextResponse.json(
        { error: "meeting_id is required" },
        { status: 400 }
      );
    }

    const guard = await requireCoordinatorAccess(request, {
      anyPermissions: ["join_approved_meetings"],
    });

    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from("meeting_participants")
      .select("meeting_id, user_id, role")
      .eq("meeting_id", meetingId)
      .eq("user_id", guard.context.userId)
      .eq("role", "coordinator")
      .maybeSingle();

    if (assignmentError) {
      console.error(
        "[coordinator/meetings/report][POST] assignment error:",
        assignmentError
      );
      return NextResponse.json(
        { error: "Unable to verify coordinator assignment" },
        { status: 500 }
      );
    }

    if (!assignment) {
      return NextResponse.json(
        { error: "This meeting is not assigned to this coordinator" },
        { status: 403 }
      );
    }

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, status, video_link, zoom_meeting_id")
      .eq("id", meetingId)
      .maybeSingle();

    if (meetingError) {
      console.error(
        "[coordinator/meetings/report][POST] meeting error:",
        meetingError
      );
      return NextResponse.json(
        { error: "Unable to load meeting details" },
        { status: 500 }
      );
    }

    const typedMeeting = meeting as MeetingRow | null;
    if (!typedMeeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const linkReady = Boolean(typedMeeting.video_link || typedMeeting.zoom_meeting_id);
    if (typedMeeting.status !== "confirmed" || !linkReady) {
      return NextResponse.json(
        {
          error:
            "Coordinator feedback is available after admin approval and meeting link readiness.",
        },
        { status: 400 }
      );
    }

    const coordinatorRecordId = guard.context.coordinator?.id;
    if (!coordinatorRecordId) {
      return NextResponse.json(
        { error: "Coordinator profile is not linked to this account." },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const coordinatorName = getCoordinatorName(guard);
    const existingReport = await loadExistingReport(
      meetingId,
      coordinatorRecordId
    );

    let status: CoordinatorFeedbackStatus | null = null;
    let note: string | null = null;
    let submittedAt: string | null = null;
    const joinedAt = action === "joined" ? now : null;

    if (action !== "joined") {
      status = normalizeCoordinatorFeedbackStatus(body.status);
      note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
      submittedAt = now;

      if (!status) {
        return NextResponse.json(
          { error: "Choose Successful or Not Successful before saving." },
          { status: 400 }
        );
      }

    }

    const participantYesNo = buildCoordinatorFeedbackMetadata({
      existing: existingReport?.participant_yes_no,
      coordinatorId: guard.context.userId,
      coordinatorName,
      joinedAt,
      status,
      note,
      submittedAt,
    });

    const reportPayload = {
      meeting_id: meetingId,
      coordinator_id: coordinatorRecordId,
      coordinator_name: coordinatorName,
      conclusion: status ? getCoordinatorFeedbackStatusLabel(status) : existingReport?.conclusion || null,
      participant_yes_no: participantYesNo,
      host_decision: status || existingReport?.host_decision || null,
      finalized: existingReport?.finalized || false,
    };

    const mutation = existingReport
      ? supabase
          .from("meeting_reports")
          .update(reportPayload)
          .eq("id", existingReport.id)
          .select(REPORT_SELECT)
          .single()
      : supabase
          .from("meeting_reports")
          .insert(reportPayload)
          .select(REPORT_SELECT)
          .single();

    const { data: savedReport, error: saveError } = await mutation;

    if (saveError) {
      console.error(
        "[coordinator/meetings/report][POST] save error:",
        saveError
      );
      return NextResponse.json(
        { error: "Unable to save coordinator feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      feedback: extractCoordinatorFeedback(savedReport as MeetingReportRow),
    });
  } catch (error) {
    console.error("[coordinator/meetings/report][POST] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
