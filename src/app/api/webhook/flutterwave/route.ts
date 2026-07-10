import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  amountToSmallestUnit,
  normalizeFlutterwaveMeta,
  verifyFlutterwaveTransaction,
} from "@/lib/payments/flutterwave";
import { processOneTimeFlutterwavePayment } from "@/lib/payments/checkout-processing";
import { processSubscriptionFlutterwavePayment } from "@/lib/subscription/checkout-processing";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function verifySignature(rawBody: string, request: NextRequest) {
  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH?.trim();
  if (!secretHash) {
    return process.env.NODE_ENV !== "production";
  }

  const signature = request.headers.get("flutterwave-signature")?.trim();
  if (signature) {
    const expectedBase64 = createHmac("sha256", secretHash)
      .update(rawBody)
      .digest("base64");
    const expectedHex = createHmac("sha256", secretHash)
      .update(rawBody)
      .digest("hex");

    return safeCompare(signature, expectedBase64) || safeCompare(signature, expectedHex);
  }

  const legacyHash = request.headers.get("verif-hash")?.trim();
  return Boolean(legacyHash && safeCompare(legacyHash, secretHash));
}

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
    const rawBody = await request.text();

    if (!verifySignature(rawBody, request)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      event?: string;
      data?: { id?: string | number; status?: string };
    };

    const transactionId = payload.data?.id;
    if (!transactionId) {
      return NextResponse.json({ received: true });
    }

    const transaction = await verifyFlutterwaveTransaction(transactionId);
    const meta = normalizeFlutterwaveMeta(transaction.meta);
    const amountCents =
      parsePositiveInteger(meta.amountCents) || amountToSmallestUnit(transaction.amount);
    const currency = normalizeCurrency(meta.currency || transaction.currency);

    if (meta.type === "wallet_topup") {
      await processOneTimeFlutterwavePayment(supabase, {
        transactionId: String(transaction.id),
        txRef: transaction.tx_ref,
        status: transaction.status,
        paymentType: "wallet_topup",
        userId: String(meta.userId || ""),
        amountCents,
        currency,
      });
    }

    if (meta.type === "credit_purchase") {
      const credits = parsePositiveInteger(meta.credits);
      if (credits) {
        await processOneTimeFlutterwavePayment(supabase, {
          transactionId: String(transaction.id),
          txRef: transaction.tx_ref,
          status: transaction.status,
          paymentType: "credit_purchase",
          userId: String(meta.userId || ""),
          amountCents,
          currency,
          credits,
        });
      }
    }

    if (meta.type === "subscription" && typeof meta.tier === "string") {
      await processSubscriptionFlutterwavePayment(supabase, {
        transactionId: String(transaction.id),
        txRef: transaction.tx_ref,
        userId: String(meta.userId || ""),
        tier: meta.tier,
        amountCents,
        currency,
        status: transaction.status,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Flutterwave Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
