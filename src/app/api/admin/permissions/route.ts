import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ALL_PERMISSIONS,
  COORDINATOR_PERMISSIONS,
} from "@/lib/admin-permissions";
import {
  getAllowedPermissionsForRole,
  getDefaultAccountPermissions,
  isPermissionRole,
  loadEffectiveAccountPermissions,
  saveAccountPermissions,
} from "@/lib/account-permissions";
import {
  ADMIN_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  normalizeRolePermissionList,
  requireAdminAccess,
  type AdminRole,
} from "@/lib/admin/permissions";

/**
 * Admin Permissions API
 *
 * GET: List individual permission subjects and legacy role fallback
 * POST: Update permissions for a specific admin/coordinator account
 *
 * GET /api/admin/permissions
 * POST /api/admin/permissions
 * Body: { user_id, permissions: string[] }
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type PermissionSubject = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  account_status: string | null;
  created_at: string | null;
};

async function loadLegacyRolePermissions(role: AdminRole) {
  const { data, error } = await supabase
    .from("admin_permissions")
    .select("permission")
    .eq("role", role);

  if (error) throw error;

  const permissions = (data || []).map((row) => String(row.permission || ""));
  return permissions.length > 0
    ? normalizeRolePermissionList(role, permissions)
    : [...DEFAULT_ROLE_PERMISSIONS[role]];
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_subadmins"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const query = supabase
      .from("admin_permissions")
      .select("id, role, permission, created_at")
      .order("role")
      .order("permission");

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching permissions:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Group by role
    const byRole: Record<string, string[]> = {};
    for (const row of data || []) {
      if (!byRole[row.role]) byRole[row.role] = [];
      byRole[row.role].push(row.permission);
    }

    // Normalize role permissions for UI rendering and API checks
    for (const adminRole of ADMIN_ROLES) {
      const currentPermissions = byRole[adminRole] || [];
      if (currentPermissions.length === 0) {
        byRole[adminRole] = [...DEFAULT_ROLE_PERMISSIONS[adminRole]];
      } else {
        byRole[adminRole] = normalizeRolePermissionList(
          adminRole,
          currentPermissions
        );
      }
    }

    const { data: subjectsData, error: subjectsError } = await supabase
      .from("accounts")
      .select("id, email, display_name, role, account_status, created_at")
      .in("role", ["admin", "coordinator"])
      .order("role")
      .order("created_at", { ascending: false });

    if (subjectsError) {
      console.error("Error fetching permission subjects:", subjectsError);
      return NextResponse.json(
        { error: subjectsError.message },
        { status: 500 }
      );
    }

    const subjects = (subjectsData || []) as PermissionSubject[];
    const adminFallback = await loadLegacyRolePermissions("admin");
    const byUser: Record<
      string,
      {
        permissions: string[];
        configured: boolean;
      }
    > = {};

    for (const subject of subjects) {
      if (!isPermissionRole(subject.role)) continue;

      const fallback =
        subject.role === "admin"
          ? adminFallback
          : getDefaultAccountPermissions("coordinator");
      const effective = await loadEffectiveAccountPermissions(
        subject.id,
        subject.role,
        fallback
      );

      byUser[subject.id] = {
        permissions: [...effective.permissions],
        configured: effective.configured,
      };
    }

    return NextResponse.json({
      permissions: data || [],
      by_role: byRole,
      subjects,
      by_user: byUser,
      available_permissions: {
        admin: [...ALL_PERMISSIONS],
        coordinator: [...COORDINATOR_PERMISSIONS],
      },
    });
  } catch (error) {
    console.error("Error in GET /api/admin/permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      allowedRoles: ["superadmin"],
      anyPermissions: ["manage_subadmins"],
    });
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.status }
      );
    }

    const body = await request.json();
    const userId = typeof body.user_id === "string" ? body.user_id : "";
    const permissions = body.permissions;

    if (!userId || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: "user_id and permissions (array) required" },
        { status: 400 }
      );
    }

    const { data: targetAccount, error: targetError } = await supabase
      .from("accounts")
      .select("id, email, role")
      .eq("id", userId)
      .maybeSingle();

    if (targetError) {
      throw targetError;
    }

    if (!targetAccount || !isPermissionRole(targetAccount.role)) {
      return NextResponse.json(
        { error: "Target account must be an admin or coordinator" },
        { status: 400 }
      );
    }

    const validPermissions = getAllowedPermissionsForRole(targetAccount.role);
    const invalidPermissions = permissions.filter(
      (permission: string) => !validPermissions.has(permission)
    );
    if (invalidPermissions.length > 0) {
      return NextResponse.json(
        { error: `Invalid permissions: ${invalidPermissions.join(", ")}` },
        { status: 400 }
      );
    }

    await saveAccountPermissions({
      userId,
      permissions,
      configuredBy: guard.context.userId,
    });

    await supabase.from("admin_logs").insert({
      admin_id: guard.context.userId,
      target_user_id: userId,
      action: "account_permissions_updated",
      meta: {
        role: targetAccount.role,
        permissions,
      },
    });

    return NextResponse.json({
      success: true,
      user_id: userId,
      role: targetAccount.role,
      permissions,
    });
  } catch (error) {
    console.error("Error in POST /api/admin/permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
