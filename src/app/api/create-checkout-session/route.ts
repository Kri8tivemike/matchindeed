import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { STRIPE_SUBSCRIPTION_AMOUNTS_SMALLEST_UNIT } from "@/lib/subscription/config";
import { canAccessPaidFeatures } from "@/lib/subscription/permissions";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover" as Stripe.StripeConfig["apiVersion"],
  typescript: true,
});

// Base tier pricing configuration (can be overridden by admin)
// Amounts are in smallest currency unit (cents/kobo/pence)
const baseTierPricing: Record<string, { name: string; amounts: { ngn: number; usd: number; gbp: number } }> = {
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

const SUPPORTED_CURRENCIES = new Set(["ngn", "usd", "gbp"]);

/** Stripe minimum charge amounts per currency (in smallest unit: cents/pence/kobo) */
const STRIPE_MINIMUM_AMOUNT_CENTS: Record<string, number> = {
  usd: 50,    // $0.50
  gbp: 30,    // £0.30
  ngn: 5000,  // ₦50.00
};

const CURRENCY_DISPLAY: Record<string, { symbol: string; unit: string }> = {
  usd: { symbol: "$", unit: "cents" },
  gbp: { symbol: "£", unit: "pence" },
  ngn: { symbol: "₦", unit: "kobo" },
};

function getMinimumAmountError(currency: string, amountCents: number): string | null {
  const min = STRIPE_MINIMUM_AMOUNT_CENTS[currency];
  if (!min || amountCents >= min) return null;
  const display = CURRENCY_DISPLAY[currency] || { symbol: "", unit: "" };
  const minFormatted = (min / 100).toFixed(2);
  return `The minimum top-up amount is ${display.symbol}${minFormatted}. Please increase the amount and try again.`;
}

async function getAuthenticatedUserId() {
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

  return user.id;
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

function getCheckoutErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error ? error.message : "Failed to create checkout session";
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("at least 30 pence")) {
    return "The minimum top-up amount is £0.30. Please enter a higher amount and try again.";
  }
  if (normalized.includes("at least 50 cents")) {
    return "The minimum top-up amount is $0.50. Please enter a higher amount and try again.";
  }
  if (normalized.includes("minimum amount") || normalized.includes("too low to process")) {
    return "The amount entered is too low to process. Please increase the amount and try again.";
  }

  return rawMessage;
}

