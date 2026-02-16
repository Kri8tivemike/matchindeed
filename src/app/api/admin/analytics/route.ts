import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Admin Analytics API
 *
 * Aggregates platform-wide metrics for the admin dashboard:
 * - User stats (total, active, by tier, new signups)
 * - Activity stats (winks, likes, interested, by day)
 * - Meeting stats (total, confirmed, completed, cancelled)
 * - Match stats (activity matches, meeting matches)
 * - Revenue stats (from wallet_transactions)
 * - Profile completion stats
 * - 7-day trend data for charts
 *
 * GET /api/admin/analytics
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Basic auth check (admin verification should be done at layout level)
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Date helpers
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString();
    const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    // ---------------------------------------------------------------
    // 1. User Stats
    // ---------------------------------------------------------------
    const { count: totalUsers } = await supabase
      .from("accounts")
      .select("*", { count: "exact", head: true });

    const { count: activeUsers } = await supabase
      .from("accounts")
      .select("*", { count: "exact", head: true })
      .eq("account_status", "active");

    const { count: newUsersThisMonth } = await supabase
      .from("accounts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thisMonthStart);

    const { count: newUsersLast7Days } = await supabase
      .from("accounts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    // Users by tier
    const { data: tierData } = await supabase
      .from("accounts")
      .select("tier");

    const tierCounts: Record<string, number> = {};
    for (const row of tierData || []) {
      const t = row.tier || "basic";
      tierCounts[t] = (tierCounts[t] || 0) + 1;
    }

    // ---------------------------------------------------------------
    // 2. Activity Stats
    // ---------------------------------------------------------------
    const { count: totalWinks } = await supabase
      .from("user_activities")
      .select("*", { count: "exact", head: true })
      .eq("activity_type", "wink");

    const { count: totalLikes } = await supabase
      .from("user_activities")
      .select("*", { count: "exact", head: true })
      .eq("activity_type", "like");

    const { count: totalInterested } = await supabase
      .from("user_activities")
      .select("*", { count: "exact", head: true })
      .eq("activity_type", "interested");

    const { count: todayActivities } = await supabase
      .from("user_activities")
      .select("*", { count: "exact", head: true })
      .gte("created_at", `${today}T00:00:00`);

    // Activities last 7 days for chart
    const { data: recentActivities } = await supabase
      .from("user_activities")
      .select("activity_type, created_at")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: true });

    // Group activities by day
    const activityByDay: Record<string, { wink: number; like: number; interested: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0];
      activityByDay[key] = { wink: 0, like: 0, interested: 0 };
    }
    for (const a of recentActivities || []) {
      const day = a.created_at.split("T")[0];
      if (activityByDay[day]) {
        const t = a.activity_type as "wink" | "like" | "interested";
        if (activityByDay[day][t] !== undefined) {
          activityByDay[day][t]++;
        }
      }
    }

    // ---------------------------------------------------------------
    // 3. Meeting Stats
    // ---------------------------------------------------------------
    const { count: totalMeetings } = await supabase
      .from("meetings")
      .select("*", { count: "exact", head: true });

    const { count: confirmedMeetings } = await supabase
      .from("meetings")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed");

    const { count: completedMeetings } = await supabase
      .from("meetings")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed");

    const { count: cancelledMeetings } = await supabase
      .from("meetings")
      .select("*", { count: "exact", head: true })
      .eq("status", "cancelled");

    const { count: pendingMeetings } = await supabase
      .from("meetings")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    // ---------------------------------------------------------------
    // 4. Match Stats
    // ---------------------------------------------------------------
    const { count: totalMatches } = await supabase
      .from("user_matches")
      .select("*", { count: "exact", head: true });

    const { count: matchesThisMonth } = await supabase
      .from("user_matches")
      .select("*", { count: "exact", head: true })
      .gte("matched_at", thisMonthStart);

    // ---------------------------------------------------------------
    // 5. Revenue Stats (from wallet_transactions)
    // ---------------------------------------------------------------
    let totalRevenue = 0;
    let monthlyRevenue = 0;

    try {
      const { data: allTx } = await supabase
        .from("wallet_transactions")
        .select("amount, transaction_type")
        .eq("transaction_type", "credit");

      totalRevenue = (allTx || []).reduce(
        (sum: number, t: any) => sum + (Number(t.amount) || 0),
        0
      );

      const { data: monthTx } = await supabase
        .from("wallet_transactions")
        .select("amount")
        .eq("transaction_type", "credit")
        .gte("created_at", thisMonthStart);

      monthlyRevenue = (monthTx || []).reduce(
        (sum: number, t: any) => sum + (Number(t.amount) || 0),
        0
      );
    } catch {
      // wallet_transactions table might not exist
    }

    // ---------------------------------------------------------------
    // 6. Profile Completion Stats
    // ---------------------------------------------------------------
    const { count: completedProfiles } = await supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true })
      .eq("profile_completed", true);

    const { count: totalProfiles } = await supabase
      .from("user_profiles")
      .select("*", { count: "exact", head: true });

    // ---------------------------------------------------------------
    // 7. Signups trend (last 7 days)
    // ---------------------------------------------------------------
    const { data: recentSignups } = await supabase
      .from("accounts")
      .select("created_at")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: true });

    const signupsByDay: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      signupsByDay[d.toISOString().split("T")[0]] = 0;
    }
    for (const s of recentSignups || []) {
      const day = s.created_at.split("T")[0];
      if (signupsByDay[day] !== undefined) {
        signupsByDay[day]++;
      }
    }

    // ---------------------------------------------------------------
    // 8. Notification Stats
    // ---------------------------------------------------------------
    const { count: totalNotifications } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true });

    // ---------------------------------------------------------------
    // Build Response
    // ---------------------------------------------------------------
    return NextResponse.json({
      users: {
        total: totalUsers || 0,
        active: activeUsers || 0,
        new_this_month: newUsersThisMonth || 0,
        new_last_7_days: newUsersLast7Days || 0,
        by_tier: tierCounts,
        profile_completed: completedProfiles || 0,
        total_profiles: totalProfiles || 0,
      },
      activities: {
        total_winks: totalWinks || 0,
        total_likes: totalLikes || 0,
        total_interested: totalInterested || 0,
        today: todayActivities || 0,
        by_day: activityByDay,
      },
      meetings: {
        total: totalMeetings || 0,
        confirmed: confirmedMeetings || 0,
        completed: completedMeetings || 0,
        cancelled: cancelledMeetings || 0,
        pending: pendingMeetings || 0,
      },
      matches: {
        total: totalMatches || 0,
        this_month: matchesThisMonth || 0,
      },
      revenue: {
        total: totalRevenue,
        this_month: monthlyRevenue,
      },
      notifications: {
        total: totalNotifications || 0,
      },
      trends: {
        signups_by_day: signupsByDay,
        activity_by_day: activityByDay,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in GET /api/admin/analytics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
