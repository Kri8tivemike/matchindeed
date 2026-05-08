import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { recordCreditTransaction } from "@/lib/credits/transactions";
import { restoreCreditLockedProfileIfEligible } from "@/lib/profile/credit-lock";
import { canAccessPaidFeatures } from "@/lib/subscription/permissions";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Manually add credits or wallet balance to a user's account
 * This is a fallback when webhook hasn't processed the payment yet
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
              // Ignore cookie setting errors in API routes
            }
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseServer.auth.getUser();
    
    if (authError || !user) {
      console.error("[add-credits] Auth error:", authError);
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { userId, credits, sessionId, type, amountCents } = await request.json();

    // Verify the user is adding credits to their own account
    if (userId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized - user ID mismatch" },
        { status: 403 }
      );
    }

    // Handle wallet top-up
    if (type === "wallet_topup" && amountCents) {
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

      // CRITICAL: Check if transaction already exists FIRST to prevent duplicates
      // This MUST happen before any wallet balance updates
      if (sessionId) {
        const { data: existingTransaction } = await supabase
          .from("wallet_transactions")
          .select("id, amount_cents, balance_after_cents, balance_before_cents")
          .eq("reference_id", sessionId)
          .eq("type", "topup")
          .maybeSingle();

        if (existingTransaction) {
          console.log("[add-credits] Transaction already exists for session:", sessionId, "- SKIPPING PROCESSING");
          // Return existing transaction data - DO NOT process again
          return NextResponse.json({
            success: true,
            balanceAdded: 0, // Already processed
            balanceBefore: existingTransaction.balance_before_cents,
            balanceAfter: existingTransaction.balance_after_cents,
            message: "Payment already processed",
            alreadyProcessed: true,
          });
        }
      }

      // Get current wallet balance
      const { data: currentWallet } = await supabase
        .from("wallets")
        .select("balance_cents")
        .eq("user_id", userId)
        .single();

      const balanceBefore = currentWallet?.balance_cents || 0;
      const balanceAfter = balanceBefore + amountCents;

      console.log("[add-credits] Processing NEW wallet top-up:", {
        sessionId,
        amountCents,
        balanceBefore,
        balanceAfter,
      });

      // Create transaction record FIRST (before updating balance)
      // This ensures we have a record even if balance update fails
      let transactionId: string | null = null;
      if (sessionId) {
        const { data: newTransaction, error: transactionError } = await supabase
          .from("wallet_transactions")
          .insert({
            user_id: userId,
            type: "topup",
            amount_cents: amountCents,
            balance_before_cents: balanceBefore,
            balance_after_cents: balanceAfter,
            description: `Wallet top-up (manual processing) - ${(amountCents / 100).toFixed(2)}`,
            reference_id: sessionId,
          })
          .select("id")
          .single();

        if (transactionError) {
          // If transaction insert fails, check if it's a duplicate constraint
          if (transactionError.code === "23505") { // Unique violation
            console.log("[add-credits] Duplicate transaction detected (unique constraint), skipping");
            return NextResponse.json({
              success: true,
              balanceAdded: 0,
              balanceBefore,
              balanceAfter: balanceBefore, // Don't change balance
              message: "Payment already processed",
              alreadyProcessed: true,
            });
          }
          console.error("[add-credits] Error creating transaction record:", transactionError);
          return NextResponse.json(
            { error: "Failed to create transaction record" },
            { status: 500 }
          );
        }
        transactionId = newTransaction?.id || null;
      }

      // Update wallet balance (only if transaction was created successfully)
      const { error: walletError } = await supabase
        .from("wallets")
        .upsert({
          user_id: userId,
          balance_cents: balanceAfter,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (walletError) {
        console.error("[add-credits] Error updating wallet:", walletError);
        // If wallet update fails, we should delete the transaction record
        if (transactionId) {
          await supabase.from("wallet_transactions").delete().eq("id", transactionId);
        }
        return NextResponse.json(
          { error: "Failed to update wallet balance" },
          { status: 500 }
        );
      }

      console.log("[add-credits] Successfully processed wallet top-up for session:", sessionId);

      return NextResponse.json({
        success: true,
        balanceAdded: amountCents,
        balanceBefore,
        balanceAfter,
      });
    }

    const parsedCredits =
      typeof credits === "number" && Number.isInteger(credits) ? credits : NaN;

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

    if (!Number.isInteger(parsedCredits) || parsedCredits <= 0) {
      return NextResponse.json(
        { error: "Invalid credits amount" },
        { status: 400 }
      );
    }

    const purchaseType =
      typeof type === "string" && type.length > 0 ? type : "credit_purchase";

    if (sessionId) {
      const { data: existingTransaction } = await supabase
        .from("wallet_transactions")
        .select("id")
        .eq("reference_id", sessionId)
        .eq("type", purchaseType)
        .maybeSingle();

      if (existingTransaction) {
        const { data: existingCredits } = await supabase
          .from("credits")
          .select("total")
          .eq("user_id", userId)
          .single();

        return NextResponse.json({
          success: true,
          message: "Credits already processed",
          creditsAdded: 0,
          totalBefore: existingCredits?.total || 0,
          totalAfter: existingCredits?.total || 0,
          alreadyProcessed: true,
        });
      }
    }

    // Get current credits
    const { data: currentCredits, error: creditsError } = await supabase
      .from("credits")
      .select("total, used, rollover")
      .eq("user_id", userId)
      .single();

    if (creditsError && creditsError.code !== "PGRST116") {
      console.error("Error fetching credits:", creditsError);
      return NextResponse.json(
        { error: "Failed to fetch current credits" },
        { status: 500 }
      );
    }

    const totalBefore = currentCredits?.total || 0;
    const totalAfter = totalBefore + parsedCredits;

    console.log("[add-credits] Processing credit purchase:", {
      userId,
      credits: parsedCredits,
      totalBefore,
      totalAfter,
      sessionId,
    });

    let transactionId: string | null = null;
    if (sessionId) {
      const { data: currentWallet } = await supabase
        .from("wallets")
        .select("balance_cents")
        .eq("user_id", userId)
        .maybeSingle();

      const walletBalance = currentWallet?.balance_cents || 0;
      const purchaseAmountCents =
        typeof amountCents === "number" && amountCents > 0 ? amountCents : 0;

      const { data: newTransaction, error: transactionError } = await supabase
        .from("wallet_transactions")
        .insert({
          user_id: userId,
          type: purchaseType,
          amount_cents: purchaseAmountCents > 0 ? -purchaseAmountCents : 0,
          balance_before_cents: walletBalance,
          balance_after_cents: walletBalance,
          description: `Purchased ${parsedCredits} credit${parsedCredits !== 1 ? "s" : ""} (manual processing)`,
          reference_id: sessionId,
        })
        .select("id")
        .single();

      if (transactionError) {
        if (transactionError.code === "23505") {
          const { data: existingCredits } = await supabase
            .from("credits")
            .select("total")
            .eq("user_id", userId)
            .single();

          return NextResponse.json({
            success: true,
            message: "Credits already processed",
            creditsAdded: 0,
            totalBefore: existingCredits?.total || totalBefore,
            totalAfter: existingCredits?.total || totalBefore,
            alreadyProcessed: true,
          });
        }

        console.error("[add-credits] Error creating transaction record:", transactionError);
        return NextResponse.json(
          { error: "Failed to create transaction record" },
          { status: 500 }
        );
      }

      transactionId = newTransaction?.id || null;
    }

    // Update credits after transaction reservation succeeds.
    const { error: updateError } = await supabase
      .from("credits")
      .upsert({
        user_id: userId,
        total: totalAfter,
        used: currentCredits?.used || 0,
        rollover: currentCredits?.rollover || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (updateError) {
      console.error("[add-credits] Error updating credits:", updateError);
      if (transactionId) {
        await supabase.from("wallet_transactions").delete().eq("id", transactionId);
      }
      return NextResponse.json(
        { error: "Failed to update credits" },
        { status: 500 }
      );
    }

      console.log("[add-credits] Successfully updated credits:", {
        userId,
        totalBefore,
        totalAfter,
        creditsAdded: parsedCredits,
      });

      await restoreCreditLockedProfileIfEligible(supabase, userId).catch(
        (restoreError) => {
          console.warn(
            "[add-credits] Credit-locked profile restore skipped:",
            restoreError
          );
        }
      );

      await recordCreditTransaction(supabase, {
        userId,
      amount: parsedCredits,
      actionType: "credit_purchase_manual",
      description: `Manual credit purchase processing for ${parsedCredits} credit(s).`,
    });

    return NextResponse.json({
      success: true,
      creditsAdded: parsedCredits,
      totalBefore,
      totalAfter,
    });
  } catch (error: unknown) {
    console.error("Error adding credits:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to add credits") },
      { status: 500 }
    );
  }
}
