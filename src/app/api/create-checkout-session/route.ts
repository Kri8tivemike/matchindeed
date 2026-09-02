import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { STRIPE_SUBSCRIPTION_AMOUNTS_SMALLEST_UNIT } from "@/lib/subscription/config";
import { canAccessPaidFeatures } from "@/lib/subscription/permissions";
import {
  amountToMajorUnit,
  createFlutterwavePaymentLink,
  createTxRef,
} from "@/lib/payments/flutterwave";
import {
  createPaystackCheckoutUrl,
  createPaystackTxRef,
  type PaystackPaymentType,
} from "@/lib/payments/paystack";
import type {
  CheckoutCurrency,
  CheckoutPaymentProvider,
} from "@/lib/payments/checkout-intent";
import {
  getPaymentMinimumAmountCents,
  getRecommendedPaymentProvider,
  getUnsupportedProviderMessage,
  isPaymentProviderSupported,
} from "@/lib/payments/gateway-currency";
import { getCheckoutCurrencyForRequestHeaders } from "@/lib/payments/region-currency";

const baseTierPricing: Record<
  string,
  { name: string; amounts: { ngn: number; usd: number } }
> = {
  basic: {
    name: "Basic Plan",
    amounts: STRIPE_SUBSCRIPTION_AMOUNTS_SMALLEST_UNIT.basic,
  },
  standard: {
    name: "Standard Plan",
    amounts: STRIPE_SUBSCRIPTION_AMOUNTS_SMALLEST_UNIT.standard,
  },
  premium: {
    name: "Premium Plan",
    amounts: STRIPE_SUBSCRIPTION_AMOUNTS_SMALLEST_UNIT.premium,
  },
  vip: {
    name: "VIP Plan",
    amounts: STRIPE_SUBSCRIPTION_AMOUNTS_SMALLEST_UNIT.vip,
  },
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

const SUPPORTED_CURRENCIES = new Set(["ngn", "usd"]);
const SUPPORTED_PAYMENT_PROVIDERS = new Set(["flutterwave", "paystack"]);

const CURRENCY_DISPLAY: Record<string, { symbol: string }> = {
  usd: { symbol: "$" },
  ngn: { symbol: "₦" },
};

type SubscriptionPricingOverride = {
  price_ngn: number | string | null;
  price_usd: number | string | null;
};

async function getSubscriptionAmountCents(
  tierId: string,
  currency: CheckoutCurrency,
  fallbackAmounts: { ngn: number; usd: number }
) {
  const fallback = fallbackAmounts[currency.toLowerCase() as keyof typeof fallbackAmounts];
  if (!supabaseServiceRoleKey) return fallback;

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabaseAdmin
    .from("subscription_pricing")
    .select("price_ngn, price_usd")
    .eq("tier_id", tierId)
    .maybeSingle<SubscriptionPricingOverride>();

  if (error) {
    console.error("Unable to read authoritative subscription pricing:", error.message);
    return fallback;
  }

  const column = `price_${currency.toLowerCase()}` as keyof SubscriptionPricingOverride;
  const configuredPrice = Number(data?.[column]);
  return Number.isFinite(configuredPrice) && configuredPrice > 0
    ? Math.round(configuredPrice * 100)
    : fallback;
}

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabaseServer = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignore cookie writes inside API routes.
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabaseServer.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

function parseAmountCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function parseCredits(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function getMinimumAmountError(
  provider: CheckoutPaymentProvider,
  currency: CheckoutCurrency,
  amountCents: number
): string | null {
  const min = getPaymentMinimumAmountCents(provider, currency);
  if (amountCents >= min) return null;
  const display = CURRENCY_DISPLAY[currency.toLowerCase()] || { symbol: "" };
  const minFormatted = (min / 100).toFixed(2);
  const providerName = provider === "paystack" ? "Paystack" : "Flutterwave";
  return `${providerName}'s minimum ${currency} payment is ${display.symbol}${minFormatted}. Please increase the amount or choose another payment method.`;
}

function getCheckoutErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error ? error.message : "Failed to create checkout session";
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("minimum amount") || normalized.includes("too low to process")) {
    return "The amount entered is too low to process. Please increase the amount and try again.";
  }

  return rawMessage;
}

function getUserDisplayName(user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>) {
  const metadata = user.user_metadata || {};
  const firstName = typeof metadata.first_name === "string" ? metadata.first_name : "";
  const lastName = typeof metadata.last_name === "string" ? metadata.last_name : "";
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || user.email || "MatchIndeed User";
}

