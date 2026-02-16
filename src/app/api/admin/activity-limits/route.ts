import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Admin Activity Limits API
 *
 * Manages rate limits for user activities (wink, like, interested) per tier.
 * Each tier (basic, standard, premium, vip) has configurable daily/weekly/monthly
 * limits that are enforced in the main activities API.
 *
 * Table: user_activity_limits
 * Columns: tier, winks_per_day, winks_per_week, winks_per_month,
 *          likes_per_day, likes_per_week, likes_per_month,
 *          interesteds_per_day, interesteds_per_week, interesteds_per_month,
 *          created_at, updated_at
 *
 * GET  /api/admin/activity-limits — Fetch all tier limits
 * PUT  /api/admin/activity-limits — Update limits for a specific tier
 * POST /api/admin/activity-limits — Create limits for a new tier (if missing)
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Valid tiers
const VALID_TIERS = ["basic", "standard", "premium", "vip"];

// Valid limit fields
const LIMIT_FIELDS = [
  "winks_per_day",
  "winks_per_week",
  "winks_per_month",
  "likes_per_day",
  "likes_per_week",
  "likes_per_month",
  "interesteds_per_day",
  "interesteds_per_week",
  "interesteds_per_month",
];

/**
 * Verify the requesting user is an admin
 */
async function verifyAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return false;

  // Check admin role
  const { data: account } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();

  return ["admin", "superadmin"].includes(account?.role || "");
}

/**
 * GET /api/admin/activity-limits
 * Fetch all activity limits grouped by tier
 */
export async function GET(request: NextRequest) {
  try {
    const isAdmin = await verifyAdmin(request);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: limits, error } = await supabase
      .from("user_activity_limits")
      .select("*")
      .order("tier", { ascending: true });

    if (error) {
      console.error("Error fetching limits:", error);

      // Table might not exist — return defaults
      if (error.code === "42P01") {
        return NextResponse.json({ limits: getDefaultLimits() });
      }

      return NextResponse.json(
        { error: "Failed to fetch limits" },
        { status: 500 }
      );
    }

    // Ensure all tiers are represented
    const existingTiers = new Set((limits || []).map((l: any) => l.tier));
    const allLimits = [...(limits || [])];

    for (const tier of VALID_TIERS) {
      if (!existingTiers.has(tier)) {
        allLimits.push(getDefaultForTier(tier));
      }
    }

    // Sort by tier order
    allLimits.sort(
      (a: any, b: any) =>
        VALID_TIERS.indexOf(a.tier) - VALID_TIERS.indexOf(b.tier)
    );

    return NextResponse.json({ limits: allLimits });
  } catch (error) {
    console.error("Error in GET /api/admin/activity-limits:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/activity-limits
 * Update limits for a specific tier
 */
export async function PUT(request: NextRequest) {
  try {
    const isAdmin = await verifyAdmin(request);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { tier, ...limitValues } = body;

    // Validate tier
    if (!tier || !VALID_TIERS.includes(tier)) {
      return NextResponse.json(
        { error: `Invalid tier. Must be one of: ${VALID_TIERS.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate and sanitize limit values
    const updateData: Record<string, any> = { tier };

    for (const field of LIMIT_FIELDS) {
      if (field in limitValues) {
        const val = Number(limitValues[field]);
        if (isNaN(val) || val < 0) {
          return NextResponse.json(
            { error: `Invalid value for ${field}. Must be a non-negative number.` },
            { status: 400 }
          );
        }
        // 0 means unlimited
        updateData[field] = val;
      }
    }

    // Check if tier row exists
    const { data: existing } = await supabase
      .from("user_activity_limits")
      .select("tier")
      .eq("tier", tier)
      .maybeSingle();

    let result;

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("user_activity_limits")
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq("tier", tier)
        .select()
        .single();

      if (error) {
        console.error("Error updating limits:", error);
        return NextResponse.json(
          { error: "Failed to update limits" },
          { status: 500 }
        );
      }
      result = data;
    } else {
      // Insert new row with defaults + overrides
      const defaults = getDefaultForTier(tier);
      const insertData = { ...defaults, ...updateData };

      const { data, error } = await supabase
        .from("user_activity_limits")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error("Error creating limits:", error);
        return NextResponse.json(
          { error: "Failed to create limits" },
          { status: 500 }
        );
      }
      result = data;
    }

    return NextResponse.json({ success: true, limits: result });
  } catch (error) {
    console.error("Error in PUT /api/admin/activity-limits:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/activity-limits/reset
 * Reset all tiers to default limits
 */
export async function POST(request: NextRequest) {
  try {
    const isAdmin = await verifyAdmin(request);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // If resetting all tiers to defaults
    if (body.action === "reset_all") {
      const results = [];

      for (const tier of VALID_TIERS) {
        const defaults = getDefaultForTier(tier);

        const { data: existing } = await supabase
          .from("user_activity_limits")
          .select("tier")
          .eq("tier", tier)
          .maybeSingle();

        if (existing) {
          const { data, error } = await supabase
            .from("user_activity_limits")
            .update({ ...defaults, updated_at: new Date().toISOString() })
            .eq("tier", tier)
            .select()
            .single();

          if (!error) results.push(data);
        } else {
          const { data, error } = await supabase
            .from("user_activity_limits")
            .insert(defaults)
            .select()
            .single();

          if (!error) results.push(data);
        }
      }

      return NextResponse.json({
        success: true,
        message: "All tiers reset to defaults",
        limits: results,
      });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in POST /api/admin/activity-limits:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------
// Default Limit Values per Tier
// ---------------------------------------------------------------

/**
 * Get default limits for a specific tier
 * Values: 0 = unlimited
 */
function getDefaultForTier(tier: string) {
  const defaults: Record<string, any> = {
    basic: {
      tier: "basic",
      winks_per_day: 5,
      winks_per_week: 25,
      winks_per_month: 80,
      likes_per_day: 5,
      likes_per_week: 25,
      likes_per_month: 80,
      interesteds_per_day: 3,
      interesteds_per_week: 15,
      interesteds_per_month: 50,
    },
    standard: {
      tier: "standard",
      winks_per_day: 15,
      winks_per_week: 75,
      winks_per_month: 250,
      likes_per_day: 15,
      likes_per_week: 75,
      likes_per_month: 250,
      interesteds_per_day: 10,
      interesteds_per_week: 50,
      interesteds_per_month: 170,
    },
    premium: {
      tier: "premium",
      winks_per_day: 30,
      winks_per_week: 150,
      winks_per_month: 500,
      likes_per_day: 30,
      likes_per_week: 150,
      likes_per_month: 500,
      interesteds_per_day: 20,
      interesteds_per_week: 100,
      interesteds_per_month: 350,
    },
    vip: {
      tier: "vip",
      winks_per_day: 0,
      winks_per_week: 0,
      winks_per_month: 0,
      likes_per_day: 0,
      likes_per_week: 0,
      likes_per_month: 0,
      interesteds_per_day: 0,
      interesteds_per_week: 0,
      interesteds_per_month: 0,
    },
  };

  return (
    defaults[tier] || {
      tier,
      winks_per_day: 5,
      winks_per_week: 25,
      winks_per_month: 80,
      likes_per_day: 5,
      likes_per_week: 25,
      likes_per_month: 80,
      interesteds_per_day: 3,
      interesteds_per_week: 15,
      interesteds_per_month: 50,
    }
  );
}

/**
 * Get default limits for all tiers
 */
function getDefaultLimits() {
  return VALID_TIERS.map((tier) => getDefaultForTier(tier));
}
