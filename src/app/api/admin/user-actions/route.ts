import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Admin User Actions API
 *
 * Centralized API for admin actions on users:
 * - suspend: Suspend user account
 * - unsuspend / active: Reactivate suspended user
 * - ban: Permanently ban user
 * - update_tier: Change user tier
 * - update_role: Change user role (admin only)
 * - adjust_credits: Add/remove credits
 *
 * POST /api/admin/user-actions
 * Body: { action, user_id, ...params }
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** Extract client IP from request headers */
function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    null
  );
}

/** Verify admin and return admin user id */
async function verifyAdmin(request: NextRequest): Promise<{ adminId: string; ip: string | null } | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: account } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!["admin", "superadmin", "moderator"].includes(account?.role || "")) {
    return null;
  }
  return { adminId: user.id, ip: getClientIp(request) };
}

/** Log admin action with IP (stored in meta until ip_address column exists) */
async function logAction(
  adminId: string,
  targetUserId: string,
  action: string,
  meta: Record<string, unknown>,
  ip: string | null
) {
  const logPayload: Record<string, unknown> = {
    admin_id: adminId,
    target_user_id: targetUserId,
    action,
    meta: { ...meta, ip_address: ip },
  };
  await supabase.from("admin_logs").insert(logPayload);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdmin(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { adminId, ip } = auth;

    const body = await request.json();
    const { action, user_id: targetUserId, reason, ...params } = body;

    if (!action || !targetUserId) {
      return NextResponse.json(
        { error: "action and user_id are required" },
        { status: 400 }
      );
    }

    // Superadmin-only actions
    const superadminOnly = ["update_role", "create_subadmin"];
    const { data: adminAccount } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", adminId)
      .single();

    if (
      superadminOnly.includes(action) &&
      adminAccount?.role !== "superadmin"
    ) {
      return NextResponse.json(
        { error: "Superadmin role required" },
        { status: 403 }
      );
    }

    switch (action) {
      case "suspend": {
        const until = new Date();
        until.setDate(until.getDate() + (params.days || 7));
        const { error } = await supabase
          .from("accounts")
          .update({
            account_status: "suspended",
            suspended_until: until.toISOString(),
            suspension_reason: reason || "Suspended by admin",
          })
          .eq("id", targetUserId);

        if (error) throw error;

        await logAction(
          adminId,
          targetUserId,
          "user_suspended",
          { reason, days: params.days || 7, suspended_until: until.toISOString() },
          ip
        );

        await supabase.from("notifications").insert({
          user_id: targetUserId,
          type: "account_action",
          title: "Account Suspended",
          message: `Your account has been suspended. Reason: ${reason || "Policy violation"}`,
          data: { action: "suspended", reason },
        });

        return NextResponse.json({ success: true, status: "suspended" });
      }

      case "unsuspend":
      case "active": {
        const { error } = await supabase
          .from("accounts")
          .update({
            account_status: "active",
            suspended_until: null,
            suspension_reason: null,
          })
          .eq("id", targetUserId);

        if (error) throw error;

        await logAction(
          adminId,
          targetUserId,
          "user_activated",
          { reason: reason || null },
          ip
        );

        await supabase.from("notifications").insert({
          user_id: targetUserId,
          type: "account_action",
          title: "Account Activated",
          message: "Your account has been reactivated.",
          data: { action: "active" },
        });

        return NextResponse.json({ success: true, status: "active" });
      }

      case "ban": {
        const { error } = await supabase
          .from("accounts")
          .update({
            account_status: "banned",
            suspended_until: null,
            suspension_reason: reason || "Banned by admin",
          })
          .eq("id", targetUserId);

        if (error) throw error;

        await logAction(
          adminId,
          targetUserId,
          "user_banned",
          { reason: reason || null },
          ip
        );

        await supabase.from("notifications").insert({
          user_id: targetUserId,
          type: "account_action",
          title: "Account Banned",
          message: `Your account has been banned. Reason: ${reason || "Repeated violations"}`,
          data: { action: "banned", reason },
        });

        return NextResponse.json({ success: true, status: "banned" });
      }

      case "update_tier": {
        const { tier } = params;
        if (!tier || !["basic", "standard", "premium", "vip"].includes(tier)) {
          return NextResponse.json(
            { error: "Valid tier required (basic, standard, premium, vip)" },
            { status: 400 }
          );
        }

        const { data: current } = await supabase
          .from("accounts")
          .select("tier")
          .eq("id", targetUserId)
          .single();

        const { error } = await supabase
          .from("accounts")
          .update({ tier })
          .eq("id", targetUserId);

        if (error) throw error;

        await logAction(
          adminId,
          targetUserId,
          "user_tier_updated",
          { old_tier: current?.tier, new_tier: tier },
          ip
        );

        return NextResponse.json({ success: true, tier });
      }

      case "update_role": {
        const { role } = params;
        if (!role || !["user", "moderator", "admin", "superadmin"].includes(role)) {
          return NextResponse.json(
            { error: "Valid role required" },
            { status: 400 }
          );
        }

        const { data: current } = await supabase
          .from("accounts")
          .select("role")
          .eq("id", targetUserId)
          .single();

        const { error } = await supabase
          .from("accounts")
          .update({ role })
          .eq("id", targetUserId);

        if (error) throw error;

        await logAction(
          adminId,
          targetUserId,
          "user_role_updated",
          { old_role: current?.role, new_role: role },
          ip
        );

        return NextResponse.json({ success: true, role });
      }

      case "adjust_credits": {
        const { adjustment } = params;
        if (typeof adjustment !== "number") {
          return NextResponse.json(
            { error: "adjustment (number) required" },
            { status: 400 }
          );
        }

        const { data: creditsRow } = await supabase
          .from("credits")
          .select("total, used, rollover")
          .eq("user_id", targetUserId)
          .single();

        const currentTotal = creditsRow?.total || 0;
        const newTotal = Math.max(0, currentTotal + adjustment);

        const { error } = await supabase.from("credits").upsert(
          {
            user_id: targetUserId,
            total: newTotal,
            used: creditsRow?.used || 0,
            rollover: creditsRow?.rollover || 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

        if (error) throw error;

        await logAction(
          adminId,
          targetUserId,
          adjustment > 0 ? "credits_add" : "credits_remove",
          {
            adjustment,
            old_total: currentTotal,
            new_total: newTotal,
            reason: reason || null,
          },
          ip
        );

        return NextResponse.json({
          success: true,
          new_total: newTotal,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error in POST /api/admin/user-actions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
