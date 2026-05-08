import { createClient } from "@supabase/supabase-js";
import {
  ACCOUNT_PERMISSIONS,
  ALL_PERMISSIONS,
  COORDINATOR_PERMISSIONS,
  type AccountPermission,
  type CoordinatorPermission,
  type Permission,
} from "@/lib/admin-permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const ACCOUNT_ROLES_WITH_PERMISSIONS = ["admin", "coordinator"] as const;
export type AccountPermissionRole = (typeof ACCOUNT_ROLES_WITH_PERMISSIONS)[number];

export type EffectiveAccountPermissions = {
  permissions: Set<string>;
  configured: boolean;
};

const ADMIN_PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);
const COORDINATOR_PERMISSION_SET = new Set<string>(COORDINATOR_PERMISSIONS);
const ACCOUNT_PERMISSION_SET = new Set<string>(ACCOUNT_PERMISSIONS);

export function isPermissionRole(role: string | null | undefined): role is AccountPermissionRole {
  return role === "admin" || role === "coordinator";
}

export function getDefaultAccountPermissions(role: AccountPermissionRole) {
  return role === "coordinator"
    ? [...COORDINATOR_PERMISSIONS]
    : [...ALL_PERMISSIONS];
}

export function getAllowedPermissionsForRole(role: AccountPermissionRole) {
  return role === "coordinator" ? COORDINATOR_PERMISSION_SET : ADMIN_PERMISSION_SET;
}

export function isKnownAccountPermission(
  permission: string
): permission is AccountPermission {
  return ACCOUNT_PERMISSION_SET.has(permission);
}

export async function loadEffectiveAccountPermissions(
  userId: string,
  role: AccountPermissionRole,
  fallbackPermissions?: readonly string[]
): Promise<EffectiveAccountPermissions> {
  const { data: override, error: overrideError } = await supabase
    .from("account_permission_overrides")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (overrideError) {
    throw overrideError;
  }

  const { data: permissionRows, error: permissionsError } = await supabase
    .from("account_permissions")
    .select("permission")
    .eq("user_id", userId);

  if (permissionsError) {
    throw permissionsError;
  }

  const allowedForRole = getAllowedPermissionsForRole(role);
  const exactPermissions = new Set<string>();
  for (const row of permissionRows || []) {
    const permission = String(row.permission || "");
    if (allowedForRole.has(permission)) {
      exactPermissions.add(permission);
    }
  }

  if (override) {
    return {
      permissions: exactPermissions,
      configured: true,
    };
  }

  const fallback = fallbackPermissions?.length
    ? fallbackPermissions
    : getDefaultAccountPermissions(role);

  return {
    permissions: new Set(fallback.filter((permission) => allowedForRole.has(permission))),
    configured: false,
  };
}

export async function saveAccountPermissions({
  userId,
  permissions,
  configuredBy,
}: {
  userId: string;
  permissions: readonly string[];
  configuredBy: string | null;
}) {
  const uniquePermissions = [...new Set(permissions)];
  const invalidPermissions = uniquePermissions.filter(
    (permission) => !isKnownAccountPermission(permission)
  );

  if (invalidPermissions.length > 0) {
    throw new Error(`Invalid permissions: ${invalidPermissions.join(", ")}`);
  }

  const { error: overrideError } = await supabase
    .from("account_permission_overrides")
    .upsert(
      {
        user_id: userId,
        configured_by: configuredBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (overrideError) {
    throw overrideError;
  }

  const { error: deleteError } = await supabase
    .from("account_permissions")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw deleteError;
  }

  if (uniquePermissions.length === 0) {
    return;
  }

  const rows = uniquePermissions.map((permission) => ({
    user_id: userId,
    permission,
    created_by: configuredBy,
  }));

  const { error: insertError } = await supabase
    .from("account_permissions")
    .insert(rows);

  if (insertError) {
    throw insertError;
  }
}

export async function clearAccountPermissions(userId: string) {
  const { error: permissionsError } = await supabase
    .from("account_permissions")
    .delete()
    .eq("user_id", userId);

  if (permissionsError) {
    throw permissionsError;
  }

  const { error: overrideError } = await supabase
    .from("account_permission_overrides")
    .delete()
    .eq("user_id", userId);

  if (overrideError) {
    throw overrideError;
  }
}

export function serializePermissions(
  permissions: Set<string>,
  role: AccountPermissionRole
): Permission[] | CoordinatorPermission[] {
  const allowed = getAllowedPermissionsForRole(role);
  return [...permissions].filter((permission) =>
    allowed.has(permission)
  ) as Permission[] | CoordinatorPermission[];
}
