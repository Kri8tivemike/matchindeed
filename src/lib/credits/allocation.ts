import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getMonthlyCreditsForTier,
  normalizeTier,
  UNLIMITED_CREDITS,
} from "@/lib/credits/config";
import { recordCreditTransaction } from "@/lib/credits/transactions";

type CreditsRow = {
  total: number | null;
  used: number | null;
  rollover: number | null;
};

export async function allocateSubscriptionCredits(
  supabase: SupabaseClient,
  userId: string,
  rawTier?: string | null
) {
  const tier = normalizeTier(rawTier);
  const creditsToAdd = getMonthlyCreditsForTier(tier);

  const { data: currentCredits } = await supabase
    .from("credits")
    .select("total, used, rollover")
    .eq("user_id", userId)
    .maybeSingle();

  const row = (currentCredits || null) as CreditsRow | null;
  const totalBefore = row?.total || 0;
  const used = row?.used || 0;
  const rollover = row?.rollover || 0;
  const availableBefore = Math.max(0, totalBefore - used + rollover);

  const totalAfter = tier === "vip" ? UNLIMITED_CREDITS : creditsToAdd;
  const usedAfter = 0;
  const rolloverAfter = tier === "vip" ? 0 : availableBefore;

  const { error } = await supabase.from("credits").upsert(
    {
      user_id: userId,
      total: totalAfter,
      used: usedAfter,
      rollover: rolloverAfter,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw error;
  }

  if (tier !== "vip" && availableBefore > 0) {
    await recordCreditTransaction(supabase, {
      userId,
      amount: availableBefore,
      actionType: "subscription_credit_rollover",
      description: `Rolled over ${availableBefore} unused credit(s) into the new ${tier} subscription cycle.`,
    });
  }

  await recordCreditTransaction(supabase, {
    userId,
    amount: creditsToAdd,
    actionType: "subscription_monthly_allocation",
    description: `Allocated ${creditsToAdd} monthly credits for ${tier} tier.`,
  });

  return {
    tier,
    creditsToAdd,
    totalBefore,
    totalAfter,
    rolloverAdded: rolloverAfter,
  };
}
