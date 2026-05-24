import type { Permission } from "@/lib/admin-permissions";

export const GROWTH_MANAGER_ROLE = "growth_manager" as const;

export const GROWTH_MANAGER_PERMISSIONS = [
  "view_referrals",
  "manage_referral_rewards",
  "manage_referral_settings",
  "review_referral_fraud",
] as const satisfies readonly Permission[];

const GROWTH_MANAGER_PERMISSION_SET = new Set<string>(
  GROWTH_MANAGER_PERMISSIONS
);

export function isGrowthManagerPermissionSet(
  permissions: Iterable<string> | null | undefined
) {
  if (!permissions) return false;
  const permissionSet = new Set(permissions);

  if (permissionSet.size !== GROWTH_MANAGER_PERMISSION_SET.size) {
    return false;
  }

  for (const permission of GROWTH_MANAGER_PERMISSION_SET) {
    if (!permissionSet.has(permission)) return false;
  }

  return true;
}

export function getDisplayAdminRole(
  role: string | null | undefined,
  permissions?: Iterable<string> | null
) {
  if (role === "admin" && isGrowthManagerPermissionSet(permissions)) {
    return GROWTH_MANAGER_ROLE;
  }

  return role || "user";
}

export function formatAdminRoleLabel(role: string) {
  if (role === GROWTH_MANAGER_ROLE) return "Growth Manager";
  if (role === "superadmin") return "Super Admin";

  return role.charAt(0).toUpperCase() + role.slice(1);
}
