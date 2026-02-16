import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const { type, amountCents, credits, tier } = await request.json();

    if (!type || !amountCents || amountCents <= 0) {
      return NextResponse.json(
        { error: "Invalid payment parameters" },
        { status: 400 }
      );
    }

    // Get current wallet balance
    const { data: currentWallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance_cents")
      .eq("user_id", user.id)
      .single();

    if (walletError) {
      console.error("[use-wallet-balance] Error fetching wallet:", walletError);
      return NextResponse.json(
        { error: "Failed to fetch wallet balance" },
        { status: 500 }
      );
    }

    const currentBalance = currentWallet?.balance_cents || 0;

    // Check if wallet has sufficient balance
    if (currentBalance < amountCents) {
      return NextResponse.json(
        {
          error: "Insufficient wallet balance",
          currentBalance,
          required: amountCents,
          shortfall: amountCents - currentBalance,
        },
        { status: 402 } // 402 Payment Required
      );
    }

    const balanceBefore = currentBalance;
    const balanceAfter = currentBalance - amountCents;

    // Update wallet balance
    const { error: updateError } = await supabase
      .from("wallets")
      .upsert({
        user_id: user.id,
        balance_cents: balanceAfter,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (updateError) {
      console.error("[use-wallet-balance] Error updating wallet:", updateError);
      return NextResponse.json(
        { error: "Failed to update wallet balance" },
        { status: 500 }
      );
    }

    // Create transaction record
    let description = "";
    if (type === "subscription") {
      description = `Subscription payment for ${tier || "plan"} - ${(amountCents / 100).toFixed(2)}`;
    } else if (type === "credit_purchase") {
      description = `Credit purchase (${credits || 0} credits) - ${(amountCents / 100).toFixed(2)}`;
    } else {
      description = `Payment from wallet - ${(amountCents / 100).toFixed(2)}`;
    }

    const { error: transactionError } = await supabase.from("wallet_transactions").insert({
      user_id: user.id,
      type: type === "subscription" ? "subscription_payment" : type === "credit_purchase" ? "credit_purchase" : "payment",
      amount_cents: -amountCents, // Negative because it's a deduction
      balance_before_cents: balanceBefore,
      balance_after_cents: balanceAfter,
      description,
      reference_id: `wallet_${Date.now()}`,
    });

    if (transactionError) {
      console.error("[use-wallet-balance] Error creating transaction:", transactionError);
      // Don't fail the whole operation if transaction record fails
    }

    // Handle subscription payment
    if (type === "subscription" && tier) {
      // Calculate subscription period (1 month from now)
      const startsAt = new Date();
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      // Update account tier
      await supabase.from("accounts").update({ tier }).eq("id", user.id);

      // Create/update membership
      const { data: existingMembership } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const membershipData = {
        user_id: user.id,
        tier,
        status: "active",
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        price_cents: amountCents,
        updated_at: new Date().toISOString(),
      };

      if (existingMembership) {
        await supabase.from("memberships").update(membershipData).eq("id", existingMembership.id);
      } else {
        await supabase.from("memberships").insert(membershipData);
      }

      // Allocate credits based on tier
      const creditAllocation: Record<string, number> = {
        basic: 5,
        standard: 15,
        premium: 30,
        vip: 999999,
      };

      const creditsToAdd = creditAllocation[tier.toLowerCase()] || 0;

      if (creditsToAdd > 0) {
        const { data: currentCredits } = await supabase
          .from("credits")
          .select("total, used, rollover")
          .eq("user_id", user.id)
          .single();

        const totalBefore = currentCredits?.total || 0;
        const totalAfter = tier.toLowerCase() === "vip" ? 999999 : totalBefore + creditsToAdd;

        await supabase
          .from("credits")
          .upsert({
            user_id: user.id,
            total: totalAfter,
            used: currentCredits?.used || 0,
            rollover: currentCredits?.rollover || 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
      }
    }

    // Handle credit purchase
    if (type === "credit_purchase" && credits) {
      const { data: currentCredits } = await supabase
        .from("credits")
        .select("total, used, rollover")
        .eq("user_id", user.id)
        .single();

      const totalBefore = currentCredits?.total || 0;
      const totalAfter = totalBefore + credits;

      await supabase
        .from("credits")
        .upsert({
          user_id: user.id,
          total: totalAfter,
          used: currentCredits?.used || 0,
          rollover: currentCredits?.rollover || 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
    }

    return NextResponse.json({
      success: true,
      balanceBefore,
      balanceAfter,
      amountDeducted: amountCents,
      message: type === "subscription" 
        ? "Subscription activated successfully" 
        : type === "credit_purchase"
        ? `${credits} credits added successfully`
        : "Payment processed successfully",
    });
  } catch (error: any) {
    console.error("Error using wallet balance:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process wallet payment" },
      { status: 500 }
    );
  }
}
