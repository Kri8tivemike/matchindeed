import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import { updateReferralRewardStatus } from "@/lib/referrals/rewards";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_referral_rewards", "review_referral_fraud"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json().catch(() => ({}));
    const rewardId = typeof body.reward_id === "string" ? body.reward_id.trim() : "";
    if (!rewardId) {
      return NextResponse.json({ error: "reward_id is required" }, { status: 400 });
    }

    return NextResponse.json(
      await updateReferralRewardStatus(
        supabase,
        rewardId,
        guard.context.userId,
        "held"
      )
    );
  } catch (error) {
    console.error("[admin/referrals/rewards/hold] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to hold reward" },
      { status: 500 }
    );
  }
}

