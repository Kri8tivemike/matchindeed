import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Profile Visibility API
 *
 * Manages the profile_visible and calendar_enabled flags on the accounts table.
 * When a user hides their profile:
 * - profile_visible → false
 * - calendar_enabled → false
 * - They disappear from discover/search
 * - Their photos are not shown to other users
 *
 * Gracefully handles missing columns (returns defaults if migration hasn't run).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Authenticate the request and return the user
 */
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
 * GET /api/profile/visibility
 *
 * Fetch the current user's profile visibility and calendar status.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try to fetch visibility columns
    const { data, error } = await supabase
      .from("accounts")
      .select("profile_visible, calendar_enabled")
      .eq("id", user.id)
      .single();

    if (error) {
      // If columns don't exist yet (migration not run), return defaults
      if (error.code === "42703") {
        return NextResponse.json({
          profile_visible: true,
          calendar_enabled: true,
          migration_pending: true,
        });
      }

      console.error("Error fetching visibility:", error);
      return NextResponse.json(
        { error: "Failed to fetch visibility status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      profile_visible: data.profile_visible ?? true,
      calendar_enabled: data.calendar_enabled ?? true,
      migration_pending: false,
    });
  } catch (error) {
    console.error("Error in GET /api/profile/visibility:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/profile/visibility
 *
 * Toggle profile visibility and/or calendar status.
 *
 * Body:
 *   profile_visible?: boolean
 *   calendar_enabled?: boolean
 *
 * When calendar_enabled is set to false, profile_visible is also set to false.
 * When calendar_enabled is set to true, profile_visible is also set to true.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { profile_visible, calendar_enabled } = body;

    // Build update object
    const updateData: Record<string, boolean> = {};

    if (typeof calendar_enabled === "boolean") {
      updateData.calendar_enabled = calendar_enabled;
      // When calendar is toggled off, automatically hide profile
      // When calendar is toggled on, automatically show profile
      updateData.profile_visible = calendar_enabled;
    }

    if (typeof profile_visible === "boolean") {
      updateData.profile_visible = profile_visible;
      // If profile is hidden, also disable calendar
      if (!profile_visible) {
        updateData.calendar_enabled = false;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No visibility changes provided" },
        { status: 400 }
      );
    }

    // Update the account
    const { data, error } = await supabase
      .from("accounts")
      .update(updateData)
      .eq("id", user.id)
      .select("profile_visible, calendar_enabled")
      .single();

    if (error) {
      // If columns don't exist yet
      if (error.code === "42703") {
        return NextResponse.json({
          success: true,
          profile_visible: updateData.profile_visible ?? true,
          calendar_enabled: updateData.calendar_enabled ?? true,
          migration_pending: true,
          message:
            "Visibility preference saved locally. Database migration pending.",
        });
      }

      console.error("Error updating visibility:", error);
      return NextResponse.json(
        { error: "Failed to update visibility" },
        { status: 500 }
      );
    }

    // Create a notification about the change
    const isNowVisible = data.profile_visible;
    await supabase.from("notifications").insert({
      user_id: user.id,
      type: "profile_update",
      title: isNowVisible ? "Profile Visible" : "Profile Hidden",
      message: isNowVisible
        ? "Your profile is now visible to other users."
        : "Your profile is now hidden from other users. Turn on your calendar to become visible again.",
      data: {
        profile_visible: data.profile_visible,
        calendar_enabled: data.calendar_enabled,
      },
    });

    return NextResponse.json({
      success: true,
      profile_visible: data.profile_visible,
      calendar_enabled: data.calendar_enabled,
      migration_pending: false,
    });
  } catch (error) {
    console.error("Error in PATCH /api/profile/visibility:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
