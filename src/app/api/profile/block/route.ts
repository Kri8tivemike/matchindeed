/**
 * Block User API
 *
 * GET    — Fetch the current user's blocked users list
 * POST   — Block a user (with optional reason)
 * DELETE — Unblock a user
 *
 * Blocking is bidirectional in effect: once A blocks B,
 * neither A sees B nor B sees A in discover/search/likes/matches/messages.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------
// Auth helper — extract the current user from Bearer token
// ---------------------------------------------------------------
async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null, error: "Missing or invalid authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return { user: null, error: "Invalid or expired token" };
  }
  return { user, error: null };
}

// ---------------------------------------------------------------
// GET — Fetch blocked users list with profile details
// ---------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    // Fetch blocked user entries
    const { data: blocks, error: blocksError } = await supabaseAdmin
      .from("blocked_users")
      .select("id, blocked_id, reason, created_at")
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false });

    if (blocksError) {
      console.error("Error fetching blocked users:", blocksError);
      return NextResponse.json(
        { error: "Failed to fetch blocked users" },
        { status: 500 }
      );
    }

    if (!blocks || blocks.length === 0) {
      return NextResponse.json({ blocked_users: [] });
    }

    // Fetch profile info for each blocked user
    const blockedIds = blocks.map((b) => b.blocked_id);

    const { data: profiles } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, first_name, last_name, profile_photo_url, photos")
      .in("user_id", blockedIds);

    const profileMap = new Map(
      (profiles || []).map((p) => [p.user_id, p])
    );

    const blockedUsers = blocks.map((b) => {
      const profile = profileMap.get(b.blocked_id);
      const photo =
        profile?.profile_photo_url ||
        (profile?.photos && profile.photos.length > 0
          ? profile.photos[0]
          : null);

      return {
        id: b.id,
        blocked_id: b.blocked_id,
        name: profile
          ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
            "Unknown User"
          : "Unknown User",
        photo,
        reason: b.reason,
        created_at: b.created_at,
      };
    });

    return NextResponse.json({ blocked_users: blockedUsers });
  } catch (err) {
    console.error("GET /api/profile/block error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------
// POST — Block a user
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await req.json();
    const { blocked_id, reason } = body;

    if (!blocked_id) {
      return NextResponse.json(
        { error: "blocked_id is required" },
        { status: 400 }
      );
    }

    // Prevent self-block
    if (blocked_id === user.id) {
      return NextResponse.json(
        { error: "You cannot block yourself" },
        { status: 400 }
      );
    }

    // Check if already blocked
    const { data: existing } = await supabaseAdmin
      .from("blocked_users")
      .select("id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", blocked_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "User is already blocked" },
        { status: 409 }
      );
    }

    // Insert the block record
    const { error: insertError } = await supabaseAdmin
      .from("blocked_users")
      .insert({
        blocker_id: user.id,
        blocked_id,
        reason: reason || null,
      });

    if (insertError) {
      console.error("Error blocking user:", insertError);
      return NextResponse.json(
        { error: "Failed to block user" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "User has been blocked. They will no longer appear in your feed.",
    });
  } catch (err) {
    console.error("POST /api/profile/block error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------
// DELETE — Unblock a user
// ---------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const blockedId = searchParams.get("blocked_id");

    if (!blockedId) {
      return NextResponse.json(
        { error: "blocked_id query parameter is required" },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("blocked_users")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", blockedId);

    if (deleteError) {
      console.error("Error unblocking user:", deleteError);
      return NextResponse.json(
        { error: "Failed to unblock user" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "User has been unblocked.",
    });
  } catch (err) {
    console.error("DELETE /api/profile/block error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
