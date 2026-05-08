import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  canAccessPaidFeatures,
  hasUnlockedWalletAccess,
} from "@/lib/subscription/permissions";
import { restoreCreditLockedProfileIfEligible } from "@/lib/profile/credit-lock";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const parsePositiveInteger = (value: unknown) => {
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
};

class WalletPaymentError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

type WalletPaymentType = "subscription" | "credit_purchase" | "payment";

type WalletPaymentResult = {
  success: boolean;
  balance_before: number;
  balance_after: number;
  amount_deducted: number;
  message: string;
};

async function ensureWalletExists(userId: string) {
  const { data: walletRow, error: walletError } = await supabase
    .from("wallets")
    .select("balance_cents")
    .eq("user_id", userId)
    .maybeSingle();

  if (walletError) {
    throw new WalletPaymentError("Failed to load wallet balance");
  }

  if (walletRow) {
    return walletRow;
  }

  const { data: insertedWallet, error: insertError } = await supabase
    .from("wallets")
    .insert({ user_id: userId, balance_cents: 0 })
    .select("balance_cents")
    .single();

  if (insertError) {
    throw new WalletPaymentError("Failed to initialize wallet balance");
  }

  return insertedWallet;
}

async function ensureCreditsExist(userId: string) {
  const { data: creditRow, error: creditError } = await supabase
    .from("credits")
    .select("total, used, rollover")
    .eq("user_id", userId)
    .maybeSingle();

  if (creditError) {
    throw new WalletPaymentError("Failed to load credit balance");
  }

  if (creditRow) {
    return creditRow;
  }

  const { data: insertedCredits, error: insertError } = await supabase
    .from("credits")
    .insert({ user_id: userId, total: 0, used: 0, rollover: 0 })
    .select("total, used, rollover")
    .single();

  if (insertError) {
    throw new WalletPaymentError("Failed to initialize credit balance");
  }

  return insertedCredits;
}

const getSubscriptionCredits = (tier: string) => {
  switch (tier.toLowerCase()) {
    case "basic":
      return 5;
    case "standard":
      return 10;
    case "premium":
      return 30;
    case "vip":
      return 999999;
    default:
      return 0;
  }
};