function normalizePaymentProvider(value: unknown): CheckoutPaymentProvider | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (!SUPPORTED_PAYMENT_PROVIDERS.has(normalized)) return null;
  return normalized === "paystack" ? "paystack" : "flutterwave";
}

async function createHostedCheckout(params: {
  provider: "flutterwave" | "paystack";
  prefix: "wallet" | "credits" | "subscription";
  userId: string;
  amountCents: number;
  currency: string;
  redirectPath: string;
  customer: {
    email: string;
    name?: string | null;
  };
  title: string;
  description: string;
  paymentType: PaystackPaymentType;
  tier?: string | null;
  credits?: number | null;
}) {
  if (params.provider === "paystack") {
    const txRef = createPaystackTxRef(
      params.paymentType === "subscription"
        ? {
            paymentType: "subscription",
            userId: params.userId,
            currency: params.currency,
            amountCents: params.amountCents,
            tier: params.tier || "",
          }
        : params.paymentType === "credit_purchase"
          ? {
              paymentType: "credit_purchase",
              userId: params.userId,
              currency: params.currency,
              amountCents: params.amountCents,
              credits: params.credits || 0,
            }
          : {
              paymentType: "wallet_topup",
              userId: params.userId,
              currency: params.currency,
              amountCents: params.amountCents,
            }
    );
    const successUrl = `${appUrl}${params.redirectPath}?paystack=success`;

    const payment = await createPaystackCheckoutUrl({
      reference: txRef,
      amountCents: params.amountCents,
      currency: params.currency,
      callbackUrl: successUrl,
      customer: params.customer,
      title: params.title,
      paymentType: params.paymentType,
      metadata: {
        userId: params.userId,
        type: params.paymentType,
        amountCents: params.amountCents,
        currency: params.currency,
        tier: params.tier || null,
        credits: params.credits || null,
      },
    });

    return {
      provider: "paystack" as const,
      sessionId: txRef,
      txRef,
      url: payment.url,
    };
  }

  const txRef = createTxRef(params.prefix, params.userId);
  const meta: Record<string, string | number | boolean | null> = {
    userId: params.userId,
    type: params.paymentType,
    amountCents: params.amountCents,
    currency: params.currency,
  };
  if (params.tier) {
    meta.tier = params.tier;
  }
  if (params.credits) {
    meta.credits = params.credits;
  }

  const payment = await createFlutterwavePaymentLink({
    txRef,
    amount: amountToMajorUnit(params.amountCents),
    currency: params.currency,
    redirectUrl: `${appUrl}${params.redirectPath}?success=true`,
    customer: params.customer,
    title: params.title,
    description: params.description,
    meta,
  });

  return {
    provider: "flutterwave" as const,
    sessionId: txRef,
    txRef,
    url: payment.link,
  };
}

