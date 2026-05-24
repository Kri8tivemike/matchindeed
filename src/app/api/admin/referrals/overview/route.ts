import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import { getReferralSettings } from "@/lib/referrals/rewards";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
      getReferralSettings(supabase),
    ]);

    const approvedCredits = (rewardRows || [])
      .filter((reward) => reward.status === "approved")
      .reduce((sum, reward) => sum + Number(reward.credits_awarded || 0), 0);
    const riskFlags = (rewardRows || []).filter(
      (reward) => reward.risk_level && reward.risk_level !== "low"
    ).length;

    return NextResponse.json({
      metrics: {
        total_referrals: totalReferrals || 0,
        active_codes: activeCodes || 0,
        pending_rewards: pendingRewards || 0,
        approved_rewards: approvedRewards || 0,
        approved_credits: approvedCredits,
        risk_flags: riskFlags,
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

