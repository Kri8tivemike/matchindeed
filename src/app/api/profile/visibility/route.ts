import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CREDIT_LOCKED_PROFILE_STATUS } from "@/lib/profile/credit-lock";
import { getStarterTrialState } from "@/lib/starter-trial";

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

function getAvailableCredits(
  credits:
    | {
        total?: number | null;
        used?: number | null;
        rollover?: number | null;
      }
    | null
) {
  const total = credits?.total || 0;
  const used = credits?.used || 0;
  const rollover = credits?.rollover || 0;
  return Math.max(0, total - used + rollover);
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
      .select("profile_visible, calendar_enabled, profile_status")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      // If columns don't exist yet (migration not run), return defaults
      if (error.code === "42703") {
        return NextResponse.json({
          profile_visible: true,
          calendar_enabled: true,
          profile_status: "online",
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
      profile_visible: data?.profile_visible ?? true,
      calendar_enabled: data?.calendar_enabled ?? true,
      profile_status: data?.profile_status ?? "online",
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
    const { profile_visible, calendar_enabled, lock_reason } = body;

    // Build update object
    const updateData: Record<string, boolean | string> = {};

    if (typeof calendar_enabled === "boolean") {
      updateData.calendar_enabled = calendar_enabled;
      // When calendar is toggled off, automatically hide profile
      // When calendar is toggled on, automatically show profile
      updateData.profile_visible = calendar_enabled;
      updateData.profile_status =
        calendar_enabled
          ? "online"
          : lock_reason === "credits_exhausted"
            ? CREDIT_LOCKED_PROFILE_STATUS
            : "hidden";
    }

    if (typeof profile_visible === "boolean") {
      updateData.profile_visible = profile_visible;
      // If profile is hidden, also disable calendar
      if (!profile_visible) {
        updateData.calendar_enabled = false;
        updateData.profile_status = "hidden";
      } else if (updateData.profile_status !== "offline_matched") {
        updateData.profile_status = "online";
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No visibility changes provided" },
        { status: 400 }
      );
    }

    // Enforce calendar lock when credits are exhausted (except VIP users).
    if (updateData.calendar_enabled === true) {
      const starterTrialState = await getStarterTrialState(supabase, user.id, {
        verifyActiveSlot: true,
      });

      if (starterTrialState.upgrade_required) {
        return NextResponse.json(
          {
            error:
              "Your free starter slot has already been used. Subscribe to create more availability and accept new bookings.",
            code: "starter_trial_exhausted",
          },
          { status: 403 }
        );
      }

      if (starterTrialState.eligible && !starterTrialState.consumed) {
        // Starter-trial users can stay visible for their one free slot even with zero credits.
      } else {
      const { data: accountTier, error: tierError } = await supabase
        .from("accounts")
        .select("tier")
        .eq("id", user.id)
        .maybeSingle();

      if (tierError && tierError.code !== "PGRST116") {
        console.error("Error fetching account tier:", tierError);
        return NextResponse.json(
          { error: "Failed to verify account tier" },
          { status: 500 }
        );
      }

      const tier = (accountTier?.tier || "basic").toLowerCase();
      if (tier !== "vip") {
        const { data: credits, error: creditsError } = await supabase
          .from("credits")
          .select("total, used, rollover")
          .eq("user_id", user.id)
          .maybeSingle();

        if (creditsError && creditsError.code !== "PGRST116") {
          console.error("Error fetching credits:", creditsError);
          return NextResponse.json(
            { error: "Failed to verify credits" },
            { status: 500 }
          );
        }

        if (getAvailableCredits(credits || null) <= 0) {
          return NextResponse.json(
            {
              error: "Calendar is locked because you have no available credits.",
              code: "credits_exhausted",
            },
            { status: 403 }
          );
        }
      }
      }
    }

    // Update the account
    let { data, error } = await supabase
      .from("accounts")
      .update(updateData)
      .eq("id", user.id)
      .select("profile_visible, calendar_enabled, profile_status")
      .maybeSingle();

    if (!error && !data) {
      const repairResult = await supabase
        .from("accounts")
        .upsert(
          {
            id: user.id,
            email: user.email || null,
            display_name: user.email?.split("@")[0] || "User",
            role: "user",
            ...updateData,
          },
          { onConflict: "id" }
        )
        .select("profile_visible, calendar_enabled, profile_status")
        .single();

      data = repairResult.data;
      error = repairResult.error;
    }

    if (error) {
      // If columns don't exist yet
      if (error.code === "42703") {
        return NextResponse.json({
          success: true,
          profile_visible: updateData.profile_visible ?? true,
          calendar_enabled: updateData.calendar_enabled ?? true,
          profile_status:
            (updateData.profile_status as string | undefined) || "online",
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

    if (!data) {
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
        profile_status: data.profile_status || "online",
      },
    });

    return NextResponse.json({
      success: true,
      profile_visible: data.profile_visible,
      calendar_enabled: data.calendar_enabled,
      profile_status: data.profile_status || "online",
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
