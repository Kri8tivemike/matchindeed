import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
  typescript: true,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Verify a Stripe subscription session and process subscription if webhook hasn't fired yet
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

    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Check if payment was successful and it's a subscription
    if (session.payment_status === "paid" && session.mode === "subscription") {
      const tier = session.metadata?.tier;
      const userId = session.metadata?.userId || user.id;

      if (!tier) {
        return NextResponse.json({ error: "Tier not found in session metadata" }, { status: 400 });
      }

      // Check if subscription was already processed
      const { data: existingMembership } = await supabase
        .from("memberships")
        .select("id, status")
        .eq("user_id", userId)
        .eq("tier", tier)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // If membership exists and is active, webhook already processed it
      if (existingMembership && existingMembership.status === "active") {
        return NextResponse.json({
          success: true,
          message: "Subscription already processed",
          alreadyProcessed: true,
        });
      }

      // Process subscription manually
      const startsAt = new Date();
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      const amountTotal = session.amount_total || 0;

      // Update account tier
      await supabase.from("accounts").update({ tier }).eq("id", userId);

      // Create/update membership
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
        await supabase.from("memberships").update(membershipData).eq("id", existingMembership.id);
      } else {
        await supabase.from("memberships").insert(membershipData);
      }

      // Allocate credits
      const creditAllocation: Record<string, number> = {
        basic: 5,
        standard: 15,
        premium: 30,
        vip: 999999, // Unlimited
      };

      const creditsToAdd = creditAllocation[tier.toLowerCase()] || 0;

      if (creditsToAdd > 0) {
        const { data: currentCredits } = await supabase
          .from("credits")
          .select("total, used, rollover")
          .eq("user_id", userId)
          .single();

        const totalBefore = currentCredits?.total || 0;
        const totalAfter = tier.toLowerCase() === "vip" ? 999999 : totalBefore + creditsToAdd;

        await supabase
          .from("credits")
          .upsert({
            user_id: userId,
            total: totalAfter,
            used: currentCredits?.used || 0,
            rollover: currentCredits?.rollover || 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
      }

      return NextResponse.json({
        success: true,
        message: "Subscription processed successfully",
        tier,
        creditsAdded: creditsToAdd,
      });
    }

    return NextResponse.json({
      success: false,
      message: "Payment not completed or not a subscription",
      payment_status: session.payment_status,
      mode: session.mode,
    });
  } catch (error: any) {
    console.error("Error verifying subscription:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify subscription" },
      { status: 500 }
    );
  }
}
