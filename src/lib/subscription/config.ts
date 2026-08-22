export type TierId = "basic" | "standard" | "premium" | "vip";

export type TierPricing = {
  ngn: number;
  usd: number;
};

export const DEFAULT_SUBSCRIPTION_PRICING: Record<TierId, TierPricing> = {
  basic: { ngn: 7500, usd: 9.99 },
  standard: { ngn: 15000, usd: 19.99 },
  premium: { ngn: 27000, usd: 34.99 },
  vip: { ngn: 1500000, usd: 1000 },
};

export const STRIPE_SUBSCRIPTION_AMOUNTS_SMALLEST_UNIT: Record<
  TierId,
  { ngn: number; usd: number }
> = {
  basic: {
    ngn: 750000, // ₦7,500 in kobo
    usd: 999, // $9.99 in cents
  },
  standard: {
    ngn: 1500000, // ₦15,000 in kobo
    usd: 1999, // $19.99 in cents
  },
  premium: {
    ngn: 2700000, // ₦27,000 in kobo
    usd: 3499, // $34.99 in cents
  },
  vip: {
    ngn: 150000000, // ₦1,500,000 in kobo
    usd: 100000, // $1,000 in cents
  },
};
