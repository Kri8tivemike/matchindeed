import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminHasAnyPermission, requireAdminAccess } from "@/lib/admin/permissions";
import { buildDeletedAccountEmailTombstone } from "@/lib/account-provisioning";
import { clearAccountPermissions, getDefaultAccountPermissions, saveAccountPermissions } from "@/lib/account-permissions";

/**
 * Admin User Actions API
 *
 * Centralized API for admin actions on users:
 * - suspend: Suspend user account
 * - unsuspend / active: Reactivate suspended user
 * - ban: Permanently ban user
 * - approve_deletion_request: Approve user delete request + disable auth login
 * - reject_deletion_request: Reject delete request and reactivate account
 * - bulk_delete_users: Delete multiple users at once (soft-delete auth + deactivate account)
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

async function safeInsertNotification(payload: Record<string, unknown>) {
  const { error } = await supabase.from("notifications").insert(payload);
  if (error) {
    // Notifications schema differs across environments; this is non-blocking.
    console.warn("[admin/user-actions] notification insert skipped:", error.message);
  }
}

function isAuthUserMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeMessage =
    "message" in error ? String((error as { message?: unknown }).message || "") : "";
  const lower = maybeMessage.toLowerCase();
  return (
    lower.includes("user not found") ||
    lower.includes("not found") ||
    lower.includes("no rows")
  );
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const admin = guard.context;
    const adminId = admin.userId;
    const ip = getClientIp(request);

    const body = await request.json();
    const { action, user_id: targetUserId, reason, ...params } = body;

    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

    const isBulkDelete = action === "bulk_delete_users";
    if (!isBulkDelete && !targetUserId) {
      return NextResponse.json(
        { error: "user_id is required for this action" },
        { status: 400 }
      );
    }

    const actionPermissions: Record<string, string[]> = {
      suspend: ["suspend_users"],
      unsuspend: ["suspend_users"],
      active: ["suspend_users"],
      ban: ["suspend_users"],
      approve_deletion_request: ["edit_users"],
      reject_deletion_request: ["edit_users"],
      bulk_delete_users: ["edit_users"],
      update_tier: ["edit_users"],
      adjust_credits: ["manage_wallet"],
      update_role: ["manage_subadmins"],
      create_subadmin: ["manage_subadmins"],
    };

    if (!adminHasAnyPermission(admin, actionPermissions[action] || [])) {
      return NextResponse.json(
        { error: "Missing required permission for this action" },
        { status: 403 }
      );
    }

    if (
      ["update_role", "create_subadmin"].includes(action) &&
      admin.role !== "superadmin"
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

        await safeInsertNotification({
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

        await safeInsertNotification({
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

        await safeInsertNotification({
          user_id: targetUserId,
          type: "account_action",
          title: "Account Banned",
          message: `Your account has been banned. Reason: ${reason || "Repeated violations"}`,
          data: { action: "banned", reason },
        });

        return NextResponse.json({ success: true, status: "banned" });
      }

      case "approve_deletion_request": {
        const note =
          typeof reason === "string" && reason.trim().length > 0
            ? reason.trim()
            : "Approved by admin";
        const nowIso = new Date().toISOString();

        const { data: pendingRequest, error: pendingRequestError } = await supabase
          .from("account_deletion_requests")
          .select("id")
          .eq("user_id", targetUserId)
          .eq("status", "pending")
          .order("requested_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pendingRequestError) {
          throw pendingRequestError;
        }

        if (!pendingRequest?.id) {
          return NextResponse.json(
            { error: "No pending deletion request found for this user." },
            { status: 409 }
          );
        }

        const { error: reviewError } = await supabase
          .from("account_deletion_requests")
          .update({
            status: "approved",
            reviewed_at: nowIso,
            reviewed_by: adminId,
            resolution_note: note,
          })
          .eq("id", pendingRequest.id);

        if (reviewError) throw reviewError;

        // Soft-delete auth identity so the user can no longer sign in.
        // Soft delete preserves references for historical records.
        const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
          targetUserId,
          true
        );
        if (authDeleteError && !isAuthUserMissing(authDeleteError)) {
          throw authDeleteError;
        }

        const { error: accountError } = await supabase
          .from("accounts")
          .update({
            email: buildDeletedAccountEmailTombstone(targetUserId),
            account_status: "deactivated",
            profile_visible: false,
            calendar_enabled: false,
            profile_status: "hidden",
            suspended_until: null,
          })
          .eq("id", targetUserId);

        if (accountError) throw accountError;

        await logAction(
          adminId,
          targetUserId,
          "user_deletion_approved",
          {
            note,
            deletion_request_id: pendingRequest?.id || null,
            auth_soft_deleted: true,
          },
          ip
        );

        return NextResponse.json({
          success: true,
          status: "deactivated",
          auth_deleted: true,
        });
      }

      case "reject_deletion_request": {
        const note =
          typeof reason === "string" && reason.trim().length > 0
            ? reason.trim()
            : "Rejected by admin";
        const nowIso = new Date().toISOString();

        const { data: pendingRequest, error: pendingRequestError } = await supabase
          .from("account_deletion_requests")
          .select("id")
          .eq("user_id", targetUserId)
          .eq("status", "pending")
          .order("requested_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pendingRequestError) {
          throw pendingRequestError;
        }

        if (!pendingRequest?.id) {
          return NextResponse.json(
            { error: "No pending deletion request found for this user." },
            { status: 409 }
          );
        }

        const { error: reviewError } = await supabase
          .from("account_deletion_requests")
          .update({
            status: "rejected",
            reviewed_at: nowIso,
            reviewed_by: adminId,
            resolution_note: note,
          })
          .eq("id", pendingRequest.id);

        if (reviewError) throw reviewError;

        const { error: accountError } = await supabase
          .from("accounts")
          .update({
            account_status: "active",
            profile_visible: true,
            calendar_enabled: true,
            profile_status: "online",
            suspended_until: null,
            suspension_reason: null,
          })
          .eq("id", targetUserId);

        if (accountError) throw accountError;

        await logAction(
          adminId,
          targetUserId,
          "user_deletion_rejected",
          {
            note,
            deletion_request_id: pendingRequest?.id || null,
          },
          ip
        );

        await safeInsertNotification({
          user_id: targetUserId,
          type: "account_action",
          title: "Deletion Request Rejected",
          message:
            "Your account deletion request was reviewed and not approved. Your account is active.",
          data: { action: "deletion_rejected", reason: note },
        });

        return NextResponse.json({ success: true, status: "active" });
      }

      case "bulk_delete_users": {
        const rawUserIds: unknown[] = Array.isArray(params.user_ids)
          ? params.user_ids
          : [];
        const userIds = Array.from(
          new Set(
            rawUserIds
              .filter((id: unknown): id is string => typeof id === "string")
              .map((id: string) => id.trim())
              .filter((id: string) => id.length > 0)
          )
        );

        if (userIds.length === 0) {
          return NextResponse.json(
            { error: "user_ids (array) is required for bulk delete." },
            { status: 400 }
          );
        }

        if (userIds.length > 100) {
          return NextResponse.json(
            { error: "Bulk delete supports up to 100 users per request." },
            { status: 400 }
          );
        }

        const { data: targetAccounts, error: targetAccountsError } = await supabase
          .from("accounts")
          .select("id, role")
          .in("id", userIds);

        if (targetAccountsError) throw targetAccountsError;

        const targetMap = new Map<string, string>(
          ((targetAccounts || []) as Array<{ id: string; role: string }>).map((row) => [
            row.id,
            row.role,
          ])
        );

        const skipped: { user_id: string; reason: string }[] = [];
        const deleted: string[] = [];
        const failed: { user_id: string; reason: string }[] = [];

        const note =
          typeof reason === "string" && reason.trim().length > 0
            ? reason.trim()
            : "Bulk delete approved by admin";
        const nowIso = new Date().toISOString();

        for (const userId of userIds) {
          if (userId === adminId) {
            skipped.push({ user_id: userId, reason: "Cannot delete your own account." });
            continue;
          }

          const targetRole = targetMap.get(userId);
          if (!targetRole) {
            skipped.push({ user_id: userId, reason: "User account not found." });
            continue;
          }

          if (admin.role !== "superadmin" && targetRole !== "user") {
            skipped.push({
              user_id: userId,
              reason: "Only superadmin can delete non-user accounts.",
            });
            continue;
          }

          try {
            const { data: pendingRequest } = await supabase
              .from("account_deletion_requests")
              .select("id")
              .eq("user_id", userId)
              .eq("status", "pending")
              .order("requested_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (pendingRequest?.id) {
              const { error: reviewError } = await supabase
                .from("account_deletion_requests")
                .update({
                  status: "approved",
                  reviewed_at: nowIso,
                  reviewed_by: adminId,
                  resolution_note: note,
                })
                .eq("id", pendingRequest.id);
              if (reviewError) throw reviewError;
            } else {
              const { error: insertRequestError } = await supabase
                .from("account_deletion_requests")
                .insert({
                  user_id: userId,
                  reason: note,
                  status: "approved",
                  requested_at: nowIso,
                  reviewed_at: nowIso,
                  reviewed_by: adminId,
                  resolution_note: note,
                });
              if (insertRequestError) throw insertRequestError;
            }

            const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
              userId,
              true
            );
            if (authDeleteError && !isAuthUserMissing(authDeleteError)) {
              throw authDeleteError;
            }

            const { error: accountError } = await supabase
              .from("accounts")
              .update({
                email: buildDeletedAccountEmailTombstone(userId),
                account_status: "deactivated",
                profile_visible: false,
                calendar_enabled: false,
                profile_status: "hidden",
                suspended_until: null,
              })
              .eq("id", userId);
            if (accountError) throw accountError;

            await logAction(
              adminId,
              userId,
              "user_deletion_bulk_approved",
              { note, auth_soft_deleted: true },
              ip
            );

            deleted.push(userId);
          } catch (deleteError) {
            const reasonText =
              deleteError && typeof deleteError === "object" && "message" in deleteError
                ? String(deleteError.message || "Unknown error")
                : "Unknown error";
            failed.push({ user_id: userId, reason: reasonText });
          }
        }

        return NextResponse.json({
          success: true,
          requested: userIds.length,
          deleted_count: deleted.length,
          skipped_count: skipped.length,
          failed_count: failed.length,
          deleted,
          skipped,
          failed,
        });
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
        if (
          !role ||
          !["user", "coordinator", "admin", "superadmin"].includes(role)
        ) {
          return NextResponse.json(
            { error: "Valid role required" },
            { status: 400 }
          );
        }

        const { data: current } = await supabase
          .from("accounts")
          .select("role, email, display_name")
          .eq("id", targetUserId)
          .single();

        const { error } = await supabase
          .from("accounts")
          .update({ role })
          .eq("id", targetUserId);

        if (error) throw error;

        if (role === "coordinator") {
          const coordinatorEmail = String(current?.email || "").trim().toLowerCase();
          if (coordinatorEmail) {
            const { error: coordinatorError } = await supabase
              .from("meeting_coordinators")
              .upsert(
                {
                  name:
                    current?.display_name ||
                    coordinatorEmail.split("@")[0] ||
                    "Coordinator",
                  email: coordinatorEmail,
                  user_id: targetUserId,
                  enabled: true,
                  created_by: adminId,
                },
                { onConflict: "email" }
              );

            if (coordinatorError) throw coordinatorError;
          }
          await saveAccountPermissions({
            userId: targetUserId,
            permissions: getDefaultAccountPermissions("coordinator"),
            configuredBy: adminId,
          });
        } else {
          if (role === "admin") {
            await saveAccountPermissions({
              userId: targetUserId,
              permissions: getDefaultAccountPermissions("admin"),
              configuredBy: adminId,
            });
          } else if (role === "user") {
            await clearAccountPermissions(targetUserId);
          }
        }

        if (current?.role === "coordinator" && role !== "coordinator") {
          const { error: coordinatorError } = await supabase
            .from("meeting_coordinators")
            .update({ enabled: false })
            .eq("user_id", targetUserId);

          if (coordinatorError) throw coordinatorError;
        }

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
