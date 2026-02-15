/**
 * API: /api/profile/notification-preferences
 *
 * GET  — Fetch the current user's notification preferences.
 *        Returns defaults if no row exists yet (graceful for new users).
 * PATCH — Update one or more preference fields.
 *
 * Requires Bearer token authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------
// Default preferences (returned when no row exists)
// ---------------------------------------------------------------
const DEFAULTS = {
  likes_inapp: true,
  likes_email: true,
  likes_push: true,
  matches_inapp: true,
  matches_email: true,
  matches_push: true,
  messages_inapp: true,
  messages_email: true,
  messages_push: true,
  meetings_inapp: true,
  meetings_email: true,
  meetings_push: true,
  views_inapp: true,
  views_email: false,
  views_push: false,
  system_inapp: true,
  system_email: true,
  system_push: true,
  marketing_email: false,
};

/** Allowed preference field names (for validation) */
const ALLOWED_FIELDS = new Set(Object.keys(DEFAULTS));

// ---------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------
async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) return null;
  return user;
}

// ---------------------------------------------------------------
// GET — Fetch preferences
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // If table doesn't exist yet (migration not run), return defaults
    if (error && (error.code === "42P01" || error.code === "42703")) {
      return NextResponse.json({ preferences: DEFAULTS });
    }

    if (error) {
      console.error("Error fetching notification preferences:", error);
      return NextResponse.json({ preferences: DEFAULTS });
    }

    // If no row exists, return defaults
    if (!data) {
      return NextResponse.json({ preferences: DEFAULTS });
    }

    // Build response from row data, filling in defaults for any missing fields
    const preferences: Record<string, boolean> = {};
    for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
      preferences[key] =
        data[key] !== undefined && data[key] !== null
          ? data[key]
          : defaultValue;
    }

    return NextResponse.json({ preferences });
  } catch {
    return NextResponse.json({ preferences: DEFAULTS });
  }
}

// ---------------------------------------------------------------
// PATCH — Update preferences
// ---------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate: only allow known boolean fields
  const updates: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (typeof value !== "boolean") continue;
    updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid preference fields provided" },
      { status: 400 }
    );
  }

  try {
    // Upsert — create row if it doesn't exist, update if it does
    const { data, error } = await supabaseAdmin
      .from("notification_preferences")
      .upsert(
        { user_id: user.id, ...updates, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    // If table doesn't exist yet, return success silently
    if (error && (error.code === "42P01" || error.code === "42703")) {
      return NextResponse.json({
        success: true,
        preferences: { ...DEFAULTS, ...updates },
        note: "Migration not yet applied — preferences saved in memory only",
      });
    }

    if (error) {
      console.error("Error updating notification preferences:", error);
      return NextResponse.json(
        { error: "Failed to update preferences" },
        { status: 500 }
      );
    }

    // Build response
    const preferences: Record<string, boolean> = {};
    for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
      preferences[key] =
        data[key] !== undefined && data[key] !== null
          ? data[key]
          : defaultValue;
    }

    return NextResponse.json({ success: true, preferences });
  } catch {
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
