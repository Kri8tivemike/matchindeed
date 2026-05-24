/**
 * Admin Permissions Constants
 *
 * All available permissions for admin and coordinator accounts.
 * Used by AdminSidebar, Coordinator dashboard, and SubAdmins page.
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
  "manage_2fa_auth",
  "view_referrals",
  "manage_referral_rewards",
  "manage_referral_settings",
  "review_referral_fraud",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const COORDINATOR_PERMISSIONS = [
  "view_assigned_meetings",
  "view_upcoming_meetings",
  "join_approved_meetings",
  "manage_2fa_auth",
] as const;

export type CoordinatorPermission = (typeof COORDINATOR_PERMISSIONS)[number];

export const ACCOUNT_PERMISSION_LABELS: Record<
  Permission | CoordinatorPermission,
  string
> = {
  view_users: "View users",
  edit_users: "Edit users",
  view_reports: "View reports",
  resolve_reports: "Resolve reports",
  moderate_photos: "Moderate photos",
  warn_users: "Warn users",
  suspend_users: "Suspend users",
  view_meetings: "View meetings",
  manage_meetings: "Manage meetings",
  view_wallet: "View wallet",
  manage_wallet: "Manage wallet",
  view_analytics: "View analytics",
  manage_pricing: "Manage pricing",
  manage_calendar: "Manage calendar",
  manage_hosts: "Manage coordinators",
  manage_reactivation: "Manage reactivation",
  view_logs: "View logs",
  manage_activity_limits: "Manage activity limits",
  manage_subadmins: "Manage sub-admins",
  manage_2fa_auth: "2FA Auth setup",
  view_referrals: "View referrals",
  manage_referral_rewards: "Manage referral rewards",
  manage_referral_settings: "Manage referral settings",
  review_referral_fraud: "Review referral fraud",
  view_assigned_meetings: "View assigned meetings",
  view_upcoming_meetings: "View upcoming meetings",
  join_approved_meetings: "Join approved meetings",
};

export const ACCOUNT_PERMISSIONS = [
  ...ALL_PERMISSIONS,
  ...COORDINATOR_PERMISSIONS,
] as const;

export type AccountPermission = (typeof ACCOUNT_PERMISSIONS)[number];
