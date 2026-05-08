import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type HostProfile = {
  id: string;
  host_type: "basic" | "premium" | "vip";
  is_active: boolean;
};

type EmbeddedAccount = {
  id?: string;
  display_name?: string | null;
  email?: string | null;
};

type EmbeddedParticipant = {
  user_id: string;
  role: string;
  response: string | null;
  responded_at: string | null;
  accounts: EmbeddedAccount | EmbeddedAccount[] | null;
};

type EmbeddedMeeting = {
  id: string;
  type: string;
  status: string;
  scheduled_at: string;
  fee_cents: number | null;
  charge_status: string;
  workflow_state: string | null;
  meeting_participants: EmbeddedParticipant[] | null;
};

type HostMeetingRow = {
  id: string;
  host_id: string;
  meeting_id: string;
  report_submitted: boolean;
  success_marked: boolean | null;
  notes: string | null;
  video_recording_url: string | null;
  created_at: string;
  updated_at: string;
  meetings: EmbeddedMeeting | EmbeddedMeeting[] | null;
};

async function getAuthUser(request: NextRequest): Promise<User | null> {
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

async function getActiveHostProfile(userId: string): Promise<HostProfile | null> {
  const { data, error } = await supabase
    .from("host_profiles")
    .select("id, host_type, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    return null;
  }

  return data as HostProfile;
}

function normalizeAccount(
  account: EmbeddedAccount | EmbeddedAccount[] | null
): EmbeddedAccount | null {
  if (!account) return null;
  return Array.isArray(account) ? account[0] || null : account;
}

/**
 * GET /api/host/meetings
 *
 * Query params:
 * - status: upcoming | pending | confirmed | completed | canceled/cancelled
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hostProfile = await getActiveHostProfile(user.id);
    if (!hostProfile) {
      return NextResponse.json({ error: "Host profile not found" }, { status: 403 });
    }

    const statusFilter = new URL(request.url).searchParams.get("status")?.toLowerCase();

    let query = supabase
      .from("host_meetings")
      .select(
        `
        id,
        host_id,
        meeting_id,
        report_submitted,
        success_marked,
        notes,
        video_recording_url,
        created_at,
        updated_at,
        meetings!inner (
          id,
          type,
          status,
          scheduled_at,
          fee_cents,
          charge_status,
          workflow_state,
          meeting_participants (
            user_id,
            role,
            response,
            responded_at,
            accounts (
              id,
              display_name,
              email
            )
          )
        )
      `
      )
      .eq("host_id", hostProfile.id);

    if (statusFilter) {
      if (statusFilter === "upcoming") {
        query = query
          .in("meetings.status", ["pending", "confirmed"])
          .gte("meetings.scheduled_at", new Date().toISOString());
      } else if (statusFilter === "cancelled" || statusFilter === "canceled") {
        query = query.eq("meetings.status", "canceled");
      } else if (["pending", "confirmed", "completed", "canceled"].includes(statusFilter)) {
        query = query.eq("meetings.status", statusFilter);
      } else {
        return NextResponse.json(
          {
            error:
              "Invalid status. Use upcoming, pending, confirmed, completed, canceled, or cancelled.",
          },
          { status: 400 }
        );
      }
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("[Host Meetings API] Database error:", error);
      return NextResponse.json({ error: "Failed to fetch meetings" }, { status: 500 });
    }

    const meetings = ((data || []) as HostMeetingRow[]).map((row) => {
      const meeting = Array.isArray(row.meetings) ? row.meetings[0] : row.meetings;
      const participants = meeting?.meeting_participants || [];

      return {
        host_meeting_id: row.id,
        meeting_id: row.meeting_id,
        scheduled_at: meeting?.scheduled_at || null,
        status: meeting?.status || null,
        meeting_type: meeting?.type || null,
        workflow_state: meeting?.workflow_state || null,
        fee_cents: meeting?.fee_cents || 0,
        charge_status: meeting?.charge_status || null,
        report_submitted: row.report_submitted,
        success_marked: row.success_marked,
        notes: row.notes,
        video_recording_url: row.video_recording_url,
        participants: participants.map((p) => {
          const account = normalizeAccount(p.accounts);
          return {
            user_id: p.user_id,
            role: p.role,
            response: p.response,
            responded_at: p.responded_at,
            name: account?.display_name || "Unknown",
            email: account?.email || null,
            avatar_url: null,
          };
        }),
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    return NextResponse.json(
      {
        success: true,
        count: meetings.length,
        host_profile: {
          id: hostProfile.id,
          host_type: hostProfile.host_type,
        },
        meetings,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Host Meetings API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/host/meetings
 *
 * Submit outcome report for a host meeting.
 * Body:
 * - meeting_id: string (required)
 * - success_marked: boolean (required)
 * - notes: string (optional)
 * - video_recording_url: string (optional, VIP host only)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hostProfile = await getActiveHostProfile(user.id);
    if (!hostProfile) {
      return NextResponse.json({ error: "Host profile not found" }, { status: 403 });
    }

    const body = await request.json();
    const meetingId = typeof body.meeting_id === "string" ? body.meeting_id : null;
    const successMarked = body.success_marked;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const videoRecordingUrl =
      typeof body.video_recording_url === "string"
        ? body.video_recording_url.trim()
        : "";

    if (!meetingId) {
      return NextResponse.json({ error: "meeting_id is required" }, { status: 400 });
    }

    if (typeof successMarked !== "boolean") {
      return NextResponse.json(
        { error: "success_marked must be a boolean" },
        { status: 400 }
      );
    }

    if (notes.length > 2000) {
      return NextResponse.json(
        { error: "notes cannot exceed 2000 characters" },
        { status: 400 }
      );
    }

    if (videoRecordingUrl && !/^https?:\/\//i.test(videoRecordingUrl)) {
      return NextResponse.json(
        { error: "video_recording_url must be a valid URL" },
        { status: 400 }
      );
    }

    if (videoRecordingUrl && hostProfile.host_type !== "vip") {
      return NextResponse.json(
        { error: "Video recording upload is available for VIP hosts only" },
        { status: 403 }
      );
    }

    const { data: hostMeeting, error: hostMeetingError } = await supabase
      .from("host_meetings")
      .select("id")
      .eq("host_id", hostProfile.id)
      .eq("meeting_id", meetingId)
      .maybeSingle();

    if (hostMeetingError || !hostMeeting) {
      return NextResponse.json(
        { error: "Meeting not assigned to this host" },
        { status: 404 }
      );
    }

    const updatePayload: {
      report_submitted: boolean;
      success_marked: boolean;
      notes: string | null;
      updated_at: string;
      video_recording_url?: string | null;
    } = {
      report_submitted: true,
      success_marked: successMarked,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    if (videoRecordingUrl) {
      updatePayload.video_recording_url = videoRecordingUrl;
    }

    const { data: updated, error: updateError } = await supabase
      .from("host_meetings")
      .update(updatePayload)
      .eq("id", hostMeeting.id)
      .select(
        "id, host_id, meeting_id, report_submitted, success_marked, notes, video_recording_url, updated_at"
      )
      .single();

    if (updateError) {
      console.error("[Host Meetings API] Failed to submit report:", updateError);
      return NextResponse.json(
        { error: "Failed to submit meeting report" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Meeting report submitted successfully",
        report: updated,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Host Meetings API] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
