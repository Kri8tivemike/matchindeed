/**
 * Admin Permissions Constants
 *
 * All available permissions for sub-admin roles.
 * Used by AdminSidebar and SubAdmins page.
 */

export const ALL_PERMISSIONS = [
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
  "manage_subadmins",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
