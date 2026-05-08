import type { TierId } from "@/lib/subscription/config";

export const UNLIMITED_CREDITS = 999999;

export const MONTHLY_CREDITS_BY_TIER: Record<TierId, number> = {
  basic: 5,
  standard: 10,
  premium: 30,
  vip: UNLIMITED_CREDITS,
};

export const PRICE_PER_CREDIT_BY_TIER: Record<
  Exclude<TierId, "vip">,
  { ngn: number; usd: number; gbp: number }
> = {
  basic: { ngn: 150, usd: 0.2, gbp: 0.16 },
  standard: { ngn: 200, usd: 0.27, gbp: 0.22 },
  premium: { ngn: 250, usd: 0.34, gbp: 0.27 },
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
