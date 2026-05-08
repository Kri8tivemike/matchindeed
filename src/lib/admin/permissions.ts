import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ALL_PERMISSIONS, type Permission } from "@/lib/admin-permissions";
import { loadEffectiveAccountPermissions } from "@/lib/account-permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const ADMIN_ROLES = ["admin", "superadmin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminAccessContext = {
  userId: string;
  email: string | null;
  role: AdminRole;
  permissions: Set<string>;
};

const CANONICAL_PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

const LEGACY_PERMISSION_ALIASES: Record<string, Permission[]> = {
  manage_credits: ["view_wallet", "manage_wallet"],
  manage_admins: ["manage_subadmins"],
  ban_users: ["suspend_users"],
  delete_users: ["edit_users"],
};

export const DEFAULT_ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  admin: [
    "view_users",
    "edit_users",
    "view_reports",
    "resolve_reports",
    "moderate_photos",
    "warn_users",
    "suspend_users",
    "view_meetings",
    "manage_meetings",
    "view_wallet",
    "manage_wallet",
    "view_analytics",
    "manage_pricing",
    "manage_calendar",
    "manage_hosts",
    "manage_reactivation",
    "view_logs",
    "manage_activity_limits",
    "manage_2fa_auth",
  ],
  superadmin: [...ALL_PERMISSIONS],
};

type RequireAdminOptions = {
  allowedRoles?: readonly AdminRole[];
  anyPermissions?: readonly string[];
  allPermissions?: readonly string[];
};

type AdminAccessResult =
  | {
      ok: true;
      context: AdminAccessContext;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function expandPermission(permission: string): string[] {
  if (CANONICAL_PERMISSION_SET.has(permission)) {
    return [permission];
  }
  if (LEGACY_PERMISSION_ALIASES[permission]) {
    return LEGACY_PERMISSION_ALIASES[permission];
  }
  return [];
}

function normalizePermissionRows(
  role: AdminRole,
  rows: { permission: string }[]
): Set<string> {
  const normalized = new Set<string>();
  for (const row of rows) {
    const expanded = expandPermission(row.permission);
    for (const permission of expanded) {
      normalized.add(permission);
    }
  }

  if (normalized.size === 0) {
    for (const permission of DEFAULT_ROLE_PERMISSIONS[role]) {
      normalized.add(permission);
    }
  }

  return normalized;
}

export function adminHasAnyPermission(
  context: AdminAccessContext,
  permissions: readonly string[]
) {
  if (context.role === "superadmin") return true;
  if (permissions.length === 0) return true;
  return permissions.some((permission) => context.permissions.has(permission));
}

export function adminHasAllPermissions(
  context: AdminAccessContext,
  permissions: readonly string[]
) {
  if (context.role === "superadmin") return true;
  if (permissions.length === 0) return true;
  return permissions.every((permission) => context.permissions.has(permission));
}

export async function requireAdminAccess(
  request: NextRequest,
  options: RequireAdminOptions = {}
): Promise<AdminAccessResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const token = authHeader.substring(7);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, email, role")
    .eq("id", user.id)
    .maybeSingle();

  if (accountError || !account?.role) {
    return {
      ok: false,
      status: 403,
      error: "Admin access required",
    };
  }

  const role = account.role as AdminRole;
  if (!ADMIN_ROLES.includes(role)) {
    return {
      ok: false,
      status: 403,
      error: "Admin access required",
    };
  }

  if (
    options.allowedRoles &&
    options.allowedRoles.length > 0 &&
    !options.allowedRoles.includes(role)
  ) {
    return {
      ok: false,
      status: 403,
      error: "Insufficient role",
    };
  }

  const permissions = new Set<string>();
  if (role === "superadmin") {
    for (const permission of ALL_PERMISSIONS) {
      permissions.add(permission);
    }
  } else {
    const { data: rolePermissions, error: rolePermissionsError } = await supabase
      .from("admin_permissions")
      .select("permission")
      .eq("role", role);

    if (rolePermissionsError) {
      return {
        ok: false,
        status: 500,
        error: "Failed to resolve admin permissions",
      };
    }

    const fallbackPermissions = normalizePermissionRows(role, rolePermissions || []);
    try {
      const accountPermissions = await loadEffectiveAccountPermissions(
        user.id,
        "admin",
        [...fallbackPermissions]
      );
      for (const permission of accountPermissions.permissions) {
        permissions.add(permission);
      }
    } catch (permissionsError) {
      console.error("[admin/permissions] account permission lookup failed:", permissionsError);
      return {
        ok: false,
        status: 500,
        error: "Failed to resolve admin permissions",
      };
    }

    if (permissions.size === 0) {
      // A configured admin can intentionally have no permissions. The fallback
      // above only applies before an account-level override is saved.
    }
  }
  const context: AdminAccessContext = {
    userId: user.id,
    email: account.email || null,
    role,
    permissions,
  };

  if (
    options.anyPermissions &&
    options.anyPermissions.length > 0 &&
    !adminHasAnyPermission(context, options.anyPermissions)
  ) {
    return {
      ok: false,
      status: 403,
      error: "Missing required permission",
    };
  }

  if (
    options.allPermissions &&
    options.allPermissions.length > 0 &&
    !adminHasAllPermissions(context, options.allPermissions)
  ) {
    return {
      ok: false,
      status: 403,
      error: "Missing required permission",
    };
  }

  return { ok: true, context };
}

export function normalizeRolePermissionList(
  role: AdminRole,
  permissions: string[]
): string[] {
  const normalized = normalizePermissionRows(
    role,
    permissions.map((permission) => ({ permission }))
  );
  return [...normalized];
}
