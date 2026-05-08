export type TierId = "basic" | "standard" | "premium" | "vip";

export type TierPricing = {
  ngn: number;
  usd: number;
  gbp: number;
};

export const DEFAULT_SUBSCRIPTION_PRICING: Record<TierId, TierPricing> = {
  basic: { ngn: 7500, usd: 9.99, gbp: 7.99 },
  standard: { ngn: 15000, usd: 19.99, gbp: 16.99 },
  premium: { ngn: 27000, usd: 34.99, gbp: 29.99 },
  vip: { ngn: 1500000, usd: 1000, gbp: 800 },
};

export const STRIPE_SUBSCRIPTION_AMOUNTS_SMALLEST_UNIT: Record<
  TierId,
  { ngn: number; usd: number; gbp: number }
> = {
  basic: {
    ngn: 750000, // ₦7,500 in kobo
    usd: 999, // $9.99 in cents
    gbp: 799, // £7.99 in pence
  },
  standard: {
    ngn: 1500000, // ₦15,000 in kobo
    usd: 1999, // $19.99 in cents
    gbp: 1699, // £16.99 in pence
  },
  premium: {
    ngn: 2700000, // ₦27,000 in kobo
    usd: 3499, // $34.99 in cents
    gbp: 2999, // £29.99 in pence
  },
  vip: {
    ngn: 150000000, // ₦1,500,000 in kobo
    usd: 100000, // $1,000 in cents
    gbp: 80000, // £800 in pence
  },
};
