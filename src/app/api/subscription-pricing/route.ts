import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuthenticatedAdmin } from "@/lib/auth-helpers";

/**
 * GET /api/subscription-pricing
 * Returns current subscription pricing (admin-configured or default)
 * 
 * This endpoint allows administrators to configure pricing that overrides
 * the base pricing in the subscription page.
 */
export async function GET(request: NextRequest) {
  try {
    // Check if admin pricing exists in database
    // You would need to create a 'subscription_pricing' table with columns:
    // - tier_id (string)
    // - price_ngn (number)
    // - price_usd (number)
    // - price_gbp (number)
    // - updated_at (timestamp)
    // - updated_by (uuid, references admin users)
    
    const { data: adminPricing, error } = await supabase
      .from("subscription_pricing")
      .select("*")
      .order("tier_id");

    if (error && error.code !== "PGRST116") {
      // PGRST116 = table doesn't exist, which is fine for now
      console.error("Error fetching admin pricing:", error);
    }

    // If admin pricing exists, return it
    if (adminPricing && adminPricing.length > 0) {
      const tiers = adminPricing.map((p: any) => ({
        id: p.tier_id,
        pricing: {
          ngn: p.price_ngn,
          usd: p.price_usd,
          gbp: p.price_gbp,
        },
      }));

      return NextResponse.json({ tiers });
    }

    // Return default pricing if no admin pricing exists
    return NextResponse.json({
      tiers: [
        {
          id: "basic",
          pricing: { ngn: 10000, usd: 7, gbp: 5.5 },
        },
        {
          id: "standard",
          pricing: { ngn: 31500, usd: 20, gbp: 16 },
        },
        {
          id: "premium",
          pricing: { ngn: 63000, usd: 43, gbp: 34 },
        },
        {
          id: "vip",
          pricing: { ngn: 1500000, usd: 1000, gbp: 800 },
        },
      ],
    });
  } catch (error: any) {
    console.error("Error in subscription-pricing API:", error);
    return NextResponse.json(
      { error: "Failed to fetch pricing" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/subscription-pricing
 * Allows administrators to update subscription pricing
 * 
 * Requires admin authentication
 * Body: { tier_id: string, price_ngn: number, price_usd: number, price_gbp: number }
 */
export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    const { user, isAdmin: userIsAdmin } = await getAuthenticatedAdmin();
    
    if (!user || !userIsAdmin) {
      return NextResponse.json(
        { error: "Unauthorized. Admin access required." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { tier_id, price_ngn, price_usd, price_gbp } = body;

    if (!tier_id || price_ngn === undefined || price_usd === undefined || price_gbp === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: tier_id, price_ngn, price_usd, price_gbp" },
        { status: 400 }
      );
    }

    // Validate tier_id
    if (!["basic", "standard", "premium", "vip"].includes(tier_id)) {
      return NextResponse.json(
        { error: "Invalid tier_id. Must be: basic, standard, premium, or vip" },
        { status: 400 }
      );
    }

    // Validate prices are positive numbers
    if (price_ngn < 0 || price_usd < 0 || price_gbp < 0) {
      return NextResponse.json(
        { error: "Prices must be positive numbers" },
        { status: 400 }
      );
    }

    // Upsert pricing (create or update)
    const { data, error } = await supabase
      .from("subscription_pricing")
      .upsert(
        {
          tier_id,
          price_ngn,
          price_usd,
          price_gbp,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: "tier_id" }
      )
      .select()
      .single();

    if (error) {
      // If table doesn't exist, provide instructions
      if (error.code === "PGRST116") {
        return NextResponse.json(
          {
            error: "Subscription pricing table does not exist. Please create the table first.",
            instructions: `
              Create a table 'subscription_pricing' with columns:
              - tier_id (text, primary key)
              - price_ngn (numeric)
              - price_usd (numeric)
              - price_gbp (numeric)
              - updated_at (timestamp)
              - updated_by (uuid, optional)
            `,
          },
          { status: 500 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      pricing: data,
      message: `Pricing for ${tier_id} tier updated successfully`,
    });
  } catch (error: any) {
    console.error("Error updating subscription pricing:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update pricing" },
      { status: 500 }
    );
  }
}
