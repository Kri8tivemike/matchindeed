import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { allocateSubscriptionCredits } from "@/lib/credits/allocation";
import { restoreCreditLockedProfileIfEligible } from "@/lib/profile/credit-lock";
import { CIO_EVENTS, trackCustomerEventSafely } from "@/lib/customerio";

type ProcessingRow = {
  session_id: string;
  status: "processing" | "completed" | "failed";
  processing_token: string | null;
  updated_at: string | null;
};

type ProcessResult = {
  success: boolean;
  alreadyProcessed?: boolean;
  retryable?: boolean;
  message: string;
  tier?: string;
  creditsAdded?: number;
  rolloverAdded?: number;
};

const PROCESSING_STALE_MS = 60_000;

function getStripeSubscriptionWindow(
  subscription: Stripe.Subscription | null
): { startsAt: string; expiresAt: string } {
  if (subscription) {
    const currentPeriodStart =
      "current_period_start" in subscription &&
      typeof subscription.current_period_start === "number"
        ? subscription.current_period_start
        : typeof subscription.billing_cycle_anchor === "number"
          ? subscription.billing_cycle_anchor
          : Math.floor(Date.now() / 1000);

    const currentPeriodEnd =
      "current_period_end" in subscription &&
      typeof subscription.current_period_end === "number"
        ? subscription.current_period_end
        : currentPeriodStart + 30 * 24 * 60 * 60;

    return {
      startsAt: new Date(currentPeriodStart * 1000).toISOString(),
      expiresAt: new Date(currentPeriodEnd * 1000).toISOString(),
    };
  }

  const startsAt = new Date();
  const expiresAt = new Date(startsAt);
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  return {
    startsAt: startsAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

async function claimProcessingRow(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  tier: string,
  stripeSubscriptionId: string | null,
  amountCents: number
) {
  const { data: existingRow, error: readError } = await supabase
    .from("subscription_checkout_processing")
    .select("session_id, status, processing_token, updated_at")
    .eq("session_id", sessionId)
    .maybeSingle<ProcessingRow>();

  if (readError) {
    throw readError;
  }

  if (existingRow?.status === "completed") {
    return { state: "completed" as const };
  }

  if (
    existingRow?.status === "processing" &&
    existingRow.updated_at &&
    Date.now() - new Date(existingRow.updated_at).getTime() < PROCESSING_STALE_MS
  ) {
    return { state: "processing" as const };
  }

  const processingToken = randomUUID();
  const payload = {
    session_id: sessionId,
    user_id: userId,
    tier,
    stripe_subscription_id: stripeSubscriptionId,
    amount_cents: amountCents,
    status: "processing" as const,
    processing_token: processingToken,
    error: null,
    source: "stripe_checkout",
    processed_at: null,
    updated_at: new Date().toISOString(),
  };

  if (!existingRow) {
    const { error: insertError } = await supabase
      .from("subscription_checkout_processing")
      .insert(payload);

    if (insertError) {
      const { data: retryRow } = await supabase
        .from("subscription_checkout_processing")
        .select("status, updated_at")
        .eq("session_id", sessionId)
        .maybeSingle<Pick<ProcessingRow, "status" | "updated_at">>();

      if (retryRow?.status === "completed") {
        return { state: "completed" as const };
      }

      return { state: "processing" as const };
    }

    return { state: "claimed" as const, processingToken };
  }

  const { error: updateError } = await supabase
    .from("subscription_checkout_processing")
    .update(payload)
    .eq("session_id", sessionId);

  if (updateError) {
    throw updateError;
  }

  return { state: "claimed" as const, processingToken };
}

export async function processSubscriptionCheckoutSession(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<ProcessResult> {
  const tier = session.metadata?.tier?.toLowerCase();
  const userId = session.metadata?.userId || session.client_reference_id;

  if (!userId || !tier) {
    throw new Error("Missing Stripe subscription metadata.");
  }

  const expandedSubscription =
    session.subscription && typeof session.subscription !== "string"
      ? session.subscription
      : null;

  const subscriptionLooksActive =
    session.mode === "subscription" &&
    session.status === "complete" &&
    Boolean(
      expandedSubscription &&
        (expandedSubscription.status === "active" ||
          expandedSubscription.status === "trialing")
    );

  if (
    session.mode !== "subscription" ||
    (session.payment_status !== "paid" && !subscriptionLooksActive)
  ) {
    return {
      success: false,
      retryable:
        session.mode === "subscription" &&
        session.status !== "open" &&
        session.payment_status !== "unpaid",
      message:
        session.status === "open" || session.payment_status === "unpaid"
          ? "Checkout has not been completed yet."
          : "Subscription payment is still processing.",
    };
  }

  const amountCents = Number(session.amount_total || 0);
  const stripeSubscriptionId =
    expandedSubscription?.id ||
    (typeof session.subscription === "string" ? session.subscription : null);

  const claim = await claimProcessingRow(
    supabase,
    session.id,
    userId,
    tier,
    stripeSubscriptionId,
    amountCents
  );

  if (claim.state === "completed") {
    return {
      success: true,
      alreadyProcessed: true,
      message: "Subscription already processed.",
      tier,
    };
  }

  if (claim.state === "processing") {
    return {
      success: false,
      retryable: true,
      message: "Subscription activation is already in progress.",
      tier,
    };
  }

  try {
    const { startsAt, expiresAt } = getStripeSubscriptionWindow(expandedSubscription);

    const { error: accountError } = await supabase
      .from("accounts")
      .update({ tier })
      .eq("id", userId);

    if (accountError) {
      throw accountError;
    }

    const { data: existingMembership, error: membershipLookupError } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (membershipLookupError) {
      throw membershipLookupError;
    }

    const membershipData = {
      user_id: userId,
      tier,
      status: "active",
      starts_at: startsAt,
      expires_at: expiresAt,
      price_cents: amountCents,
      updated_at: new Date().toISOString(),
    };

    if (existingMembership?.id) {
      const { error: membershipUpdateError } = await supabase
        .from("memberships")
        .update(membershipData)
        .eq("id", existingMembership.id);

      if (membershipUpdateError) {
        throw membershipUpdateError;
      }
    } else {
      const { error: membershipInsertError } = await supabase
        .from("memberships")
        .insert(membershipData);

      if (membershipInsertError) {
        throw membershipInsertError;
      }
    }

    const { data: existingSubscriptionPayment, error: existingSubscriptionPaymentError } =
      await supabase
        .from("wallet_transactions")
        .select("id")
        .eq("reference_id", session.id)
        .eq("type", "subscription_payment")
        .maybeSingle<{ id: string }>();

    if (existingSubscriptionPaymentError) {
      throw existingSubscriptionPaymentError;
    }

    const { data: currentWallet, error: walletLookupError } = await supabase
      .from("wallets")
      .select("balance_cents")
      .eq("user_id", userId)
      .maybeSingle<{ balance_cents: number | null }>();

    if (walletLookupError) {
      throw walletLookupError;
    }

    if (!existingSubscriptionPayment?.id) {
      const walletBalance = Number(currentWallet?.balance_cents || 0);
      const { error: walletTransactionError } = await supabase
        .from("wallet_transactions")
        .insert({
          user_id: userId,
          type: "subscription_payment",
          amount_cents: amountCents,
          balance_before_cents: walletBalance,
          balance_after_cents: walletBalance,
          description: `Subscription payment for ${tier} plan`,
          reference_id: session.id,
        });

      if (walletTransactionError) {
        throw walletTransactionError;
      }
    }

    const creditResult = await allocateSubscriptionCredits(supabase, userId, tier);

    await restoreCreditLockedProfileIfEligible(supabase, userId).catch(
      (restoreError) => {
        console.warn(
          "[checkout-processing] Credit-locked profile restore skipped:",
          restoreError
        );
      }
    );

    const { error: completeError } = await supabase
      .from("subscription_checkout_processing")
      .update({
        status: "completed",
        credits_allocated: creditResult.creditsToAdd,
        processed_at: new Date().toISOString(),
        error: null,
        processing_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", session.id)
      .eq("processing_token", claim.processingToken);

    if (completeError) {
      throw completeError;
    }

    await trackCustomerEventSafely(userId, CIO_EVENTS.SUBSCRIPTION_UPGRADED, {
      tier,
      amount_cents: amountCents,
      stripe_session_id: session.id,
      stripe_subscription_id: stripeSubscriptionId,
      starts_at: startsAt,
      expires_at: expiresAt,
    });

    return {
      success: true,
      tier,
      creditsAdded: creditResult.creditsToAdd,
      rolloverAdded: creditResult.rolloverAdded || 0,
      message:
        creditResult.rolloverAdded && creditResult.rolloverAdded > 0
          ? `Subscription processed successfully. ${creditResult.rolloverAdded} unused credit(s) rolled over.`
          : "Subscription processed successfully.",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process subscription";

    await supabase
      .from("subscription_checkout_processing")
      .update({
        status: "failed",
        error: message,
        processing_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", session.id)
      .eq("processing_token", claim.processingToken);

    throw error;
  }
}
