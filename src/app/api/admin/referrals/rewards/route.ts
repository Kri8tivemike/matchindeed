import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ReferralAttribution = {
  source: string | null;
  metadata: Record<string, unknown> | null;
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["view_referrals", "manage_referral_rewards", "review_referral_fraud"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "";
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));

    let query = supabase
      .from("referral_rewards")
      .select(
        "id, referral_id, referrer_id, referred_user_id, milestone, credits_awarded, status, risk_level, risk_reasons, created_at, approved_at, rejected_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: rewards, error } = await query;
    if (error) throw error;

    const userIds = [
      ...new Set(
        (rewards || []).flatMap((reward) => [
          reward.referrer_id,
          reward.referred_user_id,
        ])
      ),
    ];

    const { data: accounts } = userIds.length
      ? await supabase
          .from("accounts")
          .select("id, email, display_name")
          .in("id", userIds)
      : { data: [] };
    const accountMap = new Map((accounts || []).map((account) => [account.id, account]));
    const referralIds = [
      ...new Set((rewards || []).map((reward) => reward.referral_id as string)),
    ].filter(Boolean);
    const { data: referrals } = referralIds.length
      ? await supabase
          .from("referrals")
          .select("id, source, metadata")
          .in("id", referralIds)
      : { data: [] };
    const referralMap = new Map(
      ((referrals || []) as Array<ReferralAttribution & { id: string }>).map(
        (referral) => [referral.id, referral]
      )
    );

    return NextResponse.json({
      rewards: (rewards || []).map((reward) => ({
        ...reward,
        referrer: accountMap.get(reward.referrer_id) || null,
        referred_user: accountMap.get(reward.referred_user_id) || null,
        referral: referralMap.get(reward.referral_id) || null,
      })),
    });
  } catch (error) {
    console.error("[admin/referrals/rewards] error:", error);
    return NextResponse.json(
      { error: "Failed to load referral rewards" },
      { status: 500 }
    );
  }
}
