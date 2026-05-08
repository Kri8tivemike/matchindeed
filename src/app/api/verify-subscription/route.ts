import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { processSubscriptionCheckoutSession } from "@/lib/subscription/checkout-processing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover" as Stripe.StripeConfig["apiVersion"],
  typescript: true,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

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
 * Verify a Stripe subscription session and process subscription if webhook hasn't fired yet
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user from server-side session
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
              // Ignore cookie setting errors
            }
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseServer.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    // Retrieve the checkout session and expand subscription for more reliable status checks.
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    const sessionUserId = session.metadata?.userId || session.client_reference_id || user.id;

    if (sessionUserId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized subscription session access" },
        { status: 403 }
      );
    }

    const result = await processSubscriptionCheckoutSession(supabase, session);

    return NextResponse.json({
      ...result,
      payment_status: session.payment_status,
      status: session.status,
      mode: session.mode,
    });
  } catch (error: unknown) {
    console.error("Error verifying subscription:", error);
    if (isRetryableStripeError(error)) {
      return NextResponse.json({
        success: false,
        message:
          "Subscription verification is processing. Please refresh in a few seconds.",
        retryable: true,
      });
    }

    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to verify subscription") },
      { status: 500 }
    );
  }
}
