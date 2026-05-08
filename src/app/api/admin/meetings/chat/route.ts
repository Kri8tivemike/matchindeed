import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import { extractCoordinatorFeedback } from "@/lib/coordinator-feedback";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type MeetingRow = {
  id: string;
  status: string;
  scheduled_at: string | null;
};

type MeetingParticipantRow = {
  user_id: string;
  role: string;
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

function normalizeMatchPair(userA: string, userB: string) {
  return [userA, userB]
    .map((userId) => String(userId || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

async function notifyChatUnlocked(userIds: string[], matchId: string) {
  await Promise.allSettled(
    userIds.map((userId) =>
      supabase.from("notifications").insert({
        user_id: userId,
        type: "chat_unlocked_by_admin",
        title: "Chat Enabled",
        message:
          "MatchIndeed admin has enabled chat for your match. You can now open Messages to continue the conversation.",
        data: {
          match_id: matchId,
          action: "open_messages",
        },
      })
    )
  );
}

async function notifyChatDisabled(userIds: string[], matchId: string) {
  await Promise.allSettled(
    userIds.map((userId) =>
      supabase.from("notifications").insert({
        user_id: userId,
        type: "chat_disabled_by_admin",
        title: "Chat Disabled",
        message:
          "MatchIndeed admin has disabled chat for this match. You can still view your meeting details from your appointments.",
        data: {
          match_id: matchId,
          action: "chat_disabled",
        },
      })
    )
  );
}

async function hasSuccessfulCoordinatorReport(meetingId: string) {
  const { data: reportRows, error } = await supabase
    .from("meeting_reports")
    .select(
      "id, meeting_id, coordinator_id, coordinator_name, conclusion, participant_yes_no, host_decision, admin_notes, finalized, created_at"
    )
    .eq("meeting_id", meetingId);

  if (error) {
    console.error("[admin/meetings/chat] coordinator report lookup error:", error);
    throw new Error("Failed to verify coordinator report status");
  }

  return ((reportRows || []) as MeetingReportRow[]).some(
    (report) => extractCoordinatorFeedback(report)?.status === "successful"
  );
}

async function getMeetingUserIds(meetingId: string) {
  const { data: participants, error: participantsError } = await supabase
    .from("meeting_participants")
    .select("user_id, role")
    .eq("meeting_id", meetingId);

  if (participantsError) {
    console.error(
      "[admin/meetings/chat] participant lookup error:",
      participantsError
    );
    throw new Error("Failed to load meeting participants");
  }

  const meetingUsers = ((participants || []) as MeetingParticipantRow[])
    .filter((participant) => ["host", "guest"].includes(participant.role))
    .map((participant) => participant.user_id)
    .filter(Boolean);

  return normalizeMatchPair(meetingUsers[0] || "", meetingUsers[1] || "");
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_meetings"],
    });

    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json().catch(() => ({}));
    const meetingId = String(body?.meeting_id || "").trim();

    if (!meetingId) {
      return NextResponse.json(
        { error: "meeting_id is required" },
        { status: 400 }
      );
    }

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id, status, scheduled_at")
      .eq("id", meetingId)
      .maybeSingle();

    if (meetingError) {
      console.error("[admin/meetings/chat] meeting lookup error:", meetingError);
      return NextResponse.json(
        { error: "Failed to load meeting" },
        { status: 500 }
      );
    }

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const typedMeeting = meeting as MeetingRow;
    if (["canceled", "cancelled", "declined"].includes(typedMeeting.status)) {
      return NextResponse.json(
        { error: "Chat cannot be enabled for a canceled or declined meeting." },
        { status: 400 }
      );
    }

    const coordinatorReportSuccessful = await hasSuccessfulCoordinatorReport(
      meetingId
    );
    if (!coordinatorReportSuccessful) {
      return NextResponse.json(
        {
          error:
            "Chat can only be enabled after a coordinator report is marked Successful.",
        },
        { status: 400 }
      );
    }

    const userIds = await getMeetingUserIds(meetingId);

    if (userIds.length !== 2 || userIds[0] === userIds[1]) {
      return NextResponse.json(
        { error: "Exactly two meeting participants are required to enable chat." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const payload = {
      meeting_id: meetingId,
      user1_id: userIds[0],
      user2_id: userIds[1],
      matched_at: typedMeeting.scheduled_at || nowIso,
      messaging_enabled: true,
      relationship_agreement_status: "signed",
      relationship_agreement_signed_at: nowIso,
    };

    const withAgreementFields = await supabase
      .from("user_matches")
      .upsert(payload, { onConflict: "user1_id,user2_id" })
      .select("id, messaging_enabled")
      .single();

    let match = withAgreementFields.data as
      | { id: string; messaging_enabled: boolean }
      | null;
    let matchError = withAgreementFields.error;

    if (matchError?.code === "42703") {
      const fallback = await supabase
        .from("user_matches")
        .upsert(
          {
            meeting_id: meetingId,
            user1_id: userIds[0],
            user2_id: userIds[1],
            matched_at: typedMeeting.scheduled_at || nowIso,
            messaging_enabled: true,
          },
          { onConflict: "user1_id,user2_id" }
        )
        .select("id, messaging_enabled")
        .single();

      match = fallback.data as { id: string; messaging_enabled: boolean } | null;
      matchError = fallback.error;
    }

    if (matchError || !match) {
      console.error("[admin/meetings/chat] match upsert error:", matchError);
      return NextResponse.json(
        { error: "Failed to enable chat for this meeting." },
        { status: 500 }
      );
    }

    await supabase
      .from("meetings")
      .update({
        matched: true,
        matched_at: typedMeeting.scheduled_at || nowIso,
        response_outcome: "both_yes",
        responses_completed_at: nowIso,
      })
      .eq("id", meetingId);

    await notifyChatUnlocked(userIds, match.id);

    return NextResponse.json({
      success: true,
      match_id: match.id,
      messaging_enabled: true,
      message: "Chat has been enabled for this match.",
    });
  } catch (error) {
    console.error("[admin/meetings/chat] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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

    const body = await request.json().catch(() => ({}));
    const meetingId = String(body?.meeting_id || "").trim();

    if (!meetingId) {
      return NextResponse.json(
        { error: "meeting_id is required" },
        { status: 400 }
      );
    }

    const userIds = await getMeetingUserIds(meetingId);
    if (userIds.length !== 2 || userIds[0] === userIds[1]) {
      return NextResponse.json(
        { error: "Exactly two meeting participants are required to disable chat." },
        { status: 400 }
      );
    }

    const { data: match, error: matchLookupError } = await supabase
      .from("user_matches")
      .select("id, messaging_enabled")
      .eq("meeting_id", meetingId)
      .maybeSingle();

    if (matchLookupError) {
      console.error("[admin/meetings/chat] match lookup error:", matchLookupError);
      return NextResponse.json(
        { error: "Failed to load chat status for this meeting." },
        { status: 500 }
      );
    }

    if (!match) {
      return NextResponse.json(
        { error: "No chat match was found for this meeting." },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabase
      .from("user_matches")
      .update({ messaging_enabled: false })
      .eq("id", match.id);

    if (updateError) {
      console.error("[admin/meetings/chat] disable update error:", updateError);
      return NextResponse.json(
        { error: "Failed to disable chat for this meeting." },
        { status: 500 }
      );
    }

    await notifyChatDisabled(userIds, match.id);

    return NextResponse.json({
      success: true,
      match_id: match.id,
      messaging_enabled: false,
      message: "Chat has been disabled for this match.",
    });
  } catch (error) {
    console.error("[admin/meetings/chat][DELETE] unexpected error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
