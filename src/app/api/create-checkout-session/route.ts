import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
  typescript: true,
});

// Base tier pricing configuration (can be overridden by admin)
// Amounts are in smallest currency unit (cents/kobo/pence)
const baseTierPricing: Record<string, { name: string; amounts: { ngn: number; usd: number; gbp: number } }> = {
  basic: {
    name: "Basic Plan",
    amounts: {
      ngn: 1000000, // 10,000 Naira in kobo
      usd: 700, // $7.00 in cents
      gbp: 550, // £5.50 in pence
    },
  },
  standard: {
    name: "Standard Plan",
    amounts: {
      ngn: 3150000, // 31,500 Naira in kobo
      usd: 2000, // $20.00 in cents
      gbp: 1600, // £16.00 in pence
    },
  },
  premium: {
    name: "Premium Plan",
    amounts: {
      ngn: 6300000, // 63,000 Naira in kobo
      usd: 4300, // $43.00 in cents
      gbp: 3400, // £34.00 in pence
    },
  },
};

export async function POST(request: NextRequest) {
  try {
    // Read request body once
    const body = await request.json();
    const { priceId, tier, userId, currency = "usd", amount, amountCents, type, credits } = body;

    // Handle wallet top-up (one-time payment)
    if (type === "wallet_topup") {
      if (!userId || !amountCents || !currency) {
        return NextResponse.json(
          { error: "Missing required parameters for wallet top-up" },
          { status: 400 }
        );
      }

      const normalizedCurrency = currency.toLowerCase();

      if (!["ngn", "usd", "gbp"].includes(normalizedCurrency)) {
        return NextResponse.json(
          { error: "Invalid currency. Supported: NGN, USD, GBP" },
          { status: 400 }
        );
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
                description: `Add ${currency.toUpperCase()} ${(amountCents / 100).toFixed(2)} to your wallet`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        locale: "en",
        success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/dashboard/profile/wallet?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/dashboard/profile/wallet?canceled=true`,
        client_reference_id: userId,
        metadata: {
          userId,
          type: "wallet_topup",
          amountCents: amountCents.toString(),
          currency: normalizedCurrency,
        },
      });

      return NextResponse.json({ sessionId: session.id, url: session.url });
    }

    // Handle credit purchase (one-time payment)
    if (type === "credit_purchase") {
      if (!userId || !amountCents || !currency || !credits) {
        return NextResponse.json(
          { error: "Missing required parameters for credit purchase" },
          { status: 400 }
        );
      }

      const normalizedCurrency = currency.toLowerCase();

      if (!["ngn", "usd", "gbp"].includes(normalizedCurrency)) {
        return NextResponse.json(
          { error: "Invalid currency. Supported: NGN, USD, GBP" },
          { status: 400 }
        );
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
                description: `Purchase ${credits} credit${credits !== 1 ? "s" : ""} for video dating`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        locale: "en",
        success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/dashboard/profile/wallet?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/dashboard/profile/wallet?canceled=true`,
        client_reference_id: userId,
        metadata: {
          userId,
          type: "credit_purchase",
          amountCents: amountCents.toString(),
          currency: normalizedCurrency,
          credits: credits.toString(),
        },
      });

      return NextResponse.json({ sessionId: session.id, url: session.url });
    }

    // Handle subscription (existing logic)
    if (!tier || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Normalize currency to lowercase
    const normalizedCurrency = currency.toLowerCase();

    // Validate currency
    if (!["ngn", "usd", "gbp"].includes(normalizedCurrency)) {
      return NextResponse.json(
        { error: "Invalid currency. Supported: NGN, USD, GBP" },
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
      client_reference_id: userId,
      metadata: {
        userId,
        tier,
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: unknown) {
    console.error("Error creating checkout session:", error);
    const msg = error instanceof Error ? error.message : "Failed to create checkout session";
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}