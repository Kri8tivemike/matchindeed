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
  views_email: true,
  views_push: true,
  system_inapp: true,
  system_email: true,
  system_push: true,
  marketing_email: true,
};

/** Allowed preference field names (for validation) */
const ALLOWED_FIELDS = new Set(Object.keys(DEFAULTS));

type PreferenceMap = Record<string, boolean>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toPreferences(source: unknown): PreferenceMap {
  const preferences: PreferenceMap = { ...DEFAULTS };
  if (!isObject(source)) return preferences;

  for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
    const value = source[key];
    preferences[key] = typeof value === "boolean" ? value : defaultValue;
  }

  return preferences;
}

function isMissingModernTableError(error: unknown): boolean {
  if (!isObject(error)) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code.startsWith("PGRST20") ||
    message.includes("notification_preferences")
  );
}

async function readLegacyPreferences(userId: string): Promise<PreferenceMap> {
  const { data, error } = await supabaseAdmin
    .from("notification_prefs")
    .select("prefs")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching legacy notification preferences:", error);
    return { ...DEFAULTS };
  }

  return toPreferences(data?.prefs);
}

async function writeLegacyPreferences(
  userId: string,
  updates: PreferenceMap
): Promise<{ preferences: PreferenceMap; error: unknown }> {
  const existing = await readLegacyPreferences(userId);
  const nextPrefs = toPreferences({ ...existing, ...updates });

  const { data, error } = await supabaseAdmin
    .from("notification_prefs")
    .upsert(
      {
        user_id: userId,
        prefs: nextPrefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("prefs")
    .single();

  if (error) {
    return { preferences: nextPrefs, error };
  }

  return { preferences: toPreferences(data?.prefs), error: null };
}

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

    if (!error && data) {
      return NextResponse.json({ preferences: toPreferences(data) });
    }

    if (error && !isMissingModernTableError(error)) {
      console.error("Error fetching notification preferences:", error);
    }

    const legacyPreferences = await readLegacyPreferences(user.id);
    return NextResponse.json({ preferences: legacyPreferences });
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

    if (!error) {
      return NextResponse.json({
        success: true,
        preferences: toPreferences(data),
      });
    }

    // Legacy fallback: environments that still use notification_prefs JSONB
    if (isMissingModernTableError(error)) {
      const legacyWrite = await writeLegacyPreferences(user.id, updates);
      if (legacyWrite.error) {
        console.error(
          "Error updating notification preferences (legacy):",
          legacyWrite.error
        );
        return NextResponse.json(
          { error: "Failed to update preferences" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        preferences: legacyWrite.preferences,
      });
    }

    console.error("Error updating notification preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
