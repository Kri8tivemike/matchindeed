/**
 * Account Management API
 * ---------------------
 * Handles account deactivation and deletion requests.
 *
 * PATCH  - Deactivate account (sets status to 'deactivated', hides profile)
 * DELETE - Permanently delete account and all associated data
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service-role client for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Helper: Extract and verify the authenticated user from the Bearer token.
 */
async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null, error: "Missing or invalid authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, error: "Invalid or expired session" };
  }

  return { user: data.user, error: null };
}

/**
 * PATCH — Deactivate (or reactivate) the user's account.
 * Body: { action: "deactivate" | "reactivate" }
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "deactivate") {
      // Set account status to deactivated and hide profile
      const { error: accountError } = await supabaseAdmin
        .from("accounts")
        .update({
          status: "deactivated",
          profile_visible: false,
          calendar_enabled: false,
        })
        .eq("id", user.id);

      if (accountError) {
        console.error("Error deactivating account:", accountError);
        return NextResponse.json(
          { error: "Failed to deactivate account" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Account deactivated successfully. You can reactivate anytime by logging back in.",
      });
    }

    if (action === "reactivate") {
      const { error: accountError } = await supabaseAdmin
        .from("accounts")
        .update({
          status: "active",
          profile_visible: true,
          calendar_enabled: true,
        })
        .eq("id", user.id);

      if (accountError) {
        console.error("Error reactivating account:", accountError);
        return NextResponse.json(
          { error: "Failed to reactivate account" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Account reactivated successfully.",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("Account PATCH error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Permanently delete the user's account and all associated data.
 * This is irreversible. The user must confirm by sending { confirm: true }.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await req.json();
    if (!body.confirm) {
      return NextResponse.json(
        { error: "Deletion must be confirmed with { confirm: true }" },
        { status: 400 }
      );
    }

    const userId = user.id;

    // Delete associated data in order (child tables first to avoid FK violations)
    // Each deletion is best-effort; we continue even if some fail
    const deletionSteps = [
      { table: "messages", column: "sender_id", value: userId },
      { table: "messages", column: "receiver_id", value: userId },
      { table: "user_activities", column: "user_id", value: userId },
      { table: "user_activities", column: "target_user_id", value: userId },
      { table: "notifications", column: "user_id", value: userId },
      { table: "meeting_participants", column: "user_id", value: userId },
      { table: "meeting_responses", column: "user_id", value: userId },
      { table: "meeting_notifications", column: "user_id", value: userId },
      { table: "meeting_availability", column: "user_id", value: userId },
      { table: "wallet_transactions", column: "user_id", value: userId },
      { table: "user_reports", column: "reporter_id", value: userId },
      { table: "user_reports", column: "reported_user_id", value: userId },
      { table: "photo_moderation", column: "user_id", value: userId },
      { table: "user_top_picks", column: "user_id", value: userId },
      { table: "user_top_picks", column: "picked_user_id", value: userId },
      { table: "user_progress", column: "user_id", value: userId },
      { table: "admin_logs", column: "admin_id", value: userId },
    ];

    for (const step of deletionSteps) {
      try {
        await supabaseAdmin
          .from(step.table)
          .delete()
          .eq(step.column, step.value);
      } catch {
        // Continue even if individual table deletion fails (table may not exist)
      }
    }

    // Delete matches (user could be user1 or user2)
    try {
      await supabaseAdmin
        .from("user_matches")
        .delete()
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);
    } catch {
      // Continue
    }

    // Delete core profile data
    try {
      await supabaseAdmin.from("credits").delete().eq("user_id", userId);
    } catch { /* continue */ }
    try {
      await supabaseAdmin.from("wallets").delete().eq("user_id", userId);
    } catch { /* continue */ }
    try {
      await supabaseAdmin.from("memberships").delete().eq("user_id", userId);
    } catch { /* continue */ }
    try {
      await supabaseAdmin.from("user_preferences").delete().eq("user_id", userId);
    } catch { /* continue */ }
    try {
      await supabaseAdmin.from("user_profiles").delete().eq("user_id", userId);
    } catch { /* continue */ }
    try {
      await supabaseAdmin.from("accounts").delete().eq("id", userId);
    } catch { /* continue */ }

    // Finally, delete the auth user
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error("Error deleting auth user:", authDeleteError);
      return NextResponse.json(
        { error: "Account data deleted but auth removal failed. Contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Account and all associated data have been permanently deleted.",
    });
  } catch (err) {
    console.error("Account DELETE error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
