import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { CIO_EVENTS, trackCustomerEventSafely } from "@/lib/customerio";
import { recordCreditTransaction } from "@/lib/credits/transactions";
import { restoreCreditLockedProfileIfEligible } from "@/lib/profile/credit-lock";

export type StripeCheckoutPaymentType = "wallet_topup" | "credit_purchase";

type WalletTopupPayload = {
  paymentType: "wallet_topup";
  userId: string;
  amountCents: number;
  currency: string;
};

type CreditPurchasePayload = {
  paymentType: "credit_purchase";
  userId: string;
  amountCents: number;
  credits: number;
  currency: string;
};

export type OneTimeCheckoutPayload = WalletTopupPayload | CreditPurchasePayload;

type WalletTopupRpcResult = {
  already_processed: boolean;
  balance_before_cents: number | null;
  balance_after_cents: number | null;
};

type CreditPurchaseRpcResult = {
  already_processed: boolean;
  total_before: number | null;
  total_after: number | null;
};

export type OneTimeCheckoutProcessResult = {
  success: boolean;
  alreadyProcessed?: boolean;
  retryable?: boolean;
  message: string;
  paymentType?: StripeCheckoutPaymentType;
  amountCents?: number;
  currency?: string;
  balanceAddedCents?: number;
  balanceBeforeCents?: number;
  balanceAfterCents?: number;
  creditsAdded?: number;
  totalBefore?: number;
  totalAfter?: number;
};

export type FlutterwaveOneTimePayment = OneTimeCheckoutPayload & {
  transactionId: string;
  txRef: string;
  status: string;
};

function parsePositiveInteger(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function normalizeCurrency(value: unknown, fallback = "usd") {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  return value.trim().toLowerCase();
}

export function extractOneTimeCheckoutPayload(
  session: Pick<
    Stripe.Checkout.Session,
    "amount_total" | "client_reference_id" | "metadata"
  >
): OneTimeCheckoutPayload | null {
  const paymentType = session.metadata?.type;
  if (paymentType !== "wallet_topup" && paymentType !== "credit_purchase") {
    return null;
  }

  const userId = session.metadata?.userId || session.client_reference_id;
  if (!userId) {
    throw new Error("Missing Stripe checkout user metadata.");
  }

  const amountCents =
    parsePositiveInteger(session.metadata?.amountCents) ??
    parsePositiveInteger(session.amount_total);

  if (!amountCents) {
    throw new Error("Missing Stripe checkout amount metadata.");
  }

  const currency = normalizeCurrency(session.metadata?.currency);

  if (paymentType === "wallet_topup") {
    return {
      paymentType,
      userId,
      amountCents,
      currency,
    };
  }

  const credits = parsePositiveInteger(session.metadata?.credits);
  if (!credits) {
    throw new Error("Missing Stripe checkout credits metadata.");
  }

  return {
    paymentType,
    userId,
    amountCents,
    credits,
    currency,
  };
}

export async function processOneTimeCheckoutSession(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<OneTimeCheckoutProcessResult> {
  const payload = extractOneTimeCheckoutPayload(session);

  if (!payload) {
    return {
      success: false,
      retryable: false,
      message: "Unsupported Stripe checkout session type.",
    };
  }

  if (session.mode !== "payment") {
    return {
      success: false,
      retryable: false,
      paymentType: payload.paymentType,
      message: "Checkout session is not a one-time payment.",
    };
  }

  if (session.payment_status !== "paid") {
    return {
      success: false,
      retryable: session.status === "complete",
      paymentType: payload.paymentType,
      amountCents: payload.amountCents,
      currency: payload.currency,
      message:
        session.status === "open" || session.payment_status === "unpaid"
          ? "Checkout has not been completed yet."
          : "Payment is still processing.",
    };
  }

  if (payload.paymentType === "wallet_topup") {
    const description = `Wallet top-up via Stripe - ${payload.currency.toUpperCase()} ${(
      payload.amountCents / 100
    ).toFixed(2)} [session:${session.id}]`;

    const { data, error } = await supabase
      .rpc("apply_stripe_wallet_topup", {
        p_session_id: session.id,
        p_user_id: payload.userId,
        p_amount_cents: payload.amountCents,
        p_description: description,
      })
      .single<WalletTopupRpcResult>();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("Wallet top-up processor returned no result.");
    }

    if (!data.already_processed) {
      await trackCustomerEventSafely(payload.userId, CIO_EVENTS.WALLET_FUNDED, {
        amount_cents: payload.amountCents,
        currency: payload.currency,
        stripe_session_id: session.id,
        payment_type: payload.paymentType,
      });
    }

    return {
      success: true,
      alreadyProcessed: data.already_processed,
      paymentType: payload.paymentType,
      amountCents: payload.amountCents,
      currency: payload.currency,
      balanceAddedCents: payload.amountCents,
      balanceBeforeCents: Number(data.balance_before_cents || 0),
      balanceAfterCents: Number(data.balance_after_cents || 0),
      message: data.already_processed
        ? "Wallet top-up already processed."
        : "Wallet top-up processed successfully.",
    };
  }

  const description = `Purchased ${payload.credits} credit${
    payload.credits !== 1 ? "s" : ""
  } via Stripe checkout [session:${session.id}]`;

  const { data, error } = await supabase
    .rpc("apply_stripe_credit_purchase", {
      p_session_id: session.id,
      p_user_id: payload.userId,
      p_credits: payload.credits,
      p_amount_cents: payload.amountCents,
      p_description: description,
    })
    .single<CreditPurchaseRpcResult>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Credit purchase processor returned no result.");
  }

  await restoreCreditLockedProfileIfEligible(supabase, payload.userId).catch(
    (restoreError) => {
      console.warn(
        "[checkout-processing] Credit-locked profile restore skipped:",
        restoreError
      );
    }
  );

  if (!data.already_processed) {
    await recordCreditTransaction(supabase, {
      userId: payload.userId,
      amount: payload.credits,
      actionType: "credit_purchase_stripe_checkout",
      description,
    });

    await trackCustomerEventSafely(payload.userId, CIO_EVENTS.CREDITS_PURCHASED, {
      credits: payload.credits,
      amount_cents: payload.amountCents,
      currency: payload.currency,
      stripe_session_id: session.id,
      payment_type: payload.paymentType,
    });
  }

  return {
    success: true,
    alreadyProcessed: data.already_processed,
    paymentType: payload.paymentType,
    amountCents: payload.amountCents,
    currency: payload.currency,
    creditsAdded: payload.credits,
    totalBefore: Number(data.total_before || 0),
    totalAfter: Number(data.total_after || 0),
    message: data.already_processed
      ? "Credit purchase already processed."
      : "Credit purchase processed successfully.",
  };
}

