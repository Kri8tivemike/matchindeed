-- Phase 5.3: Backfill canonical admin permissions for role separation.
-- Safe to run repeatedly (uses ON CONFLICT DO NOTHING).

INSERT INTO admin_permissions (role, permission)
VALUES
  -- moderator (view-only + moderation)
  ('moderator', 'view_users'),
  ('moderator', 'view_reports'),
  ('moderator', 'moderate_photos'),
  ('moderator', 'warn_users'),

  -- admin (operations, finance, support)
  ('admin', 'view_users'),
  ('admin', 'edit_users'),
  ('admin', 'view_reports'),
  ('admin', 'resolve_reports'),
  ('admin', 'moderate_photos'),
  ('admin', 'warn_users'),
  ('admin', 'suspend_users'),
  ('admin', 'view_meetings'),
  ('admin', 'manage_meetings'),
  ('admin', 'view_wallet'),
  ('admin', 'manage_wallet'),
  ('admin', 'view_analytics'),
  ('admin', 'manage_pricing'),
  ('admin', 'manage_calendar'),
  ('admin', 'manage_hosts'),
  ('admin', 'manage_reactivation'),
  ('admin', 'view_logs'),
  ('admin', 'manage_activity_limits'),

  -- superadmin (full control)
  ('superadmin', 'view_users'),
  ('superadmin', 'edit_users'),
  ('superadmin', 'view_reports'),
  ('superadmin', 'resolve_reports'),
  ('superadmin', 'moderate_photos'),
  ('superadmin', 'warn_users'),
  ('superadmin', 'suspend_users'),
  ('superadmin', 'view_meetings'),
  ('superadmin', 'manage_meetings'),
  ('superadmin', 'view_wallet'),
  ('superadmin', 'manage_wallet'),
  ('superadmin', 'view_analytics'),
  ('superadmin', 'manage_pricing'),
  ('superadmin', 'manage_calendar'),
  ('superadmin', 'manage_hosts'),
  ('superadmin', 'manage_reactivation'),
  ('superadmin', 'view_logs'),
  ('superadmin', 'manage_activity_limits'),
  ('superadmin', 'manage_subadmins')
ON CONFLICT (role, permission) DO NOTHING;
