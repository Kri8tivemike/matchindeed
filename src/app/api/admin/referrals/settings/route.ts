import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import {
  getReferralSettings,
  updateReferralSettings,
} from "@/lib/referrals/rewards";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["view_referrals", "manage_referral_settings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    return NextResponse.json({ settings: await getReferralSettings(supabase) });
  } catch (error) {
    console.error("[admin/referrals/settings][GET] error:", error);
    return NextResponse.json(
      { error: "Failed to load referral settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_referral_settings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json().catch(() => ({}));
    const profilePreferencesCompletedCredits = Number(
      body.profilePreferencesCompletedCredits
    );
    const firstSubscriptionPurchasedCredits = Number(
      body.firstSubscriptionPurchasedCredits
    );
    const autoApproveLowRiskRewards =
      typeof body.autoApproveLowRiskRewards === "boolean"
        ? body.autoApproveLowRiskRewards
        : undefined;

    if (
      !Number.isInteger(profilePreferencesCompletedCredits) ||
      profilePreferencesCompletedCredits <= 0 ||
      !Number.isInteger(firstSubscriptionPurchasedCredits) ||
      firstSubscriptionPurchasedCredits <= 0
    ) {
      return NextResponse.json(
        { error: "Referral credit amounts must be positive integers." },
        { status: 400 }
      );
    }

    const settings = await updateReferralSettings(supabase, guard.context.userId, {
      profilePreferencesCompletedCredits,
      firstSubscriptionPurchasedCredits,
      autoApproveLowRiskRewards,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[admin/referrals/settings][PATCH] error:", error);
    return NextResponse.json(
      { error: "Failed to update referral settings" },
      { status: 500 }
    );
  }
}

