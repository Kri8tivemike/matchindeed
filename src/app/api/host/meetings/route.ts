import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Helper to get authenticated user from request
 */
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

/**
 * GET /api/host/meetings
 * 
 * Fetch host's assigned meetings with filtering by status
 * 
 * Query params:
 * - status: "upcoming" | "completed" | "cancelled" (optional)
 * 
 * Returns:
 * - Array of meetings with participant info, status, and financial details
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the status filter from query params
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");

    // Build the query
    let query = supabase
      .from("meetings")
      .select(
        `
        id,
        created_at,
        scheduled_at,
        status,
        duration_minutes,
        meeting_type,
        vip_meeting,
        room_name,
        amount_cents,
        platform,
        investigation_status,
        meeting_participants (
          id,
          user_id,
          role,
          status,
          accounts!inner (
            id,
            display_name,
            email,
            avatar_url
          )
        ),
        host_meetings (
          id,
          success,
          notes,
          video_url,
          earnings_cents,
          created_at
        )
        `
      )
      .eq("host_id", user.id);

    // Apply status filter if provided
    if (statusFilter) {
      const validStatuses = ["upcoming", "completed", "cancelled"];
      if (!validStatuses.includes(statusFilter)) {
        return NextResponse.json(
          { error: "Invalid status. Must be: upcoming, completed, or cancelled" },
          { status: 400 }
        );
      }
      query = query.eq("status", statusFilter);
    }

    // Order by scheduled date, most recent first
    const { data: meetings, error: meetingsError } = await query.order(
      "scheduled_at",
      { ascending: false }
    );

    if (meetingsError) {
      console.error("[Host Meetings API] Database error:", meetingsError);
      return NextResponse.json(
        { error: "Failed to fetch meetings" },
        { status: 500 }
      );
    }

    // Transform the data to include participant info
    const enrichedMeetings = meetings?.map((meeting) => {
      const participants = meeting.meeting_participants || [];
      const requester = participants.find((p) => p.role === "requester");
      const accepter = participants.find((p) => p.role === "accepter");

      return {
        id: meeting.id,
        created_at: meeting.created_at,
        scheduled_at: meeting.scheduled_at,
        status: meeting.status,
        duration_minutes: meeting.duration_minutes,
        meeting_type: meeting.meeting_type,
        vip_meeting: meeting.vip_meeting,
        room_name: meeting.room_name,
        amount_cents: meeting.amount_cents,
        platform: meeting.platform,
        investigation_status: meeting.investigation_status,
        requester: requester
          ? {
              id: requester.user_id,
              name: (Array.isArray(requester.accounts) ? requester.accounts[0] : requester.accounts)?.display_name || "Unknown",
              email: (Array.isArray(requester.accounts) ? requester.accounts[0] : requester.accounts)?.email,
              avatar: (Array.isArray(requester.accounts) ? requester.accounts[0] : requester.accounts)?.avatar_url,
            }
          : null,
        accepter: accepter
          ? {
              id: accepter.user_id,
              name: (Array.isArray(accepter.accounts) ? accepter.accounts[0] : accepter.accounts)?.display_name || "Unknown",
              email: (Array.isArray(accepter.accounts) ? accepter.accounts[0] : accepter.accounts)?.email,
              avatar: (Array.isArray(accepter.accounts) ? accepter.accounts[0] : accepter.accounts)?.avatar_url,
            }
          : null,
        report: meeting.host_meetings?.[0] || null,
      };
    }) || [];

    return NextResponse.json(
      {
        success: true,
        count: enrichedMeetings.length,
        meetings: enrichedMeetings,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Host Meetings API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
