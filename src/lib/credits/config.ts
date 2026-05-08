import type { TierId } from "@/lib/subscription/config";

export const UNLIMITED_CREDITS = 999999;

export const MONTHLY_CREDITS_BY_TIER: Record<TierId, number> = {
  basic: 5,
  standard: 10,
  premium: 30,
  vip: UNLIMITED_CREDITS,
};

// ₦100/credit for all tiers. Minimum purchase = 10 credits (₦1,000 / $0.70 / £0.54).
// All currency minimums are verified to exceed Stripe's floor (NGN ₦50, USD $0.50, GBP £0.30).
export const MIN_CREDIT_PURCHASE = 10;

export const PRICE_PER_CREDIT_BY_TIER: Record<
  Exclude<TierId, "vip">,
  { ngn: number; usd: number; gbp: number }
> = {
  basic: { ngn: 100, usd: 0.07, gbp: 0.05 },
  standard: { ngn: 100, usd: 0.07, gbp: 0.05 },
  premium: { ngn: 100, usd: 0.07, gbp: 0.05 },
};

export function normalizeTier(rawTier?: string | null): TierId {
  const tier = (rawTier || "basic").toLowerCase();

  switch (tier) {
    case "basic":
    case "standard":
    case "premium":
    case "vip":
      return tier as TierId;
    default:
      return "basic";
  }
}

export function getMonthlyCreditsForTier(rawTier?: string | null): number {
  const tier = normalizeTier(rawTier);
  return MONTHLY_CREDITS_BY_TIER[tier];
}
