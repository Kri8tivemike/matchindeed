import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";

/**
 * Admin User Profile API
 *
 * Fetches comprehensive data about a specific user for the admin detail page:
 * - Activities (winks, likes, interested sent/received)
 * - Reports (against the user and by the user)
 * - Meetings (all with status, participants)
 * - Matches
 *
 * GET /api/admin/user-profile?user_id=UUID&tab=activities|reports|meetings
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ParticipationRow = {
  meeting_id: string;
  role: string;
  status: string;
};

type MeetingRow = {
  id: string;
  title: string | null;
  status: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration_minutes: number | null;
  charge_status: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["view_users"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const tab = searchParams.get("tab") || "activities";

    if (!userId) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
    }

    // ── Activities Tab ────────────────────────────────────
    if (tab === "activities") {
      // Sent activities
      const { data: sentActivities } = await supabase
        .from("user_activities")
        .select(
          `
          id, activity_type, created_at,
          target_user:target_user_id (
            id, email, display_name
          )
        `
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      // Received activities
      const { data: receivedActivities } = await supabase
        .from("user_activities")
        .select(
          `
          id, activity_type, created_at,
          user:user_id (
            id, email, display_name
          )
        `
        )
        .eq("target_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      // Activity counts
      const { count: totalSent } = await supabase
        .from("user_activities")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      const { count: totalReceived } = await supabase
        .from("user_activities")
        .select("*", { count: "exact", head: true })
        .eq("target_user_id", userId);

      // Breakdown by type
      const { count: winksSent } = await supabase
        .from("user_activities")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("activity_type", "wink");

      const { count: likesSent } = await supabase
        .from("user_activities")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("activity_type", "like");

      const { count: interestedSent } = await supabase
        .from("user_activities")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("activity_type", "interested");

      return NextResponse.json({
        sent: sentActivities || [],
        received: receivedActivities || [],
        counts: {
          total_sent: totalSent || 0,
          total_received: totalReceived || 0,
          winks_sent: winksSent || 0,
          likes_sent: likesSent || 0,
          interested_sent: interestedSent || 0,
        },
      });
    }

    // ── Reports Tab ───────────────────────────────────────
    if (tab === "reports") {
      // Reports against this user
      const { data: reportsAgainst } = await supabase
        .from("user_reports")
        .select(
          `
          id, reason, description, priority, status, resolution, created_at,
          reporter:reporter_id (
            id, email, display_name
          )
        `
        )
        .eq("reported_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(25);

      // Reports by this user
      const { data: reportsByUser } = await supabase
        .from("user_reports")
        .select(
          `
          id, reason, description, priority, status, resolution, created_at,
          reported_user:reported_user_id (
            id, email, display_name
          )
        `
        )
        .eq("reporter_id", userId)
        .order("created_at", { ascending: false })
        .limit(25);

      const { count: totalAgainst } = await supabase
        .from("user_reports")
        .select("*", { count: "exact", head: true })
        .eq("reported_user_id", userId);

      const { count: totalByUser } = await supabase
        .from("user_reports")
        .select("*", { count: "exact", head: true })
        .eq("reporter_id", userId);

      return NextResponse.json({
        against: reportsAgainst || [],
        by_user: reportsByUser || [],
        counts: {
          total_against: totalAgainst || 0,
          total_by_user: totalByUser || 0,
        },
      });
    }

    // ── Meetings Tab ──────────────────────────────────────
    if (tab === "meetings") {
      // Get meetings where user is a participant
      const { data: participations } = await supabase
        .from("meeting_participants")
        .select("meeting_id, role, status")
        .eq("user_id", userId);

      const meetingIds = ((participations as ParticipationRow[] | null) || []).map(
        (participation) => participation.meeting_id
      );

      let meetings: MeetingRow[] = [];
      if (meetingIds.length > 0) {
        const { data: meetingData } = await supabase
          .from("meetings")
          .select("id, title, status, scheduled_date, scheduled_time, duration_minutes, charge_status, created_at")
          .in("id", meetingIds)
          .order("created_at", { ascending: false })
          .limit(30);

        meetings = (meetingData as MeetingRow[] | null) || [];
      }

      // Meeting status counts
      const statusCounts: Record<string, number> = {};
      for (const m of meetings) {
        statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
      }

      return NextResponse.json({
        meetings,
        participations: participations || [],
        counts: {
          total: meetings.length,
          by_status: statusCounts,
        },
      });
    }

    return NextResponse.json({ error: "Invalid tab" }, { status: 400 });
  } catch (error) {
    console.error("Error in GET /api/admin/user-profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
