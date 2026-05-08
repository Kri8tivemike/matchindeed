import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  extractOneTimeCheckoutPayload,
  processOneTimeCheckoutSession,
} from "@/lib/payments/checkout-processing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover" as Stripe.StripeConfig["apiVersion"],
  typescript: true,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function isRetryableStripeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const type = String((error as { type?: unknown }).type || "");
  return (
    type === "StripeRateLimitError" ||
    type === "StripeAPIError" ||
    type === "StripeConnectionError"
  );
}

/**
 * Verify a Stripe payment session and return its metadata
 * This is used to check payment status when webhook might not have fired yet
 */
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
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionUserId = session.metadata?.userId || session.client_reference_id;

    if (!sessionUserId || sessionUserId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized payment session access" },
        { status: 403 }
      );
    }

    const payload = extractOneTimeCheckoutPayload(session);
    const result = payload
      ? await processOneTimeCheckoutSession(supabase, session)
      : {
          success: false,
          retryable: false,
          message: "Unsupported Stripe checkout session type.",
        };

    return NextResponse.json({
      ...result,
      paid: session.payment_status === "paid",
      payment_status: session.payment_status,
      status: session.status,
      mode: session.mode,
      type: payload?.paymentType || session.metadata?.type || null,
      userId: payload?.userId || null,
      credits: payload?.paymentType === "credit_purchase" ? payload.credits : null,
      amountCents: payload?.amountCents || null,
      currency: payload?.currency || session.currency || null,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to verify payment";
    console.error("Error verifying payment:", error);
    if (isRetryableStripeError(error)) {
      return NextResponse.json({
        success: false,
        retryable: true,
        message: "Payment verification is processing. Please refresh in a few seconds.",
      });
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
