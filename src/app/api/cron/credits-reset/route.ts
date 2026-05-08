import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getMonthlyCreditsForTier,
  normalizeTier,
  UNLIMITED_CREDITS,
} from "@/lib/credits/config";
import { validateCronAuth } from "@/lib/cron-auth";
import { recordCreditTransaction } from "@/lib/credits/transactions";
import { restoreCreditLockedProfileIfEligible } from "@/lib/profile/credit-lock";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type CreditRow = {
  user_id: string;
  total: number | null;
  used: number | null;
  rollover: number | null;
  last_reset_at: string | null;
};

/**
 * GET /api/cron/credits-reset
 *
 * Monthly credit reset:
 * - Resets used credits for accounts not reset in the current month.
 * - Keeps purchased credits safe by preserving `total`.
 * - Ensures total is at least the tier minimum monthly allocation.
 */
export async function GET(request: NextRequest) {
  try {
    const cronAuth = validateCronAuth(request);
    if (!cronAuth.authorized) {
      return NextResponse.json(
        { error: cronAuth.error || "Unauthorized" },
        { status: cronAuth.status }
      );
    }

    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)
    );

    const { data: candidates, error: fetchError } = await supabase
      .from("credits")
      .select("user_id, total, used, rollover, last_reset_at")
      .or(`last_reset_at.is.null,last_reset_at.lt.${monthStart.toISOString()}`);

    if (fetchError) {
      console.error("Error fetching credits for reset:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch credits for reset" },
        { status: 500 }
      );
    }

    const rows = (candidates || []) as CreditRow[];
    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No credits to reset for this month",
        processed: 0,
      });
    }

    const userIds = rows.map((r) => r.user_id);
    const { data: accountRows, error: accountError } = await supabase
      .from("accounts")
      .select("id, tier")
      .in("id", userIds);

    if (accountError) {
      console.error("Error fetching account tiers:", accountError);
      return NextResponse.json(
        { error: "Failed to fetch account tiers" },
        { status: 500 }
      );
    }

    const tierByUserId = new Map<string, string>();
    for (const account of accountRows || []) {
      tierByUserId.set(account.id, account.tier || "basic");
    }

    let updated = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const tier = normalizeTier(tierByUserId.get(row.user_id));
        const monthlyMinimum = getMonthlyCreditsForTier(tier);
        const currentTotal = row.total || 0;
        const currentUsed = row.used || 0;
        const currentRollover = row.rollover || 0;
        const availableBefore = Math.max(
          0,
          currentTotal - currentUsed + currentRollover
        );
        const nextTotal =
          tier === "vip"
            ? UNLIMITED_CREDITS
            : monthlyMinimum;
        const nextUsed = 0;
        const nextRollover = tier === "vip" ? 0 : availableBefore;
        const resetCreditsAdded =
          tier === "vip" ? 0 : Math.max(0, nextTotal);

        const { error: updateError } = await supabase
          .from("credits")
          .update({
            total: nextTotal,
            used: nextUsed,
            rollover: nextRollover,
            last_reset_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("user_id", row.user_id);

        if (updateError) {
          failed += 1;
        } else {
          updated += 1;
          if (tier !== "vip" && availableBefore > 0) {
            await recordCreditTransaction(supabase, {
              userId: row.user_id,
              amount: availableBefore,
              actionType: "subscription_credit_rollover",
              description: `Rolled over ${availableBefore} unused credit(s) into the new ${tier} subscription cycle.`,
            });
          }
          if (resetCreditsAdded > 0) {
            await recordCreditTransaction(supabase, {
              userId: row.user_id,
              amount: resetCreditsAdded,
              actionType: "monthly_credit_reset",
              description: `Monthly reset applied for ${tier} tier (${resetCreditsAdded} credits).`,
            });
          }

          await restoreCreditLockedProfileIfEligible(supabase, row.user_id).catch(
            (restoreError) => {
              console.warn(
                "[credits-reset] Credit-locked profile restore skipped:",
                restoreError
              );
            }
          );
        }
      } catch (error) {
        console.error("Error resetting credits:", error);
        failed += 1;
      }
    }

    return NextResponse.json({
      success: true,
      processed: rows.length,
      updated,
      failed,
      month_start: monthStart.toISOString(),
    });
  } catch (error) {
    console.error("Error in GET /api/cron/credits-reset:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
