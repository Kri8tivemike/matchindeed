import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { processOneTimeFlutterwavePayment } from "@/lib/payments/checkout-processing";
import {
  amountToSmallestUnit,
  normalizeFlutterwaveMeta,
  verifyFlutterwaveTransaction,
} from "@/lib/payments/flutterwave";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

export async function GET(request: NextRequest) {
  try {
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
            // Ignore cookie writes in API route context.
          }
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseServer.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const transactionId = searchParams.get("transactionId") || searchParams.get("transaction_id");
    const txRef = searchParams.get("txRef") || searchParams.get("tx_ref");

    if (!transactionId) {
      return NextResponse.json(
        { error: "Flutterwave transaction ID is required" },
        { status: 400 }
      );
    }

    const transaction = await verifyFlutterwaveTransaction(transactionId);
    const meta = normalizeFlutterwaveMeta(transaction.meta);
    const paymentType = meta.type;
    const sessionUserId = meta.userId;

    if (sessionUserId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized payment transaction access" },
        { status: 403 }
      );
    }

    if (transaction.tx_ref !== txRef && txRef) {
      return NextResponse.json(
        { error: "Payment reference mismatch" },
        { status: 400 }
      );
    }

    if (paymentType !== "wallet_topup" && paymentType !== "credit_purchase") {
      return NextResponse.json(
        { error: "Unsupported Flutterwave payment type" },
        { status: 400 }
      );
    }

    const amountCents =
      parsePositiveInteger(meta.amountCents) || amountToSmallestUnit(transaction.amount);
    const currency = normalizeCurrency(meta.currency || transaction.currency);
    const verifiedAmountCents = amountToSmallestUnit(transaction.amount);

    if (verifiedAmountCents < amountCents || normalizeCurrency(transaction.currency) !== currency) {
      return NextResponse.json(
        { error: "Verified payment amount or currency does not match checkout metadata" },
        { status: 400 }
      );
    }

    const credits =
      paymentType === "credit_purchase" ? parsePositiveInteger(meta.credits) : null;

    if (paymentType === "credit_purchase" && !credits) {
      return NextResponse.json(
        { error: "Credit purchase metadata is missing" },
        { status: 400 }
      );
    }

    const result =
      paymentType === "wallet_topup"
        ? await processOneTimeFlutterwavePayment(supabase, {
            transactionId: String(transaction.id),
            txRef: transaction.tx_ref,
            status: transaction.status,
            paymentType: "wallet_topup",
            userId: user.id,
            amountCents,
            currency,
          })
        : await processOneTimeFlutterwavePayment(supabase, {
            transactionId: String(transaction.id),
            txRef: transaction.tx_ref,
            status: transaction.status,
            paymentType: "credit_purchase",
            userId: user.id,
            amountCents,
            currency,
            credits: credits!,
          });

    return NextResponse.json({
      ...result,
      paid: transaction.status === "successful",
      payment_status: transaction.status,
      status: transaction.status,
      mode: "payment",
      type: paymentType,
      userId: user.id,
      credits: paymentType === "credit_purchase" ? credits : null,
      amountCents,
      currency,
      provider: "flutterwave",
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to verify payment";
    console.error("Error verifying Flutterwave payment:", error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
