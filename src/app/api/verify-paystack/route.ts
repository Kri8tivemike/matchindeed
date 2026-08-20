import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { processOneTimeFlutterwavePayment } from "@/lib/payments/checkout-processing";
import {
  parsePaystackTxRef,
  verifyPaystackTransaction,
} from "@/lib/payments/paystack";
import { processSubscriptionFlutterwavePayment } from "@/lib/subscription/checkout-processing";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function normalizeCurrency(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : "ngn";
}

function normalizeMetadata(metadata: Record<string, unknown> | null) {
  return metadata && typeof metadata === "object" ? metadata : {};
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

    const reference =
      request.nextUrl.searchParams.get("reference") ||
      request.nextUrl.searchParams.get("trxref") ||
      request.nextUrl.searchParams.get("tx_ref") ||
      request.nextUrl.searchParams.get("txRef");

    if (!reference) {
      return NextResponse.json(
        { error: "Paystack payment reference is required" },
        { status: 400 }
      );
    }

    const parsedReference = parsePaystackTxRef(reference);
    if (!parsedReference) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const transaction = await verifyPaystackTransaction(reference);
    const metadata = normalizeMetadata(transaction.metadata);
    const metadataUserId = typeof metadata.userId === "string" ? metadata.userId : null;

    if (metadataUserId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized payment transaction access" },
        { status: 403 }
      );
    }

    const verifiedCurrency = normalizeCurrency(transaction.currency);
    if (
      transaction.reference !== reference ||
      Number(transaction.amount) < parsedReference.amountCents ||
      verifiedCurrency !== parsedReference.currency.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "Verified payment amount or currency does not match checkout metadata" },
        { status: 400 }
      );
    }

    const paystackStatus = transaction.status === "success" ? "successful" : transaction.status;

    if (parsedReference.paymentType === "subscription") {
      const result = await processSubscriptionFlutterwavePayment(supabase, {
        transactionId: String(transaction.id),
        txRef: transaction.reference,
        userId: user.id,
        tier: parsedReference.tier,
        amountCents: parsedReference.amountCents,
        currency: parsedReference.currency,
        status: paystackStatus,
        provider: "paystack",
      });

      return NextResponse.json({
        ...result,
        paid: transaction.status === "success",
        payment_status: transaction.status,
        status: transaction.status,
        mode: "payment",
        provider: "paystack",
        type: "subscription",
        tier: parsedReference.tier,
        amountCents: parsedReference.amountCents,
        currency: parsedReference.currency,
      });
    }

    const result =
      parsedReference.paymentType === "wallet_topup"
        ? await processOneTimeFlutterwavePayment(supabase, {
            transactionId: String(transaction.id),
            txRef: transaction.reference,
            status: paystackStatus,
            paymentType: "wallet_topup",
            userId: user.id,
            amountCents: parsedReference.amountCents,
            currency: parsedReference.currency,
            provider: "paystack",
          })
        : await processOneTimeFlutterwavePayment(supabase, {
            transactionId: String(transaction.id),
            txRef: transaction.reference,
            status: paystackStatus,
            paymentType: "credit_purchase",
            userId: user.id,
            amountCents: parsedReference.amountCents,
            currency: parsedReference.currency,
            credits: parsedReference.credits,
            provider: "paystack",
          });

    return NextResponse.json({
      ...result,
      paid: transaction.status === "success",
      payment_status: transaction.status,
      status: transaction.status,
      mode: "payment",
      provider: "paystack",
      type: parsedReference.paymentType,
      credits:
        parsedReference.paymentType === "credit_purchase" ? parsedReference.credits : null,
      amountCents: parsedReference.amountCents,
      currency: parsedReference.currency,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to verify Paystack payment";
    console.error("Error verifying Paystack payment:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
