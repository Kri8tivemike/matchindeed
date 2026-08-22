export type CheckoutCurrency = "NGN" | "USD";
export type CheckoutPaymentProvider = "flutterwave" | "paystack";
export type CheckoutIntentType = "subscription" | "wallet_topup" | "credit_purchase";
export type CheckoutTier = "basic" | "standard" | "premium" | "vip";

export type CheckoutIntent =
  | {
      type: "subscription";
      tier: CheckoutTier;
      currency: CheckoutCurrency;
    }
  | {
      type: "wallet_topup";
      amountCents: number;
      currency: CheckoutCurrency;
    }
  | {
      type: "credit_purchase";
      amountCents: number;
      credits: number;
      currency: CheckoutCurrency;
    };

const CHECKOUT_PATH = "/dashboard/payment/checkout";
const VALID_CURRENCIES = new Set(["NGN", "USD"]);
const VALID_TIERS = new Set(["basic", "standard", "premium", "vip"]);

function normalizeCurrency(value: string | null): CheckoutCurrency | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && VALID_CURRENCIES.has(normalized)
    ? (normalized as CheckoutCurrency)
    : null;
}

function parsePositiveInteger(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildCheckoutUrl(intent: CheckoutIntent) {
  const params = new URLSearchParams({
    type: intent.type,
    currency: intent.currency,
  });

  if (intent.type === "subscription") {
    params.set("tier", intent.tier);
  }

  if (intent.type === "wallet_topup") {
    params.set("amountCents", String(intent.amountCents));
  }

  if (intent.type === "credit_purchase") {
    params.set("amountCents", String(intent.amountCents));
    params.set("credits", String(intent.credits));
  }

  return `${CHECKOUT_PATH}?${params.toString()}`;
}

export function parseCheckoutIntent(searchParams: URLSearchParams):
  | { ok: true; intent: CheckoutIntent }
  | { ok: false; message: string; returnPath: string } {
  const type = searchParams.get("type") as CheckoutIntentType | null;
  const currency = normalizeCurrency(searchParams.get("currency"));

  if (!type || !currency) {
    return {
      ok: false,
      message: "This checkout link is missing required payment details.",
      returnPath: "/dashboard/profile/subscription",
    };
  }

  if (type === "subscription") {
    const tier = searchParams.get("tier")?.trim().toLowerCase();
    if (!tier || !VALID_TIERS.has(tier)) {
      return {
        ok: false,
        message: "Choose a subscription plan before continuing to payment.",
        returnPath: "/dashboard/profile/subscription",
      };
    }

    return {
      ok: true,
      intent: {
        type,
        tier: tier as CheckoutTier,
        currency,
      },
    };
  }

  if (type === "wallet_topup") {
    const amountCents = parsePositiveInteger(searchParams.get("amountCents"));
    if (!amountCents) {
      return {
        ok: false,
        message: "Enter a wallet top-up amount before continuing to payment.",
        returnPath: "/dashboard/wallet?open=topup",
      };
    }

    return {
      ok: true,
      intent: { type, amountCents, currency },
    };
  }

  if (type === "credit_purchase") {
    const amountCents = parsePositiveInteger(searchParams.get("amountCents"));
    const credits = parsePositiveInteger(searchParams.get("credits"));
    if (!amountCents || !credits) {
      return {
        ok: false,
        message: "Choose how many credits to buy before continuing to payment.",
        returnPath: "/dashboard/wallet?open=credits",
      };
    }

    return {
      ok: true,
      intent: { type, amountCents, credits, currency },
    };
  }

  return {
    ok: false,
    message: "This payment type is not supported.",
    returnPath: "/dashboard/profile/subscription",
  };
}
