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

function normalizeTrackingId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidTrackingId(value: string, pattern: RegExp) {
  return value === "" || pattern.test(value);
}

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
    const metaPixelId = normalizeTrackingId(body.metaPixelId);
    const tiktokPixelId = normalizeTrackingId(body.tiktokPixelId);
    const googleTagId = normalizeTrackingId(body.googleTagId);
    const googleTagManagerContainerId = normalizeTrackingId(
      body.googleTagManagerContainerId
    );

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

    if (
      !isValidTrackingId(metaPixelId, /^[0-9]{5,30}$/) ||
      !isValidTrackingId(tiktokPixelId, /^[A-Za-z0-9_-]{8,80}$/) ||
      !isValidTrackingId(googleTagId, /^(G|AW|GT|DC)-[A-Za-z0-9_-]{3,80}$/) ||
      !isValidTrackingId(googleTagManagerContainerId, /^GTM-[A-Za-z0-9_-]{3,80}$/)
    ) {
      return NextResponse.json(
        { error: "One or more tracking IDs are not in the expected format." },
        { status: 400 }
      );
    }

    const settings = await updateReferralSettings(supabase, guard.context.userId, {
      profilePreferencesCompletedCredits,
      firstSubscriptionPurchasedCredits,
      autoApproveLowRiskRewards,
      metaPixelId,
      tiktokPixelId,
      googleTagId,
      googleTagManagerContainerId,
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
