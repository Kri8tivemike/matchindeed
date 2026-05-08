-- Add explicit permission for the admin 2FA setup screen.

ALTER TABLE public.account_permissions
  DROP CONSTRAINT IF EXISTS account_permissions_permission_check;

ALTER TABLE public.account_permissions
  ADD CONSTRAINT account_permissions_permission_check
  CHECK (
    permission IN (
      'view_users',
      'edit_users',
      'view_reports',
      'resolve_reports',
      'moderate_photos',
      'warn_users',
      'suspend_users',
      'view_meetings',
      'manage_meetings',
      'view_wallet',
      'manage_wallet',
      'view_analytics',
      'manage_pricing',
      'manage_calendar',
      'manage_hosts',
      'manage_reactivation',
      'view_logs',
      'manage_activity_limits',
      'manage_subadmins',
      'manage_2fa_auth',
      'view_assigned_meetings',
      'view_upcoming_meetings',
      'join_approved_meetings'
    )
  );

INSERT INTO public.admin_permissions (role, permission)
VALUES
  ('admin', 'manage_2fa_auth'),
  ('superadmin', 'manage_2fa_auth')
ON CONFLICT (role, permission) DO NOTHING;

INSERT INTO public.account_permissions (user_id, permission)
SELECT account.id, 'manage_2fa_auth'
FROM public.accounts AS account
WHERE account.role IN ('admin', 'superadmin')
ON CONFLICT (user_id, permission) DO NOTHING;
