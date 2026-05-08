import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { processOneTimeCheckoutSession } from "@/lib/payments/checkout-processing";
import { processSubscriptionCheckoutSession } from "@/lib/subscription/checkout-processing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover" as Stripe.StripeConfig["apiVersion"],
  typescript: true,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    console.error("[Webhook] Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json(
      { received: false, error: "Webhook not configured" },
      { status: 503 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown webhook signature error";
    console.error("Webhook signature verification failed:", errorMessage);
    return NextResponse.json({ error: `Webhook Error: ${errorMessage}` }, { status: 400 });
  }

  // Handle the event
  console.log(`[Webhook] Received event: ${event.type}`);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const paymentType = session.metadata?.type;

      console.log(
        `[Webhook] checkout.session.completed - userId: ${userId}, paymentType: ${paymentType}, metadata:`,
        session.metadata
      );

      if (paymentType === "wallet_topup" || paymentType === "credit_purchase") {
        try {
          const result = await processOneTimeCheckoutSession(supabase, session);
          console.log(
            `[Webhook] ${paymentType} result for ${session.id}: ${result.message} (alreadyProcessed=${Boolean(
              result.alreadyProcessed
            )})`
          );
        } catch (paymentError) {
          console.error(`[Webhook] Error processing ${paymentType}:`, paymentError);
          return NextResponse.json(
            {
              received: false,
              error:
                paymentError instanceof Error
                  ? paymentError.message
                  : `Failed to process ${paymentType}`,
            },
            { status: 500 }
          );
        }
        break;
      }

      // Handle subscription (existing logic)
      const tier = session.metadata?.tier;
      if (userId && tier) {
        console.log(`[Webhook] Processing subscription for user ${userId}, tier: ${tier}`);

        try {
          const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ["subscription"],
          });

          const result = await processSubscriptionCheckoutSession(supabase, fullSession);
          console.log(
            `[Webhook] Subscription result for ${userId}: ${result.message} (alreadyProcessed=${Boolean(
              result.alreadyProcessed
            )})`
          );
        } catch (subscriptionError) {
          console.error("[Webhook] Error processing subscription:", subscriptionError);
          return NextResponse.json(
            {
              received: false,
              error:
                subscriptionError instanceof Error
                  ? subscriptionError.message
                  : "Failed to process subscription",
            },
            { status: 500 }
          );
        }
      }
      break;
    }

    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(
        `[Webhook] Skipping payment_intent.succeeded (${paymentIntent.id}) to prevent duplicate processing`
      );
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      // Handle subscription updates/deletions
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