export async function POST(request: NextRequest) {
  try {
    const authenticatedUserId = await getAuthenticatedUserId();
    if (!authenticatedUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Read request body once
    const body = await request.json();
    const { priceId, tier, userId, currency = "usd", amount, amountCents, type, credits } = body;

    if (userId && userId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "Unauthorized - user ID mismatch" },
        { status: 403 }
      );
    }

    const sessionUserId = authenticatedUserId;
    const normalizedCurrency = String(currency).toLowerCase();
    if (!SUPPORTED_CURRENCIES.has(normalizedCurrency)) {
      return NextResponse.json(
        { error: "Invalid currency. Supported: NGN, USD, GBP" },
        { status: 400 }
      );
    }

    // Handle wallet top-up (one-time payment)
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

      // Create a one-time payment for wallet top-up
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: normalizedCurrency,
              product_data: {
                name: "Wallet Top-up",
                description: `Add ${normalizedCurrency.toUpperCase()} ${(parsedAmountCents / 100).toFixed(2)} to your wallet`,
              },
              unit_amount: parsedAmountCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        locale: "en",
        success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/dashboard/wallet?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/dashboard/wallet?canceled=true`,
        client_reference_id: sessionUserId,
        payment_intent_data: {
          metadata: {
            userId: sessionUserId,
            type: "wallet_topup",
            amountCents: parsedAmountCents.toString(),
            currency: normalizedCurrency,
          },
        },
        metadata: {
          userId: sessionUserId,
          type: "wallet_topup",
          amountCents: parsedAmountCents.toString(),
          currency: normalizedCurrency,
        },
      });

      if (!session.url) {
        return NextResponse.json(
          { error: "Stripe checkout URL unavailable" },
          { status: 500 }
        );
      }

      return NextResponse.json({ sessionId: session.id, url: session.url });
    }

    // Handle credit purchase (one-time payment)
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
        // Provide a more specific message for credit purchases
        const min = STRIPE_MINIMUM_AMOUNT_CENTS[normalizedCurrency] || 50;
        const display = CURRENCY_DISPLAY[normalizedCurrency] || { symbol: "", unit: "" };
        const minFormatted = (min / 100).toFixed(2);
        const pricePerCreditCents = Math.round(parsedAmountCents / parsedCredits);
        const minQuantity = pricePerCreditCents > 0 ? Math.ceil(min / pricePerCreditCents) : 1;
        return NextResponse.json({
          error: `The minimum order is ${display.symbol}${minFormatted} per transaction. Please purchase at least ${minQuantity} credit${minQuantity !== 1 ? "s" : ""} to proceed.`,
        }, { status: 400 });
      }

      // Create a one-time payment for credit purchase
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: normalizedCurrency,
              product_data: {
                name: "Credits Purchase",
                description: `Purchase ${parsedCredits} credit${parsedCredits !== 1 ? "s" : ""} for video dating`,
              },
              unit_amount: parsedAmountCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        locale: "en",
        success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/dashboard/wallet?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/dashboard/wallet?canceled=true`,
        client_reference_id: sessionUserId,
        payment_intent_data: {
          metadata: {
            userId: sessionUserId,
            type: "credit_purchase",
            amountCents: parsedAmountCents.toString(),
            currency: normalizedCurrency,
            credits: parsedCredits.toString(),
          },
        },
        metadata: {
          userId: sessionUserId,
          type: "credit_purchase",
          amountCents: parsedAmountCents.toString(),
          currency: normalizedCurrency,
          credits: parsedCredits.toString(),
        },
      });

      if (!session.url) {
        return NextResponse.json(
          { error: "Stripe checkout URL unavailable" },
          { status: 500 }
        );
      }

      return NextResponse.json({ sessionId: session.id, url: session.url });
    }

    // Handle subscription (existing logic)
    if (!tier) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    let finalPriceId = priceId;
    let finalAmount: number;
    let finalCurrency: string;

    // Get pricing for the tier
    const tierPricing = baseTierPricing[tier];

    if (!tierPricing) {
      return NextResponse.json(
        { error: "Invalid tier" },
        { status: 400 }
      );
    }

    // Determine amount and currency
    if (normalizedCurrency === "ngn") {
      finalAmount = tierPricing.amounts.ngn;
      finalCurrency = "ngn";
    } else if (normalizedCurrency === "gbp") {
      finalAmount = tierPricing.amounts.gbp;
      finalCurrency = "gbp";
    } else {
      finalAmount = tierPricing.amounts.usd;
      finalCurrency = "usd";
    }

    // If custom amount provided, use it (for admin overrides)
    if (amount && typeof amount === "number") {
      finalAmount = normalizedCurrency === "ngn"
        ? Math.round(amount * 100) // Convert to kobo
        : normalizedCurrency === "gbp"
          ? Math.round(amount * 100) // Convert to pence
          : Math.round(amount * 100); // Convert to cents
    }

    // If priceId is not provided, create product and price dynamically
    if (!finalPriceId) {
      // Create or retrieve product
      const products = await stripe.products.list({ limit: 100 });
      let product = products.data.find((p) => p.name === tierPricing.name);

      if (!product) {
        product = await stripe.products.create({
          name: tierPricing.name,
          description: `Matchindeed ${tierPricing.name}`,
        });
      }

      // Create or retrieve price for the specific currency
      const prices = await stripe.prices.list({ product: product.id, limit: 100 });
      let price = prices.data.find(
        (p) => p.unit_amount === finalAmount && p.currency === finalCurrency && p.type === "recurring"
      );

      if (!price) {
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: finalAmount,
          currency: finalCurrency,
          recurring: {
            interval: "month",
          },
        });
      }

      finalPriceId = price.id;
    }

    if (!finalPriceId) {
      return NextResponse.json(
        { error: "Price ID not found and could not be created" },
        { status: 400 }
      );
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: finalPriceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      locale: "en",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/dashboard/profile/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/dashboard/profile/subscription?canceled=true`,
      client_reference_id: sessionUserId,
      metadata: {
        userId: sessionUserId,
        tier,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe checkout URL unavailable" },
        { status: 500 }
      );
    }

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: unknown) {
    console.error("Error creating checkout session:", error);
    const msg = getCheckoutErrorMessage(error);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
