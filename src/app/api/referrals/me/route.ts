import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getOrCreateReferralCode } from "@/lib/referrals/codes";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  return error ? null : user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: account } = await supabase
      .from("accounts")
      .select("email, display_name")
      .eq("id", user.id)
      .maybeSingle<{ email: string | null; display_name: string | null }>();

    const code = await getOrCreateReferralCode(
      supabase,
      user.id,
      account?.display_name || account?.email || user.email || null
    );

    const { data: referrals } = await supabase
      .from("referrals")
      .select("id, referred_user_id, status, created_at")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false });

    const referralIds = (referrals || []).map((row) => row.id);
    const { data: rewards } = referralIds.length
      ? await supabase
          .from("referral_rewards")
          .select("id, referral_id, milestone, credits_awarded, status, created_at")
          .in("referral_id", referralIds)
          .order("created_at", { ascending: false })
      : { data: [] };

    const totalApprovedCredits = (rewards || [])
      .filter((reward) => reward.status === "approved")
      .reduce((sum, reward) => sum + Number(reward.credits_awarded || 0), 0);
    const pendingCredits = (rewards || [])
      .filter((reward) => reward.status === "pending_review" || reward.status === "held")
      .reduce((sum, reward) => sum + Number(reward.credits_awarded || 0), 0);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const referralLink = `${appUrl.replace(/\/$/, "")}/register?ref=${encodeURIComponent(
      code.code
    )}`;

    return NextResponse.json({
      code: code.code,
      referral_link: referralLink,
      stats: {
        total_referred_users: referrals?.length || 0,
        approved_credits: totalApprovedCredits,
        pending_credits: pendingCredits,
      },
      referrals: referrals || [],
      rewards: rewards || [],
    });
  } catch (error) {
    console.error("[referrals/me] error:", error);
    return NextResponse.json(
      { error: "Failed to load referral details" },
      { status: 500 }
    );
  }
}

