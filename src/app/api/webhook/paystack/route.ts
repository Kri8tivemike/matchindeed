import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processOneTimeFlutterwavePayment } from "@/lib/payments/checkout-processing";
import { parsePaystackTxRef } from "@/lib/payments/paystack";
import { processSubscriptionFlutterwavePayment } from "@/lib/subscription/checkout-processing";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getPaystackSecretKey() {
  return process.env.PAYSTACK_SECRET_KEY?.trim() || "";
}

function verifyPaystackSignature(rawBody: string, signature: string | null) {
  const secret = getPaystackSecretKey();
  if (!secret || !signature) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  return expected === signature;
}

function normalizeCurrency(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : "ngn";
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (!verifyPaystackSignature(rawBody, request.headers.get("x-paystack-signature"))) {
      return new NextResponse("INVALID_SIGNATURE", { status: 400 });
    }

    const event = JSON.parse(rawBody) as {
      event?: string;
      data?: {
        id?: number | string;
        reference?: string;
        status?: string;
        amount?: number;
        currency?: string;
        metadata?: Record<string, unknown> | null;
      };
    };

    if (event.event !== "charge.success") {
      return new NextResponse("OK");
    }

    const transaction = event.data;
    const reference = transaction?.reference;
    if (!transaction || !reference) {
      return new NextResponse("MISSING_REFERENCE", { status: 400 });
    }

    const parsedReference = parsePaystackTxRef(reference);
    if (!parsedReference) {
      return new NextResponse("UNKNOWN_PAYMENT", { status: 404 });
    }

    const metadata = transaction.metadata || {};
    const userId = typeof metadata.userId === "string" ? metadata.userId : null;
    if (!userId) {
      return new NextResponse("MISSING_USER", { status: 400 });
    }

    if (
      Number(transaction.amount || 0) < parsedReference.amountCents ||
      normalizeCurrency(transaction.currency) !== parsedReference.currency.toLowerCase()
    ) {
      return new NextResponse("AMOUNT_MISMATCH", { status: 400 });
    }

    const paystackStatus = transaction.status === "success" ? "successful" : transaction.status || "";

    if (parsedReference.paymentType === "subscription") {
      const result = await processSubscriptionFlutterwavePayment(supabase, {
        transactionId: String(transaction.id || reference),
        txRef: reference,
        userId,
        tier: parsedReference.tier,
        amountCents: parsedReference.amountCents,
        currency: parsedReference.currency,
        status: paystackStatus,
        provider: "paystack",
      });

      if (!result.success && !result.alreadyProcessed) {
        return new NextResponse("PROCESSING", { status: 202 });
      }
    } else if (parsedReference.paymentType === "wallet_topup") {
      const result = await processOneTimeFlutterwavePayment(supabase, {
        transactionId: String(transaction.id || reference),
        txRef: reference,
        status: paystackStatus,
        paymentType: "wallet_topup",
        userId,
        amountCents: parsedReference.amountCents,
        currency: parsedReference.currency,
        provider: "paystack",
      });

      if (!result.success && !result.alreadyProcessed) {
        return new NextResponse("PROCESSING", { status: 202 });
      }
    } else {
      const result = await processOneTimeFlutterwavePayment(supabase, {
        transactionId: String(transaction.id || reference),
        txRef: reference,
        status: paystackStatus,
        paymentType: "credit_purchase",
        userId,
        amountCents: parsedReference.amountCents,
        currency: parsedReference.currency,
        credits: parsedReference.credits,
        provider: "paystack",
      });

      if (!result.success && !result.alreadyProcessed) {
        return new NextResponse("PROCESSING", { status: 202 });
      }
    }

    return new NextResponse("OK");
  } catch (error) {
    console.error("Paystack webhook processing failed:", error);
    return new NextResponse("ERROR", { status: 500 });
  }
}
