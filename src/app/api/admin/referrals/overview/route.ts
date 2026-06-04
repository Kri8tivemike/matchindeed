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

function buildRolloutStatus(input: {
  totalReferrals: number;
  activeCodes: number;
  pendingRewards: number;
  riskFlags: number;
  auditLogCount: number;
  analyticsConfigured: boolean;
  settings: Awaited<ReturnType<typeof getReferralSettings>>;
}) {
  const checks = [
    {
      key: "reward_rules",
      label: "Reward rules configured",
      status:
        input.settings.profilePreferencesCompletedCredits > 0 &&
        input.settings.firstSubscriptionPurchasedCredits > 0
          ? "ready"
          : "blocked",
      detail: `${input.settings.profilePreferencesCompletedCredits} credit(s) for profile completion, ${input.settings.firstSubscriptionPurchasedCredits} credit(s) for first subscription.`,
    },
    {
      key: "referral_codes",
      label: "Referral codes available",
      status: input.activeCodes > 0 ? "ready" : "blocked",
      detail: `${input.activeCodes.toLocaleString()} active referral code(s).`,
    },
    {
      key: "analytics",
      label: "Analytics configured",
      status: input.analyticsConfigured ? "ready" : "warning",
      detail: input.analyticsConfigured
        ? "Product funnel events can be monitored during rollout."
        : "Mixpanel is not configured, so funnel visibility is limited to database counts.",
    },
    {
      key: "reward_queue",
      label: "Reward queue under control",
      status: input.pendingRewards <= 10 ? "ready" : "warning",
      detail: `${input.pendingRewards.toLocaleString()} pending or held reward(s).`,
    },
    {
      key: "risk_flags",
      label: "Risk flags reviewed",
      status: input.riskFlags === 0 ? "ready" : "warning",
      detail: `${input.riskFlags.toLocaleString()} non-low risk reward flag(s).`,
    },
    {
      key: "audit_trail",
      label: "Audit trail active",
      status: input.auditLogCount > 0 ? "ready" : "warning",
      detail: `${input.auditLogCount.toLocaleString()} referral audit event(s) recorded.`,
    },
  ];

  const readyChecks = checks.filter((check) => check.status === "ready").length;
  const blockedChecks = checks.filter((check) => check.status === "blocked").length;
  const readinessPercent = percentage(readyChecks, checks.length);
  const status = blockedChecks > 0
    ? "setup_required"
    : input.totalReferrals > 0 && readinessPercent >= 80
      ? "pilot_monitoring"
      : "pilot_ready";

  return {
    status,
    readiness_percent: readinessPercent,
    checks,
    pilot: {
      referral_target: 10,
      reward_review_window_days: 7,
      current_referrals: input.totalReferrals,
    },
  };
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
      { count: auditLogCount },
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
      supabase
        .from("referral_audit_logs")
        .select("*", { count: "exact", head: true }),
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
    const analyticsConfigured = Boolean(
      process.env.MIXPANEL_TOKEN || process.env.NEXT_PUBLIC_MIXPANEL_TOKEN
    );
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
        analytics_configured: analyticsConfigured,
        steps: funnelSteps,
      },
      rollout: buildRolloutStatus({
        totalReferrals: totalReferrals || 0,
        activeCodes: activeCodes || 0,
        pendingRewards: pendingRewards || 0,
        riskFlags,
        auditLogCount: auditLogCount || 0,
        analyticsConfigured,
        settings,
      }),
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