export async function POST(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      tier,
      userId,
      currency = "usd",
      amountCents,
      type,
      credits,
      provider: requestedProvider,
    } = body;

    if (userId && userId !== authenticatedUser.id) {
      return NextResponse.json(
        { error: "Unauthorized - user ID mismatch" },
        { status: 403 }
      );
    }

    const sessionUserId = authenticatedUser.id;
    const normalizedCurrency = String(currency).toLowerCase();
    if (!SUPPORTED_CURRENCIES.has(normalizedCurrency)) {
      return NextResponse.json(
        { error: "Invalid currency. Supported: NGN, USD" },
        { status: 400 }
      );
    }

    const normalizedRequestedProvider = normalizePaymentProvider(requestedProvider);
    if (
      normalizedRequestedProvider === null &&
      typeof requestedProvider === "string" &&
      requestedProvider.trim()
    ) {
      return NextResponse.json(
        { error: "Invalid payment provider. Supported: Flutterwave, Paystack" },
        { status: 400 }
      );
    }

    const checkoutCurrency = normalizedCurrency.toUpperCase() as CheckoutCurrency;
    const regionalCurrency = getCheckoutCurrencyForRequestHeaders(request.headers);
    if (checkoutCurrency !== regionalCurrency) {
      return NextResponse.json(
        {
          error: `Checkout currency is determined by your location. Please use ${regionalCurrency}.`,
        },
        { status: 400 }
      );
    }

    const provider =
      normalizedRequestedProvider || getRecommendedPaymentProvider(checkoutCurrency);
    if (!isPaymentProviderSupported(provider, checkoutCurrency)) {
      return NextResponse.json(
        { error: getUnsupportedProviderMessage(provider, checkoutCurrency) },
        { status: 400 }
      );
    }

    const customer = {
      email: authenticatedUser.email || "customer@matchindeed.local",
      name: getUserDisplayName(authenticatedUser),
    };

    if (type === "wallet_topup") {
      const paidFeaturesAccess = await canAccessPaidFeatures(sessionUserId);
      if (!paidFeaturesAccess.allowed) {
        return NextResponse.json(
          {
            error:
              paidFeaturesAccess.message ||
              "An active subscription plan is required to access paid features.",
          },
          { status: 403 }
        );
      }

      const parsedAmountCents = parseAmountCents(amountCents);
      if (!parsedAmountCents) {
        return NextResponse.json(
          { error: "Invalid amount for wallet top-up" },
          { status: 400 }
        );
      }

      const minTopUpError = getMinimumAmountError(
        provider,
        checkoutCurrency,
        parsedAmountCents
      );
      if (minTopUpError) {
        return NextResponse.json({ error: minTopUpError }, { status: 400 });
      }

      const payment = await createHostedCheckout({
        provider,
        prefix: "wallet",
        userId: sessionUserId,
        amountCents: parsedAmountCents,
        currency: normalizedCurrency,
        customer,
        title: "MatchIndeed Wallet Top-up",
        description: `Add ${normalizedCurrency.toUpperCase()} ${(
          parsedAmountCents / 100
        ).toFixed(2)} to your wallet`,
        paymentType: "wallet_topup",
        redirectPath: "/dashboard/wallet",
      });

      return NextResponse.json(payment);
    }

    if (type === "credit_purchase") {
      const paidFeaturesAccess = await canAccessPaidFeatures(sessionUserId);
      if (!paidFeaturesAccess.allowed) {
        return NextResponse.json(
          {
            error:
              paidFeaturesAccess.message ||
              "An active subscription plan is required to access paid features.",
          },
          { status: 403 }
        );
      }

      const parsedAmountCents = parseAmountCents(amountCents);
      const parsedCredits = parseCredits(credits);
      if (!parsedAmountCents || !parsedCredits) {
        return NextResponse.json(
          { error: "Invalid amount or credits for credit purchase" },
          { status: 400 }
        );
      }

      const minCreditError = getMinimumAmountError(
        provider,
        checkoutCurrency,
        parsedAmountCents
      );
      if (minCreditError) {
        const min = getPaymentMinimumAmountCents(provider, checkoutCurrency);
        const display = CURRENCY_DISPLAY[normalizedCurrency] || { symbol: "" };
        const minFormatted = (min / 100).toFixed(2);
        const pricePerCreditCents = Math.round(parsedAmountCents / parsedCredits);
        const minQuantity = pricePerCreditCents > 0 ? Math.ceil(min / pricePerCreditCents) : 1;
        return NextResponse.json({
          error: `The minimum order is ${display.symbol}${minFormatted} per transaction. Please purchase at least ${minQuantity} credit${minQuantity !== 1 ? "s" : ""} to proceed.`,
        }, { status: 400 });
      }

      const payment = await createHostedCheckout({
        provider,
        prefix: "credits",
        userId: sessionUserId,
        amountCents: parsedAmountCents,
        currency: normalizedCurrency,
        customer,
        title: "MatchIndeed Credits Purchase",
        description: `Purchase ${parsedCredits} MatchIndeed credit${
          parsedCredits !== 1 ? "s" : ""
        }`,
        paymentType: "credit_purchase",
        redirectPath: "/dashboard/wallet",
        credits: parsedCredits,
      });

      return NextResponse.json(payment);
    }

    if (!tier) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const tierPricing = baseTierPricing[String(tier).toLowerCase()];
    if (!tierPricing) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const finalAmount = await getSubscriptionAmountCents(
      String(tier).toLowerCase(),
      checkoutCurrency,
      tierPricing.amounts
    );

    const payment = await createHostedCheckout({
      provider,
      prefix: "subscription",
      userId: sessionUserId,
      amountCents: finalAmount,
      currency: normalizedCurrency,
      customer,
      title: `MatchIndeed ${tierPricing.name}`,
      description: `Subscribe to MatchIndeed ${tierPricing.name}`,
      paymentType: "subscription",
      redirectPath: "/dashboard/profile/subscription",
      tier: String(tier).toLowerCase(),
    });

    return NextResponse.json(payment);
  } catch (error: unknown) {
    console.error("Error creating checkout:", error);
    const msg = getCheckoutErrorMessage(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
