import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Stripe apiVersion varies by package version
  apiVersion: "2026-01-28.clover" as any,
  typescript: true,
});

/**
 * Verify a Stripe payment session and return its metadata
 * This is used to check payment status when webhook might not have fired yet
 */
export async function GET(request: NextRequest) {
  try {
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

    // Check if payment was successful
    if (session.payment_status === "paid") {
      return NextResponse.json({
        paid: true,
        type: session.metadata?.type || null,
        userId: session.metadata?.userId || null,
        credits: session.metadata?.credits ? parseInt(session.metadata.credits) : null,
        amountCents: session.metadata?.amountCents ? parseInt(session.metadata.amountCents) : null,
        currency: session.metadata?.currency || null,
      });
    }

    return NextResponse.json({
      paid: false,
      payment_status: session.payment_status,
    });
  } catch (error: any) {
    console.error("Error verifying payment:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify payment" },
      { status: 500 }
    );
  }
}
