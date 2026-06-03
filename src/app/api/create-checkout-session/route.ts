import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { STRIPE_SUBSCRIPTION_AMOUNTS_SMALLEST_UNIT } from "@/lib/subscription/config";
import { canAccessPaidFeatures } from "@/lib/subscription/permissions";
import {
  amountToMajorUnit,
  createFlutterwavePaymentLink,
  createTxRef,
} from "@/lib/payments/flutterwave";

const baseTierPricing: Record<
  string,
  { name: string; amounts: { ngn: number; usd: number; gbp: number } }
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
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

const SUPPORTED_CURRENCIES = new Set(["ngn", "usd", "gbp"]);

const PAYMENT_MINIMUM_AMOUNT_CENTS: Record<string, number> = {
  usd: 50,
  gbp: 30,
  ngn: 5000,
};

const CURRENCY_DISPLAY: Record<string, { symbol: string }> = {
  usd: { symbol: "$" },
  gbp: { symbol: "£" },
  ngn: { symbol: "₦" },
};

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

function getMinimumAmountError(currency: string, amountCents: number): string | null {
  const min = PAYMENT_MINIMUM_AMOUNT_CENTS[currency];
  if (!min || amountCents >= min) return null;
  const display = CURRENCY_DISPLAY[currency] || { symbol: "" };
  const minFormatted = (min / 100).toFixed(2);
  return `The minimum top-up amount is ${display.symbol}${minFormatted}. Please increase the amount and try again.`;
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

export async function POST(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { tier, userId, currency = "usd", amount, amountCents, type, credits } = body;

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
        { error: "Invalid currency. Supported: NGN, USD, GBP" },
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

      const minTopUpError = getMinimumAmountError(normalizedCurrency, parsedAmountCents);
      if (minTopUpError) {
        return NextResponse.json({ error: minTopUpError }, { status: 400 });
      }

      const txRef = createTxRef("wallet", sessionUserId);
      const payment = await createFlutterwavePaymentLink({
        txRef,
        amount: amountToMajorUnit(parsedAmountCents),
        currency: normalizedCurrency,
        redirectUrl: `${appUrl}/dashboard/wallet?success=true`,
        customer,
        title: "MatchIndeed Wallet Top-up",
        description: `Add ${normalizedCurrency.toUpperCase()} ${(
          parsedAmountCents / 100
        ).toFixed(2)} to your wallet`,
        meta: {
          userId: sessionUserId,
          type: "wallet_topup",
          amountCents: parsedAmountCents,
          currency: normalizedCurrency,
        },
      });

      return NextResponse.json({
        provider: "flutterwave",
        sessionId: txRef,
        txRef,
        url: payment.link,
      });
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

      const minCreditError = getMinimumAmountError(normalizedCurrency, parsedAmountCents);
      if (minCreditError) {
        const min = PAYMENT_MINIMUM_AMOUNT_CENTS[normalizedCurrency] || 50;
        const display = CURRENCY_DISPLAY[normalizedCurrency] || { symbol: "" };
        const minFormatted = (min / 100).toFixed(2);
        const pricePerCreditCents = Math.round(parsedAmountCents / parsedCredits);
        const minQuantity = pricePerCreditCents > 0 ? Math.ceil(min / pricePerCreditCents) : 1;
        return NextResponse.json({
          error: `The minimum order is ${display.symbol}${minFormatted} per transaction. Please purchase at least ${minQuantity} credit${minQuantity !== 1 ? "s" : ""} to proceed.`,
        }, { status: 400 });
      }

      const txRef = createTxRef("credits", sessionUserId);
      const payment = await createFlutterwavePaymentLink({
        txRef,
        amount: amountToMajorUnit(parsedAmountCents),
        currency: normalizedCurrency,
        redirectUrl: `${appUrl}/dashboard/wallet?success=true`,
        customer,
        title: "MatchIndeed Credits Purchase",
        description: `Purchase ${parsedCredits} MatchIndeed credit${
          parsedCredits !== 1 ? "s" : ""
        }`,
        meta: {
          userId: sessionUserId,
          type: "credit_purchase",
          amountCents: parsedAmountCents,
          currency: normalizedCurrency,
          credits: parsedCredits,
        },
      });

      return NextResponse.json({
        provider: "flutterwave",
        sessionId: txRef,
        txRef,
        url: payment.link,
      });
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

    let finalAmount =
      normalizedCurrency === "ngn"
        ? tierPricing.amounts.ngn
        : normalizedCurrency === "gbp"
          ? tierPricing.amounts.gbp
          : tierPricing.amounts.usd;

    if (amount && typeof amount === "number") {
      finalAmount = Math.round(amount * 100);
    }

    const txRef = createTxRef("subscription", sessionUserId);
    const payment = await createFlutterwavePaymentLink({
      txRef,
      amount: amountToMajorUnit(finalAmount),
      currency: normalizedCurrency,
      redirectUrl: `${appUrl}/dashboard/profile/subscription?success=true`,
      customer,
      title: `MatchIndeed ${tierPricing.name}`,
      description: `Subscribe to MatchIndeed ${tierPricing.name}`,
      meta: {
        userId: sessionUserId,
        type: "subscription",
        tier: String(tier).toLowerCase(),
        amountCents: finalAmount,
        currency: normalizedCurrency,
      },
    });

    return NextResponse.json({
      provider: "flutterwave",
      sessionId: txRef,
      txRef,
      url: payment.link,
    });
  } catch (error: unknown) {
    console.error("Error creating Flutterwave checkout:", error);
    const msg = getCheckoutErrorMessage(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
