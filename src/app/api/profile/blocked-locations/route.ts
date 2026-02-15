import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Blocked Locations API
 *
 * Manages the list of locations/countries a user has blocked.
 * Users from blocked locations won't appear in discover/search
 * and cannot contact the user.
 *
 * Stored as a JSONB array in user_preferences.blocked_locations.
 * Gracefully handles missing column (returns empty list if migration hasn't run).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** Authenticate the request */
async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  return error || !user ? null : user;
}

/**
 * GET /api/profile/blocked-locations
 *
 * Fetch the user's blocked locations list.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try to fetch blocked_locations
    const { data, error } = await supabase
      .from("user_preferences")
      .select("blocked_locations")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      // Column might not exist yet
      if (error.code === "42703") {
        return NextResponse.json({
          blocked_locations: [],
          migration_pending: true,
        });
      }
      console.error("Error fetching blocked locations:", error);
      return NextResponse.json(
        { error: "Failed to fetch blocked locations" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      blocked_locations: data?.blocked_locations || [],
      migration_pending: false,
    });
  } catch (error) {
    console.error("Error in GET /api/profile/blocked-locations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/profile/blocked-locations
 *
 * Replace the entire blocked locations list.
 *
 * Body:
 *   blocked_locations: string[]  — array of location strings to block
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { blocked_locations } = body;

    if (!Array.isArray(blocked_locations)) {
      return NextResponse.json(
        { error: "blocked_locations must be an array of strings" },
        { status: 400 }
      );
    }

    // Validate — max 50 blocked locations
    if (blocked_locations.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 blocked locations allowed" },
        { status: 400 }
      );
    }

    // Clean and deduplicate
    const cleanedLocations = [...new Set(
      blocked_locations
        .filter((loc: any) => typeof loc === "string" && loc.trim().length > 0)
        .map((loc: string) => loc.trim())
    )];

    // Upsert into user_preferences
    const { data, error } = await supabase
      .from("user_preferences")
      .upsert(
        {
          user_id: user.id,
          blocked_locations: cleanedLocations,
        },
        { onConflict: "user_id" }
      )
      .select("blocked_locations")
      .single();

    if (error) {
      if (error.code === "42703") {
        return NextResponse.json({
          success: true,
          blocked_locations: cleanedLocations,
          migration_pending: true,
          message: "Saved locally. Database migration pending.",
        });
      }
      console.error("Error saving blocked locations:", error);
      return NextResponse.json(
        { error: "Failed to save blocked locations" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      blocked_locations: data.blocked_locations || cleanedLocations,
    });
  } catch (error) {
    console.error("Error in PUT /api/profile/blocked-locations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/profile/blocked-locations
 *
 * Add or remove a single location.
 *
 * Body:
 *   action: "add" | "remove"
 *   location: string
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, location } = body;

    if (!action || !location) {
      return NextResponse.json(
        { error: "action and location are required" },
        { status: 400 }
      );
    }

    if (!["add", "remove"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'add' or 'remove'" },
        { status: 400 }
      );
    }

    const cleanLocation = location.trim();
    if (!cleanLocation) {
      return NextResponse.json(
        { error: "Location cannot be empty" },
        { status: 400 }
      );
    }

    // Get current list
    const { data: current } = await supabase
      .from("user_preferences")
      .select("blocked_locations")
      .eq("user_id", user.id)
      .maybeSingle();

    let currentList: string[] = current?.blocked_locations || [];

    if (action === "add") {
      // Check max limit
      if (currentList.length >= 50) {
        return NextResponse.json(
          { error: "Maximum 50 blocked locations reached" },
          { status: 400 }
        );
      }

      // Add if not already present (case-insensitive check)
      const alreadyBlocked = currentList.some(
        (loc) => loc.toLowerCase() === cleanLocation.toLowerCase()
      );
      if (!alreadyBlocked) {
        currentList.push(cleanLocation);
      }
    } else {
      // Remove (case-insensitive)
      currentList = currentList.filter(
        (loc) => loc.toLowerCase() !== cleanLocation.toLowerCase()
      );
    }

    // Save
    const { data, error } = await supabase
      .from("user_preferences")
      .upsert(
        {
          user_id: user.id,
          blocked_locations: currentList,
        },
        { onConflict: "user_id" }
      )
      .select("blocked_locations")
      .single();

    if (error) {
      if (error.code === "42703") {
        return NextResponse.json({
          success: true,
          blocked_locations: currentList,
          migration_pending: true,
        });
      }
      console.error("Error updating blocked locations:", error);
      return NextResponse.json(
        { error: "Failed to update blocked locations" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      blocked_locations: data.blocked_locations || currentList,
    });
  } catch (error) {
    console.error("Error in PATCH /api/profile/blocked-locations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
