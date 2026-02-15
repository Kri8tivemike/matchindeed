import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
  typescript: true,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Handle the event
  console.log(`[Webhook] Received event: ${event.type}`);
  
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const paymentType = session.metadata?.type;
      
      console.log(`[Webhook] checkout.session.completed - userId: ${userId}, paymentType: ${paymentType}, metadata:`, session.metadata);

      // Handle wallet top-up
      if (paymentType === "wallet_topup" && userId) {
        const amountCents = parseInt(session.metadata?.amountCents || "0");
        
        if (amountCents > 0) {
          // CRITICAL: Check if transaction already exists FIRST to prevent duplicates
          const { data: existingTransaction } = await supabase
            .from("wallet_transactions")
            .select("id, balance_after_cents")
            .eq("reference_id", session.id)
            .eq("type", "topup")
            .maybeSingle();

          if (existingTransaction) {
            console.log(`[Webhook] Transaction already exists for session: ${session.id}, skipping wallet update`);
            break; // Exit early, don't process again
          }

          // Get current wallet balance
          const { data: currentWallet } = await supabase
            .from("wallets")
            .select("balance_cents")
            .eq("user_id", userId)
            .single();

          const balanceBefore = currentWallet?.balance_cents || 0;
          const balanceAfter = balanceBefore + amountCents;

          console.log(`[Webhook] Processing NEW wallet top-up: session=${session.id}, amount=${amountCents}, before=${balanceBefore}, after=${balanceAfter}`);

          // Create transaction record FIRST (before updating balance)
          const { data: newTransaction, error: transactionError } = await supabase
            .from("wallet_transactions")
            .insert({
              user_id: userId,
              type: "topup",
              amount_cents: amountCents,
              balance_before_cents: balanceBefore,
              balance_after_cents: balanceAfter,
              description: `Wallet top-up via Stripe - ${session.metadata?.currency?.toUpperCase() || "USD"} ${(amountCents / 100).toFixed(2)}`,
              reference_id: session.id,
            })
            .select("id")
            .single();

          if (transactionError) {
            // If it's a unique constraint violation, transaction already exists
            if (transactionError.code === "23505") {
              console.log(`[Webhook] Duplicate transaction detected (unique constraint), skipping`);
              break;
            }
            console.error(`[Webhook] Error creating wallet transaction:`, transactionError);
            break; // Don't update wallet if transaction record fails
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
            console.error(`[Webhook] Error updating wallet balance:`, walletError);
            // Rollback transaction if wallet update fails
            if (newTransaction?.id) {
              await supabase.from("wallet_transactions").delete().eq("id", newTransaction.id);
            }
          } else {
            console.log(`[Webhook] Successfully processed wallet top-up for session: ${session.id}`);
          }
        }
        break;
      }

      // Handle credit purchase
      if (paymentType === "credit_purchase" && userId) {
        const credits = parseInt(session.metadata?.credits || "0");
        const amountCents = parseInt(session.metadata?.amountCents || "0");
        
        console.log(`[Webhook] Processing credit purchase: userId=${userId}, credits=${credits}, amountCents=${amountCents}`);
        
        if (credits > 0) {
          // Get current credits
          const { data: currentCredits, error: creditsError } = await supabase
            .from("credits")
            .select("total, used, rollover")
            .eq("user_id", userId)
            .single();

          if (creditsError) {
            console.error(`[Webhook] Error fetching credits:`, creditsError);
            // If no credits record exists, create one
            if (creditsError.code === "PGRST116") {
              console.log(`[Webhook] No credits record found, creating new one for user ${userId}`);
            }
          }

          const totalBefore = currentCredits?.total || 0;
          const totalAfter = totalBefore + credits;

          console.log(`[Webhook] Updating credits: ${totalBefore} -> ${totalAfter}`);

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
            console.error(`[Webhook] Error updating credits:`, updateError);
          } else {
            console.log(`[Webhook] Successfully updated credits for user ${userId}`);
          }

          // Create wallet transaction record for credit purchase
          const { data: currentWallet } = await supabase
            .from("wallets")
            .select("balance_cents")
            .eq("user_id", userId)
            .single();

          const walletBalanceBefore = currentWallet?.balance_cents || 0;
          
          const { error: transactionError } = await supabase.from("wallet_transactions").insert({
            user_id: userId,
            type: "credit_purchase",
            amount_cents: -amountCents, // Negative because it's a purchase
            balance_before_cents: walletBalanceBefore,
            balance_after_cents: walletBalanceBefore, // Wallet balance doesn't change for credit purchases
            description: `Purchased ${credits} credit${credits !== 1 ? "s" : ""} - ${session.metadata?.currency?.toUpperCase() || "USD"} ${(amountCents / 100).toFixed(2)}`,
            reference_id: session.id,
          });

          if (transactionError) {
            console.error(`[Webhook] Error creating transaction record:`, transactionError);
          }
        } else {
          console.warn(`[Webhook] Invalid credits value: ${credits}`);
        }
        break;
      }

      // Handle subscription (existing logic)
      const tier = session.metadata?.tier;
      if (userId && tier) {
        console.log(`[Webhook] Processing subscription for user ${userId}, tier: ${tier}`);
        
        // Calculate subscription period (1 month from now)
        const startsAt = new Date();
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        
        // Get subscription amount from session
        const amountTotal = session.amount_total || 0;
        
        // Update user's tier in database
        const { error: accountError } = await supabase
          .from("accounts")
          .update({ tier })
          .eq("id", userId);

        if (accountError) {
          console.error(`[Webhook] Error updating account tier:`, accountError);
        } else {
          console.log(`[Webhook] Successfully updated account tier to ${tier}`);
        }

        // Create or update membership record
        const { data: existingMembership } = await supabase
          .from("memberships")
          .select("id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const membershipData = {
          user_id: userId,
          tier,
          status: "active",
          starts_at: startsAt.toISOString(),
          expires_at: expiresAt.toISOString(),
          price_cents: amountTotal,
          updated_at: new Date().toISOString(),
        };

        if (existingMembership) {
          // Update existing membership
          const { error: membershipError } = await supabase
            .from("memberships")
            .update(membershipData)
            .eq("id", existingMembership.id);

          if (membershipError) {
            console.error(`[Webhook] Error updating membership:`, membershipError);
          } else {
            console.log(`[Webhook] Successfully updated membership`);
          }
        } else {
          // Create new membership
          const { error: membershipError } = await supabase
            .from("memberships")
            .insert(membershipData);

          if (membershipError) {
            console.error(`[Webhook] Error creating membership:`, membershipError);
          } else {
            console.log(`[Webhook] Successfully created membership`);
          }
        }

        // Allocate credits based on tier
        const creditAllocation: Record<string, number> = {
          basic: 5,
          standard: 15,
          premium: 30,
          vip: 0, // Unlimited, handled separately
        };

        const creditsToAdd = creditAllocation[tier.toLowerCase()] || 0;
        
        if (creditsToAdd > 0 || tier.toLowerCase() === "vip") {
          // Get current credits
          const { data: currentCredits } = await supabase
            .from("credits")
            .select("total, used, rollover")
            .eq("user_id", userId)
            .single();

          if (tier.toLowerCase() === "vip") {
            // VIP gets unlimited credits - set a very high number or handle differently
            // For now, we'll set it to a high number (999999)
            await supabase
              .from("credits")
              .upsert({
                user_id: userId,
                total: 999999, // Effectively unlimited
                used: currentCredits?.used || 0,
                rollover: currentCredits?.rollover || 0,
                updated_at: new Date().toISOString(),
              }, { onConflict: "user_id" });
            console.log(`[Webhook] Allocated unlimited credits for VIP user`);
          } else {
            // For other tiers, add monthly credits
            const totalBefore = currentCredits?.total || 0;
            const totalAfter = totalBefore + creditsToAdd;

            const { error: creditsError } = await supabase
              .from("credits")
              .upsert({
                user_id: userId,
                total: totalAfter,
                used: currentCredits?.used || 0,
                rollover: currentCredits?.rollover || 0,
                updated_at: new Date().toISOString(),
              }, { onConflict: "user_id" });

            if (creditsError) {
              console.error(`[Webhook] Error allocating credits:`, creditsError);
            } else {
              console.log(`[Webhook] Allocated ${creditsToAdd} credits for ${tier} tier`);
            }
          }
        }
      }
      break;
    }

    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const metadata = paymentIntent.metadata;
      
      // Handle wallet top-up from payment intent (backup for one-time payments)
      if (metadata?.type === "wallet_topup" && metadata?.userId) {
        const amountCents = parseInt(metadata.amountCents || "0");
        const userId = metadata.userId;
        
        if (amountCents > 0 && userId) {
          // Get current wallet balance
          const { data: currentWallet } = await supabase
            .from("wallets")
            .select("balance_cents")
            .eq("user_id", userId)
            .single();

          const balanceBefore = currentWallet?.balance_cents || 0;
          const balanceAfter = balanceBefore + amountCents;

          // Update wallet balance
          await supabase
            .from("wallets")
            .upsert({
              user_id: userId,
              balance_cents: balanceAfter,
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });

          // Create wallet transaction record
          await supabase.from("wallet_transactions").insert({
            user_id: userId,
            type: "topup",
            amount_cents: amountCents,
            balance_before_cents: balanceBefore,
            balance_after_cents: balanceAfter,
            description: `Wallet top-up via Stripe - ${metadata.currency?.toUpperCase() || "USD"} ${(amountCents / 100).toFixed(2)}`,
            reference_id: paymentIntent.id,
          });
        }
      }

      // Handle credit purchase from payment intent
      if (metadata?.type === "credit_purchase" && metadata?.userId) {
        const credits = parseInt(metadata.credits || "0");
        const userId = metadata.userId;
        
        console.log(`[Webhook] Processing credit purchase from payment_intent: userId=${userId}, credits=${credits}`);
        
        if (credits > 0 && userId) {
          // Get current credits
          const { data: currentCredits, error: creditsError } = await supabase
            .from("credits")
            .select("total, used, rollover")
            .eq("user_id", userId)
            .single();

          if (creditsError) {
            console.error(`[Webhook] Error fetching credits from payment_intent:`, creditsError);
          }

          const totalBefore = currentCredits?.total || 0;
          const totalAfter = totalBefore + credits;

          console.log(`[Webhook] Updating credits from payment_intent: ${totalBefore} -> ${totalAfter}`);

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
            console.error(`[Webhook] Error updating credits from payment_intent:`, updateError);
          } else {
            console.log(`[Webhook] Successfully updated credits from payment_intent for user ${userId}`);
          }

          // Create wallet transaction record
          const { data: currentWallet } = await supabase
            .from("wallets")
            .select("balance_cents")
            .eq("user_id", userId)
            .single();

          const walletBalanceBefore = currentWallet?.balance_cents || 0;
          const amountCents = parseInt(metadata.amountCents || "0");
          
          const { error: transactionError } = await supabase.from("wallet_transactions").insert({
            user_id: userId,
            type: "credit_purchase",
            amount_cents: -amountCents,
            balance_before_cents: walletBalanceBefore,
            balance_after_cents: walletBalanceBefore,
            description: `Purchased ${credits} credit${credits !== 1 ? "s" : ""} - ${metadata.currency?.toUpperCase() || "USD"} ${(amountCents / 100).toFixed(2)}`,
            reference_id: paymentIntent.id,
          });

          if (transactionError) {
            console.error(`[Webhook] Error creating transaction record from payment_intent:`, transactionError);
          }
        }
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      // Handle subscription updates/deletions
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

