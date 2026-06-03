import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { processSubscriptionFlutterwavePayment } from "@/lib/subscription/checkout-processing";
import {
  amountToSmallestUnit,
  normalizeFlutterwaveMeta,
  verifyFlutterwaveTransaction,
} from "@/lib/payments/flutterwave";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

function parsePositiveInteger(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeCurrency(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : "usd";
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseServer = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
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
              // Ignore cookie setting errors.
            }
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseServer.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { transactionId, txRef } = await request.json();

    if (!transactionId) {
      return NextResponse.json(
        { error: "Flutterwave transaction ID is required" },
        { status: 400 }
      );
    }

    const transaction = await verifyFlutterwaveTransaction(transactionId);
    const meta = normalizeFlutterwaveMeta(transaction.meta);

    if (meta.userId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized subscription transaction access" },
        { status: 403 }
      );
    }

    if (txRef && transaction.tx_ref !== txRef) {
      return NextResponse.json(
        { error: "Subscription payment reference mismatch" },
        { status: 400 }
      );
    }

    if (meta.type !== "subscription") {
      return NextResponse.json(
        { error: "Unsupported Flutterwave subscription payment type" },
        { status: 400 }
      );
    }

    const tier = typeof meta.tier === "string" ? meta.tier.toLowerCase() : "";
    if (!tier) {
      return NextResponse.json(
        { error: "Subscription tier metadata is missing" },
        { status: 400 }
      );
    }

    const amountCents =
      parsePositiveInteger(meta.amountCents) || amountToSmallestUnit(transaction.amount);
    const currency = normalizeCurrency(meta.currency || transaction.currency);
    const verifiedAmountCents = amountToSmallestUnit(transaction.amount);

    if (verifiedAmountCents < amountCents || normalizeCurrency(transaction.currency) !== currency) {
      return NextResponse.json(
        { error: "Verified subscription amount or currency does not match checkout metadata" },
        { status: 400 }
      );
    }

    const result = await processSubscriptionFlutterwavePayment(supabase, {
      transactionId: String(transaction.id),
      txRef: transaction.tx_ref,
      userId: user.id,
      tier,
      amountCents,
      currency,
      status: transaction.status,
    });

    return NextResponse.json({
      ...result,
      payment_status: transaction.status,
      status: transaction.status,
      mode: "payment",
      provider: "flutterwave",
    });
  } catch (error: unknown) {
    console.error("Error verifying Flutterwave subscription:", error);

    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to verify subscription") },
      { status: 500 }
    );
  }
}
