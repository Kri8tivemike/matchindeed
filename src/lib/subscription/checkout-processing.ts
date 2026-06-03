import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { allocateSubscriptionCredits } from "@/lib/credits/allocation";
import { restoreCreditLockedProfileIfEligible } from "@/lib/profile/credit-lock";
import { clearStarterTrialSlot } from "@/lib/starter-trial";
import { CIO_EVENTS, trackCustomerEventSafely } from "@/lib/customerio";
import {
  PRODUCT_ANALYTICS_EVENTS,
  trackProductEventSafely,
} from "@/lib/product-analytics";
import { evaluateFirstSubscriptionReferralReward } from "@/lib/referrals/rewards";

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

export type FlutterwaveSubscriptionPayment = {
  transactionId: string;
  txRef: string;
  userId: string;
  tier: string;
  amountCents: number;
  currency: string;
  status: string;
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
  amountCents: number,
  source = "stripe_checkout"
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
    source,
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

    // Detach any starter-trial slot pointer so the carried-over slot is treated
    // as a regular self-customized slot under the new subscription. The slot
    // row itself is preserved; only the user_starter_trials.active_slot_id
    // pointer is cleared. Slots created before the new subscription window are
    // also grandfathered out of the cycle's custom-slot allowance count
    // (see getCalendarSlotUsageForMonth).
    const { error: clearStarterError } = await clearStarterTrialSlot(
      supabase,
      userId
    );
    if (clearStarterError) {
      console.warn(
        "[checkout-processing] Failed to clear starter trial slot pointer:",
        clearStarterError
      );
    }

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

    await trackProductEventSafely(
      userId,
      PRODUCT_ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED,
      {
        tier,
        amount_cents: amountCents,
        payment_provider: "stripe",
        stripe_session_id: session.id,
        stripe_subscription_id: stripeSubscriptionId,
        starts_at: startsAt,
        expires_at: expiresAt,
      }
    );

    await evaluateFirstSubscriptionReferralReward(supabase, userId, {
      tier,
      amount_cents: amountCents,
      stripe_session_id: session.id,
      stripe_subscription_id: stripeSubscriptionId,
    }).catch((referralError) => {
      console.warn(
        "[checkout-processing] referral subscription reward skipped:",
        referralError
      );
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

export async function processSubscriptionFlutterwavePayment(
  supabase: SupabaseClient,
  payment: FlutterwaveSubscriptionPayment
): Promise<ProcessResult> {
  const tier = payment.tier?.toLowerCase();
  const sessionId = payment.txRef || `flw-${payment.transactionId}`;

  if (!payment.userId || !tier) {
    throw new Error("Missing Flutterwave subscription metadata.");
  }

  if (payment.status !== "successful") {
    return {
      success: false,
      retryable: payment.status === "pending",
      tier,
      message:
        payment.status === "pending"
          ? "Subscription payment is still processing."
          : "Subscription payment has not been completed successfully.",
    };
  }

  const claim = await claimProcessingRow(
    supabase,
    sessionId,
    payment.userId,
    tier,
    String(payment.transactionId),
    payment.amountCents,
    "flutterwave_checkout"
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
    const startsAt = new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const { error: accountError } = await supabase
      .from("accounts")
      .update({ tier })
      .eq("id", payment.userId);

    if (accountError) {
      throw accountError;
    }

    const { data: existingMembership, error: membershipLookupError } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", payment.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (membershipLookupError) {
      throw membershipLookupError;
    }

    const membershipData = {
      user_id: payment.userId,
      tier,
      status: "active",
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      price_cents: payment.amountCents,
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
        .eq("reference_id", sessionId)
        .eq("type", "subscription_payment")
        .maybeSingle<{ id: string }>();

    if (existingSubscriptionPaymentError) {
      throw existingSubscriptionPaymentError;
    }

    const { data: currentWallet, error: walletLookupError } = await supabase
      .from("wallets")
      .select("balance_cents")
      .eq("user_id", payment.userId)
      .maybeSingle<{ balance_cents: number | null }>();

    if (walletLookupError) {
      throw walletLookupError;
    }

    if (!existingSubscriptionPayment?.id) {
      const walletBalance = Number(currentWallet?.balance_cents || 0);
      const { error: walletTransactionError } = await supabase
        .from("wallet_transactions")
        .insert({
          user_id: payment.userId,
          type: "subscription_payment",
          amount_cents: payment.amountCents,
          balance_before_cents: walletBalance,
          balance_after_cents: walletBalance,
          description: `Subscription payment for ${tier} plan via Flutterwave`,
          reference_id: sessionId,
        });

      if (walletTransactionError) {
        throw walletTransactionError;
      }
    }

    const creditResult = await allocateSubscriptionCredits(supabase, payment.userId, tier);

    await restoreCreditLockedProfileIfEligible(supabase, payment.userId).catch(
      (restoreError) => {
        console.warn(
          "[checkout-processing] Credit-locked profile restore skipped:",
          restoreError
        );
      }
    );

    const { error: clearStarterError } = await clearStarterTrialSlot(
      supabase,
      payment.userId
    );
    if (clearStarterError) {
      console.warn(
        "[checkout-processing] Failed to clear starter trial slot pointer:",
        clearStarterError
      );
    }

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
      .eq("session_id", sessionId)
      .eq("processing_token", claim.processingToken);

    if (completeError) {
      throw completeError;
    }

    await trackCustomerEventSafely(payment.userId, CIO_EVENTS.SUBSCRIPTION_UPGRADED, {
      tier,
      amount_cents: payment.amountCents,
      currency: payment.currency,
      flutterwave_transaction_id: payment.transactionId,
      flutterwave_tx_ref: sessionId,
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    await trackProductEventSafely(
      payment.userId,
      PRODUCT_ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED,
      {
        tier,
        amount_cents: payment.amountCents,
        currency: payment.currency,
        payment_provider: "flutterwave",
        flutterwave_transaction_id: payment.transactionId,
        flutterwave_tx_ref: sessionId,
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      }
    );

    await evaluateFirstSubscriptionReferralReward(supabase, payment.userId, {
      tier,
      amount_cents: payment.amountCents,
      flutterwave_transaction_id: payment.transactionId,
      flutterwave_tx_ref: sessionId,
    }).catch((referralError) => {
      console.warn(
        "[checkout-processing] referral subscription reward skipped:",
        referralError
      );
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
      .eq("session_id", sessionId)
      .eq("processing_token", claim.processingToken);

    throw error;
  }
}
