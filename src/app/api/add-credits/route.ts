import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
            } catch (error) {
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

    if (!credits || credits <= 0) {
      return NextResponse.json(
        { error: "Invalid credits amount" },
        { status: 400 }
      );
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
    const totalAfter = totalBefore + credits;

    console.log("[add-credits] Processing credit purchase:", {
      userId,
      credits,
      totalBefore,
      totalAfter,
      sessionId,
    });

    // Update credits
    const { data: updatedCredits, error: updateError } = await supabase
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
      return NextResponse.json(
        { error: "Failed to update credits" },
        { status: 500 }
      );
    }

    console.log("[add-credits] Successfully updated credits:", {
      userId,
      totalBefore,
      totalAfter,
      creditsAdded: credits,
    });

    // Check if transaction already exists (webhook might have processed it)
    if (sessionId) {
      const { data: existingTransaction } = await supabase
        .from("wallet_transactions")
        .select("id, type")
        .eq("reference_id", sessionId)
        .in("type", ["credit_purchase", type || "credit_purchase"])
        .maybeSingle();

      if (existingTransaction) {
        console.log("[add-credits] Transaction already exists, webhook processed it");
        // Verify credits were actually added by checking current total
        const { data: currentCredits } = await supabase
          .from("credits")
          .select("total")
          .eq("user_id", userId)
          .single();
        
        return NextResponse.json({
          success: true,
          message: "Credits were already processed by webhook",
          creditsAdded: 0,
          totalBefore: currentCredits?.total || totalBefore,
          totalAfter: currentCredits?.total || totalAfter,
          alreadyProcessed: true,
        });
      }

      // Create transaction record
      const { error: transactionError } = await supabase.from("wallet_transactions").insert({
        user_id: userId,
        type: type || "credit_purchase",
        amount_cents: 0, // Credits don't affect wallet balance
        balance_before_cents: 0,
        balance_after_cents: 0,
        description: `Purchased ${credits} credit${credits !== 1 ? "s" : ""} (manual processing)`,
        reference_id: sessionId,
      });

      if (transactionError) {
        console.error("[add-credits] Error creating transaction record:", transactionError);
        // Don't fail the whole operation if transaction record fails
      }
    }

    return NextResponse.json({
      success: true,
      creditsAdded: credits,
      totalBefore,
      totalAfter,
    });
  } catch (error: any) {
    console.error("Error adding credits:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add credits" },
      { status: 500 }
    );
  }
}
