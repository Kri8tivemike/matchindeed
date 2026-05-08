import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  MEETING_ETIQUETTE_CHECKLIST,
  getEtiquetteSummaryMessage,
} from "@/lib/meetings/etiquette";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

async function ensureMeetingParticipant(meetingId: string, userId: string) {
  const { data, error } = await supabase
    .from("meeting_participants")
    .select("meeting_id")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return !!data;
}

/**
 * GET /api/meetings/acknowledge-rules?meeting_id=<id>
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meetingId = request.nextUrl.searchParams.get("meeting_id");
    if (!meetingId) {
      return NextResponse.json(
        { error: "meeting_id is required" },
        { status: 400 }
      );
    }

    const isParticipant = await ensureMeetingParticipant(meetingId, user.id);
    if (!isParticipant) {
      return NextResponse.json(
        { error: "You are not a participant in this meeting." },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("meeting_rule_acknowledgments")
      .select("acknowledged_at")
      .eq("meeting_id", meetingId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching meeting rule acknowledgment:", error);
      return NextResponse.json(
        { error: "Failed to fetch acknowledgment status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      meeting_id: meetingId,
      acknowledged: !!data?.acknowledged_at,
      acknowledged_at: data?.acknowledged_at || null,
      checklist: MEETING_ETIQUETTE_CHECKLIST,
      message: getEtiquetteSummaryMessage(),
    });
  } catch (error) {
    console.error("Error in GET /api/meetings/acknowledge-rules:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/meetings/acknowledge-rules
 * Body: { meeting_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const meetingId = String(body.meeting_id || "").trim();
    if (!meetingId) {
      return NextResponse.json(
        { error: "meeting_id is required" },
        { status: 400 }
      );
    }

    const isParticipant = await ensureMeetingParticipant(meetingId, user.id);
    if (!isParticipant) {
      return NextResponse.json(
        { error: "You are not a participant in this meeting." },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("meeting_rule_acknowledgments")
      .upsert(
        {
          meeting_id: meetingId,
          user_id: user.id,
          acknowledged_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "meeting_id,user_id" }
      );

    if (error) {
      console.error("Error saving meeting rule acknowledgment:", error);
      return NextResponse.json(
        { error: "Failed to save acknowledgment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      meeting_id: meetingId,
      acknowledged: true,
      acknowledged_at: nowIso,
      checklist: MEETING_ETIQUETTE_CHECKLIST,
    });
  } catch (error) {
    console.error("Error in POST /api/meetings/acknowledge-rules:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
