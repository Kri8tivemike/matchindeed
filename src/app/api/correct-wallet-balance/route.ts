import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Correct wallet balance based on actual transaction records
 * This recalculates the balance from transaction history
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

    // Calculate correct balance from transactions
    // Start from 0 and apply all transactions
    let calculatedBalance = 0;
    const transactionLog: Array<{ type: string; amount: number; balance: number }> = [];

    if (transactions && transactions.length > 0) {
      for (const tx of transactions) {
        if (tx.type === "topup" || tx.type === "refund" || tx.type === "credit") {
          calculatedBalance += tx.amount_cents;
        } else if (tx.type === "payment" || tx.type === "debit" || tx.type === "credit_purchase" || tx.type === "subscription_payment") {
          calculatedBalance -= Math.abs(tx.amount_cents);
        }
        transactionLog.push({
          type: tx.type,
          amount: tx.amount_cents,
          balance: calculatedBalance,
        });
      }
    }

    // Get current wallet balance
    const { data: currentWallet } = await supabase
      .from("wallets")
      .select("balance_cents")
      .eq("user_id", user.id)
      .single();

    const currentBalance = currentWallet?.balance_cents || 0;
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
  } catch (error: any) {
    console.error("Error correcting wallet balance:", error);
    return NextResponse.json(
      { error: error.message || "Failed to correct wallet balance" },
      { status: 500 }
    );
  }
}