export async function processOneTimeFlutterwavePayment(
  supabase: SupabaseClient,
  payment: FlutterwaveOneTimePayment
): Promise<OneTimeCheckoutProcessResult> {
  if (payment.status !== "successful") {
    return {
      success: false,
      retryable: payment.status === "pending",
      paymentType: payment.paymentType,
      amountCents: payment.amountCents,
      currency: payment.currency,
      message:
        payment.status === "pending"
          ? "Payment is still processing."
          : "Payment has not been completed successfully.",
    };
  }

  const reference = payment.txRef || `flw-${payment.transactionId}`;

  if (payment.paymentType === "wallet_topup") {
    const description = `Wallet top-up via Flutterwave - ${payment.currency.toUpperCase()} ${(
      payment.amountCents / 100
    ).toFixed(2)} [tx_ref:${reference}]`;

    const { data, error } = await supabase
      .rpc("apply_stripe_wallet_topup", {
        p_session_id: reference,
        p_user_id: payment.userId,
        p_amount_cents: payment.amountCents,
        p_description: description,
      })
      .single<WalletTopupRpcResult>();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("Wallet top-up processor returned no result.");
    }

    if (!data.already_processed) {
      await trackCustomerEventSafely(payment.userId, CIO_EVENTS.WALLET_FUNDED, {
        amount_cents: payment.amountCents,
        currency: payment.currency,
        flutterwave_transaction_id: payment.transactionId,
        flutterwave_tx_ref: reference,
        payment_type: payment.paymentType,
      });
    }

    return {
      success: true,
      alreadyProcessed: data.already_processed,
      paymentType: payment.paymentType,
      amountCents: payment.amountCents,
      currency: payment.currency,
      balanceAddedCents: payment.amountCents,
      balanceBeforeCents: Number(data.balance_before_cents || 0),
      balanceAfterCents: Number(data.balance_after_cents || 0),
      message: data.already_processed
        ? "Wallet top-up already processed."
        : "Wallet top-up processed successfully.",
    };
  }

  const description = `Purchased ${payment.credits} credit${
    payment.credits !== 1 ? "s" : ""
  } via Flutterwave checkout [tx_ref:${reference}]`;

  const { data, error } = await supabase
    .rpc("apply_stripe_credit_purchase", {
      p_session_id: reference,
      p_user_id: payment.userId,
      p_credits: payment.credits,
      p_amount_cents: payment.amountCents,
      p_description: description,
    })
    .single<CreditPurchaseRpcResult>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Credit purchase processor returned no result.");
  }

  await restoreCreditLockedProfileIfEligible(supabase, payment.userId).catch(
    (restoreError) => {
      console.warn(
        "[checkout-processing] Credit-locked profile restore skipped:",
        restoreError
      );
    }
  );

  if (!data.already_processed) {
    await recordCreditTransaction(supabase, {
      userId: payment.userId,
      amount: payment.credits,
      actionType: "credit_purchase_flutterwave_checkout",
      description,
    });

    await trackCustomerEventSafely(payment.userId, CIO_EVENTS.CREDITS_PURCHASED, {
      credits: payment.credits,
      amount_cents: payment.amountCents,
      currency: payment.currency,
      flutterwave_transaction_id: payment.transactionId,
      flutterwave_tx_ref: reference,
      payment_type: payment.paymentType,
    });
  }

  return {
    success: true,
    alreadyProcessed: data.already_processed,
    paymentType: payment.paymentType,
    amountCents: payment.amountCents,
    currency: payment.currency,
    creditsAdded: payment.credits,
    totalBefore: Number(data.total_before || 0),
    totalAfter: Number(data.total_after || 0),
    message: data.already_processed
      ? "Credit purchase already processed."
      : "Credit purchase processed successfully.",
  };
}
