import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import { getReferralSettings } from "@/lib/referrals/rewards";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["view_referrals", "manage_referral_rewards", "review_referral_fraud"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const [
      { count: totalReferrals },
      { count: activeCodes },
      { count: pendingRewards },
      { count: approvedRewards },
      { data: rewardRows },
      { data: recentRewards },
      { count: signupCompleted },
      { count: profileCompleted },
      { count: preferencesCompleted },
      { data: membershipRows },
      { count: meetingRequested },
      { count: meetingBooked },
      settings,
    ] = await Promise.all([
      supabase.from("referrals").select("*", { count: "exact", head: true }),
      supabase
        .from("referral_codes")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("referral_rewards")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending_review", "held"]),
      supabase
        .from("referral_rewards")
        .select("*", { count: "exact", head: true })
        .eq("status", "approved"),
      supabase
        .from("referral_rewards")
        .select("credits_awarded, status, risk_level"),
      supabase
        .from("referral_rewards")
        .select(
          "id, milestone, credits_awarded, status, risk_level, created_at, referrer_id, referred_user_id"
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.from("accounts").select("*", { count: "exact", head: true }),
      supabase
        .from("user_progress")
        .select("*", { count: "exact", head: true })
        .eq("profile_completed", true),
      supabase
        .from("user_progress")
        .select("*", { count: "exact", head: true })
        .eq("preferences_completed", true),
      supabase.from("memberships").select("user_id"),
      supabase.from("meetings").select("*", { count: "exact", head: true }),
      supabase
        .from("meetings")
        .select("*", { count: "exact", head: true })
        .in("workflow_state", ["accepted", "confirmed", "completed"]),
      getReferralSettings(supabase),
    ]);

    const approvedCredits = (rewardRows || [])
      .filter((reward) => reward.status === "approved")
      .reduce((sum, reward) => sum + Number(reward.credits_awarded || 0), 0);
    const riskFlags = (rewardRows || []).filter(
      (reward) => reward.risk_level && reward.risk_level !== "low"
    ).length;
    const subscriptionPurchased = new Set(
      (membershipRows || [])
        .map((row) => String(row.user_id || ""))
        .filter(Boolean)
    ).size;
    const approvedRewardsCount = approvedRewards || 0;
    const funnelSteps = [
      {
        key: "signup_completed",
        label: "Signup completed",
        value: signupCompleted || 0,
        rate_label: null,
        rate: null,
        helper: "Starting point",
      },
      {
        key: "profile_completed",
        label: "Profile completed",
        value: profileCompleted || 0,
        rate_label: "of signups",
        rate: percentage(
          profileCompleted || 0,
          signupCompleted || 0
        ),
        helper: "Users with complete profile details",
      },
      {
        key: "preferences_completed",
        label: "Preferences completed",
        value: preferencesCompleted || 0,
        rate_label: "of signups",
        rate: percentage(
          preferencesCompleted || 0,
          signupCompleted || 0
        ),
        helper: "Users with completed preference details",
      },
      {
        key: "subscription_purchased",
        label: "Subscription purchased",
        value: subscriptionPurchased,
        rate_label: "of signups",
        rate: percentage(
          subscriptionPurchased,
          signupCompleted || 0
        ),
        helper: "Unique users with a membership record",
      },
      {
        key: "referral_reward_earned",
        label: "Referral reward earned",
        value: approvedRewardsCount,
        rate_label: null,
        rate: null,
        helper: "Approved referral reward events",
      },
      {
        key: "meeting_requested",
        label: "Meeting requested",
        value: meetingRequested || 0,
        rate_label: null,
        rate: null,
        helper: "Total meeting requests created",
      },
      {
        key: "meeting_booked",
        label: "Meeting booked",
        value: meetingBooked || 0,
        rate_label: "of requests",
        rate: percentage(
          meetingBooked || 0,
          meetingRequested || 0
        ),
        helper: "Requests accepted by all required participants",
      },
    ];

    return NextResponse.json({
      metrics: {
        total_referrals: totalReferrals || 0,
        active_codes: activeCodes || 0,
        pending_rewards: pendingRewards || 0,
        approved_rewards: approvedRewards || 0,
        approved_credits: approvedCredits,
        risk_flags: riskFlags,
      },
      funnel: {
        source: "database",
        analytics_configured: Boolean(
          process.env.MIXPANEL_TOKEN || process.env.NEXT_PUBLIC_MIXPANEL_TOKEN
        ),
        steps: funnelSteps,
      },
      recent_rewards: recentRewards || [],
      settings,
      admin: {
        user_id: guard.context.userId,
        role: guard.context.role,
        permissions: [...guard.context.permissions],
      },
    });
  } catch (error) {
    console.error("[admin/referrals/overview] error:", error);
    return NextResponse.json(
      { error: "Failed to load referral overview" },
      { status: 500 }
    );
  }
}