async function processWalletBalancePaymentFallback(params: {
  userId: string;
  type: WalletPaymentType;
  amountCents: number;
  credits: number | null;
  tier: string | null;
}): Promise<WalletPaymentResult> {
  const { userId, type, amountCents, credits, tier } = params;
  const walletRow = await ensureWalletExists(userId);

  const balanceBefore = Number(walletRow?.balance_cents || 0);
  if (balanceBefore < amountCents) {
    throw new WalletPaymentError("Insufficient wallet balance", 402);
  }

  const balanceAfter = balanceBefore - amountCents;
  let walletDeducted = false;

  const rollbackWallet = async () => {
    if (!walletDeducted) return;

    await supabase
      .from("wallets")
      .update({ balance_cents: balanceBefore })
      .eq("user_id", userId);
  };

  try {
    const { error: deductError } = await supabase
      .from("wallets")
      .update({ balance_cents: balanceAfter })
      .eq("user_id", userId);

    if (deductError) {
      throw new WalletPaymentError("Failed to update wallet balance");
    }

    walletDeducted = true;

    let description = `Payment from wallet - ${(amountCents / 100).toFixed(2)}`;
    let successMessage = "Payment processed successfully";

    if (type === "subscription") {
      if (!tier) {
        throw new WalletPaymentError("Subscription tier is required", 400);
      }

      const normalizedTier = tier.toLowerCase();
      const creditsToAdd = getSubscriptionCredits(normalizedTier);

      const { error: accountError } = await supabase
        .from("accounts")
        .update({ tier: normalizedTier })
        .eq("id", userId);

      if (accountError) {
        throw new WalletPaymentError("Failed to update subscription tier");
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (membershipsError) {
        throw new WalletPaymentError("Failed to load membership record");
      }

      const membershipId = memberships?.[0]?.id as string | undefined;
      const membershipPayload = {
        user_id: userId,
        tier: normalizedTier,
        status: "active",
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        price_cents: amountCents,
        updated_at: new Date().toISOString(),
      };

      const membershipQuery = membershipId
        ? supabase.from("memberships").update(membershipPayload).eq("id", membershipId)
        : supabase.from("memberships").insert(membershipPayload);

      const { error: membershipWriteError } = await membershipQuery;
      if (membershipWriteError) {
        throw new WalletPaymentError("Failed to activate membership");
      }

      const creditRow = await ensureCreditsExist(userId);
      const totalBefore = Number(creditRow?.total || 0);
      const usedBefore = Number(creditRow?.used || 0);
      const rolloverBefore = Number(creditRow?.rollover || 0);
      const availableBefore = Math.max(0, totalBefore - usedBefore + rolloverBefore);

      const nextTotal =
        normalizedTier === "vip"
          ? 999999
          : creditsToAdd;
      const nextUsed = 0;
      const nextRollover = normalizedTier === "vip" ? 0 : availableBefore;

      const { error: creditUpdateError } = await supabase
        .from("credits")
        .update({
          total: nextTotal,
          used: nextUsed,
          rollover: nextRollover,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (creditUpdateError) {
        throw new WalletPaymentError("Failed to allocate subscription credits");
      }

      if (normalizedTier !== "vip" && availableBefore > 0) {
        await supabase.from("credit_transactions").insert({
          user_id: userId,
          amount: availableBefore,
          action_type: "subscription_credit_rollover",
          description: `Rolled over ${availableBefore} unused credit(s) into the new ${normalizedTier} subscription cycle.`,
        });
      }

      await supabase.from("credit_transactions").insert({
        user_id: userId,
        amount: creditsToAdd,
        action_type: "subscription_monthly_allocation",
        description: `Allocated ${creditsToAdd} monthly credits for ${normalizedTier} tier.`,
      });

      await restoreCreditLockedProfileIfEligible(supabase, userId).catch(
        (restoreError) => {
          console.warn(
            "[use-wallet-balance] Credit-locked profile restore skipped after subscription:",
            restoreError
          );
        }
      );

      description = `Subscription payment for ${normalizedTier} - ${(amountCents / 100).toFixed(2)}`;
      successMessage = "Subscription activated successfully";
    } else if (type === "credit_purchase") {
      if (!credits) {
        throw new WalletPaymentError("A valid credit amount is required", 400);
      }

      const creditRow = await ensureCreditsExist(userId);

      const { error: creditUpdateError } = await supabase
        .from("credits")
        .update({
          total: Number(creditRow?.total || 0) + credits,
          used: Number(creditRow?.used || 0),
          rollover: Number(creditRow?.rollover || 0),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (creditUpdateError) {
        throw new WalletPaymentError("Failed to add purchased credits");
      }

      await supabase.from("credit_transactions").insert({
        user_id: userId,
        amount: credits,
        action_type: "credit_purchase_wallet",
        description: `Purchased ${credits} credit(s) using wallet balance.`,
      });

      await restoreCreditLockedProfileIfEligible(supabase, userId).catch(
        (restoreError) => {
          console.warn(
            "[use-wallet-balance] Credit-locked profile restore skipped after wallet credit purchase:",
            restoreError
          );
        }
      );

      description = `Credit purchase (${credits} credits) - ${(amountCents / 100).toFixed(2)}`;
      successMessage = `${credits} credits added successfully`;
    }

    const { error: transactionError } = await supabase
      .from("wallet_transactions")
      .insert({
        user_id: userId,
        type:
          type === "subscription"
            ? "subscription_payment"
            : type === "credit_purchase"
              ? "credit_purchase"
              : "payment",
        amount_cents: -amountCents,
        balance_before_cents: balanceBefore,
        balance_after_cents: balanceAfter,
        description,
        reference_id: `wallet_${Date.now()}`,
      });

    if (transactionError) {
      throw new WalletPaymentError("Failed to record wallet transaction");
    }

    return {
      success: true,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      amount_deducted: amountCents,
      message: successMessage,
    };
  } catch (error) {
    await rollbackWallet();
    throw error;
  }
}

/**
 * Use wallet balance to pay for subscriptions or credit purchases
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

    const { type, amountCents, credits, tier } = await request.json();
    const normalizedAmountCents = parsePositiveInteger(amountCents);
    const normalizedCredits =
      credits === undefined || credits === null ? null : parsePositiveInteger(credits);

    if (
      (type !== "subscription" && type !== "credit_purchase" && type !== "payment") ||
      !normalizedAmountCents
    ) {
      return NextResponse.json(
        { error: "Invalid payment parameters" },
        { status: 400 }
      );
    }

    if (type === "subscription") {
      const walletAccessEnabled = await hasUnlockedWalletAccess(user.id);
      if (!walletAccessEnabled) {
        return NextResponse.json(
          {
            error:
              "Wallet is locked until your first successful subscription payment.",
          },
          { status: 403 }
        );
      }
    } else {
      const paidFeaturesAccess = await canAccessPaidFeatures(user.id);
      if (!paidFeaturesAccess.allowed) {
        return NextResponse.json(
          {
            error:
              paidFeaturesAccess.message ||
              "An active subscription plan is required to access paid features.",
          },
          { status: 403 }
        );
      }
    }

    if (type === "credit_purchase" && !normalizedCredits) {
      return NextResponse.json(
        { error: "A valid credit amount is required" },
        { status: 400 }
      );
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "process_wallet_balance_payment",
      {
        p_user_id: user.id,
        p_type: type,
        p_amount_cents: normalizedAmountCents,
        p_credits: normalizedCredits,
        p_tier: tier || null,
      }
    );

    if (rpcError) {
      const message = rpcError.message || "Failed to process wallet payment";
      const lowerMessage = message.toLowerCase();

      if (lowerMessage.includes("insufficient wallet balance")) {
        const { data: currentWallet } = await supabase
          .from("wallets")
          .select("balance_cents")
          .eq("user_id", user.id)
          .maybeSingle();

        const currentBalance = currentWallet?.balance_cents || 0;
        return NextResponse.json(
          {
            error: "Insufficient wallet balance",
            currentBalance,
            required: normalizedAmountCents,
            shortfall: Math.max(normalizedAmountCents - currentBalance, 0),
          },
          { status: 402 }
        );
      }

      console.error("[use-wallet-balance] RPC error:", rpcError);

      try {
        const fallbackResult = await processWalletBalancePaymentFallback({
          userId: user.id,
          type,
          amountCents: normalizedAmountCents,
          credits: normalizedCredits,
          tier: tier || null,
        });

        return NextResponse.json({
          ...fallbackResult,
          recovered_via_fallback: true,
        });
      } catch (fallbackError) {
        const fallbackMessage = getErrorMessage(
          fallbackError,
          "Failed to process wallet payment"
        );
        const status =
          fallbackError instanceof WalletPaymentError ? fallbackError.status : 500;

        return NextResponse.json({ error: fallbackMessage }, { status });
      }
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!result) {
      return NextResponse.json(
        { error: "Wallet payment returned no result" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Error using wallet balance:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to process wallet payment") },
      { status: 500 }
    );
  }
}
