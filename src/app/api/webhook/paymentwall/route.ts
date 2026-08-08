import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processOneTimeFlutterwavePayment } from "@/lib/payments/checkout-processing";
import {
  parsePaymentwallTxRef,
  verifyPaymentwallPingback,
} from "@/lib/payments/paymentwall";
import { processSubscriptionFlutterwavePayment } from "@/lib/subscription/checkout-processing";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function collectParams(request: NextRequest) {
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

function isDeliverable(type: string | undefined) {
  return type === "0" || type === "1";
}

export async function GET(request: NextRequest) {
  try {
    const params = collectParams(request);

    if (!verifyPaymentwallPingback(params)) {
      return new NextResponse("INVALID_SIGNATURE", { status: 400 });
    }

    const txRef = params.goodsid;
    const paymentwallRef = params.ref || null;

    if (!txRef) {
      return new NextResponse("MISSING_GOODSID", { status: 400 });
    }

    const reference = parsePaymentwallTxRef(txRef);

    if (!reference) {
      return new NextResponse("UNKNOWN_PAYMENT", { status: 404 });
    }

    if (!params.uid) {
      return new NextResponse("MISSING_UID", { status: 400 });
    }

    if (!isDeliverable(params.type)) {
      return new NextResponse("OK");
    }

    if (reference.paymentType === "subscription") {
      const result = await processSubscriptionFlutterwavePayment(supabase, {
        transactionId: paymentwallRef || txRef,
        txRef,
        userId: params.uid,
        tier: reference.tier,
        amountCents: reference.amountCents,
        currency: reference.currency,
        status: "successful",
        provider: "paymentwall",
      });

      if (!result.success && !result.alreadyProcessed) {
        return new NextResponse("PROCESSING", { status: 202 });
      }
    } else if (reference.paymentType === "wallet_topup") {
      const result = await processOneTimeFlutterwavePayment(supabase, {
        transactionId: paymentwallRef || txRef,
        txRef,
        status: "successful",
        paymentType: "wallet_topup",
        userId: params.uid,
        amountCents: reference.amountCents,
        currency: reference.currency,
        provider: "paymentwall",
      });

      if (!result.success && !result.alreadyProcessed) {
        return new NextResponse("PROCESSING", { status: 202 });
      }
    } else {
      const result = await processOneTimeFlutterwavePayment(supabase, {
        transactionId: paymentwallRef || txRef,
        txRef,
        status: "successful",
        paymentType: "credit_purchase",
        userId: params.uid,
        amountCents: reference.amountCents,
        currency: reference.currency,
        credits: reference.credits,
        provider: "paymentwall",
      });

      if (!result.success && !result.alreadyProcessed) {
        return new NextResponse("PROCESSING", { status: 202 });
      }
    }

    return new NextResponse("OK");
  } catch (error) {
    console.error("Paymentwall pingback processing failed:", error);
    return new NextResponse("ERROR", { status: 500 });
  }
}
