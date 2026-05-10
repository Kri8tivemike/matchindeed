import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hasUnlockedWalletAccess } from "@/lib/subscription/permissions";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Correct wallet balance based on actual transaction records
 * This recalculates the balance from transaction history
 */
export async function POST() {
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

    // Get all transactions for this user
    const { data: transactions, error: transError } = await supabase
      .from("wallet_transactions")
      .select("type, amount_cents, balance_before_cents, balance_after_cents, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (transError) {
      console.error("[correct-wallet] Error fetching transactions:", transError);
      return NextResponse.json(
        { error: "Failed to fetch transactions" },
        { status: 500 }
      );
    }

    // Derive the correct wallet balance from transaction history.
    //
    // We use the balance_after_cents of the MOST RECENT transaction that
    // actually changed the wallet balance (balance_before ≠ balance_after),
    // skipping admin_adjustment records (which are themselves corrections and
    // may carry stale or incorrect values from previous buggy runs).
    //
    // Why not sum all amount_cents?
    //   Summing can over-state the balance for users who had their wallet
    //   silently clamped to 0 in the past (by the fetchWalletData safeguard)
    //   without a corresponding wallet_transaction record.  The most-recent
    //   balance_after approach only looks at the last known good state, so it
    //   naturally accounts for those gaps.
    //
    // Transactions arrive in ascending created_at order; we scan from the end.
    let calculatedBalance = 0;
    let foundRealTransaction = false;
    const transactionLog: Array<{ type: string; amount: number; balance: number }> = [];

    if (transactions && transactions.length > 0) {
      for (let i = transactions.length - 1; i >= 0; i--) {
        const tx = transactions[i];

        // Skip corrections from previous runs of this very route.
        if (tx.type === "admin_adjustment") continue;

        // Skip tracking-only records (Stripe-card payments recorded with
        // balance_before === balance_after because no wallet money moved).
        if (tx.balance_before_cents === tx.balance_after_cents) continue;

        // Found the most recent real wallet movement.
        calculatedBalance = tx.balance_after_cents ?? 0;
        foundRealTransaction = true;
        transactionLog.push({
          type: tx.type,
          amount: tx.amount_cents,
          balance: calculatedBalance,
        });
        break;
      }
    }

    // Get current wallet balance
    const { data: currentWallet } = await supabase
      .from("wallets")
      .select("balance_cents")
      .eq("user_id", user.id)
      .single();

    const currentBalance = currentWallet?.balance_cents || 0;

    // If we found no real wallet transactions there is no reliable baseline;
    // skip correction to avoid accidentally zeroing a legitimately funded wallet.
    if (!foundRealTransaction) {
      return NextResponse.json({
        success: true,
        corrected: false,
        currentBalance,
        calculatedBalance: currentBalance,
        difference: 0,
        message: "No real wallet transactions found; balance left unchanged.",
      });
    }

    const difference = currentBalance - calculatedBalance;

    // If there's a significant difference, correct it
    if (Math.abs(difference) > 100) { // More than 1 unit difference
      const { error: updateError } = await supabase
        .from("wallets")
        .upsert({
          user_id: user.id,
          balance_cents: calculatedBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (updateError) {
        console.error("[correct-wallet] Error correcting balance:", updateError);
        return NextResponse.json(
          { error: "Failed to correct wallet balance" },
          { status: 500 }
        );
      }

      // Create an admin adjustment record
      await supabase.from("wallet_transactions").insert({
        user_id: user.id,
        type: "admin_adjustment",
        amount_cents: -difference, // Negative if reducing, positive if increasing
        balance_before_cents: currentBalance,
        balance_after_cents: calculatedBalance,
        description: `Balance correction: Adjusted from ${(currentBalance / 100).toFixed(2)} to ${(calculatedBalance / 100).toFixed(2)}`,
        reference_id: `correction_${Date.now()}`,
      });

      return NextResponse.json({
        success: true,
        corrected: true,
        previousBalance: currentBalance,
        correctedBalance: calculatedBalance,
        difference: -difference,
        message: `Balance corrected from ${(currentBalance / 100).toFixed(2)} to ${(calculatedBalance / 100).toFixed(2)}`,
      });
    }

    return NextResponse.json({
      success: true,
      corrected: false,
      currentBalance,
      calculatedBalance,
      difference,
      message: "Balance is correct, no adjustment needed",
    });
  } catch (error: unknown) {
    console.error("Error correcting wallet balance:", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Failed to correct wallet balance") },
      { status: 500 }
    );
  }
}
