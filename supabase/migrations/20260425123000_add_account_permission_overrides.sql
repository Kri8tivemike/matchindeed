-- Store permissions per individual admin/coordinator account instead of only by role.
-- The old admin_permissions table remains as a fallback for legacy admins.

CREATE TABLE IF NOT EXISTS public.account_permission_overrides (
  user_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  configured_by UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_permissions (
  user_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (
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
      'view_assigned_meetings',
      'view_upcoming_meetings',
      'join_approved_meetings'
    )
  ),
  created_by UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_account_permissions_permission
  ON public.account_permissions(permission);

CREATE OR REPLACE FUNCTION public.set_account_permission_override_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION public.set_account_permission_override_updated_at()
  SET search_path = public;

DROP TRIGGER IF EXISTS set_account_permission_override_updated_at
  ON public.account_permission_overrides;

CREATE TRIGGER set_account_permission_override_updated_at
  BEFORE UPDATE ON public.account_permission_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_account_permission_override_updated_at();

ALTER TABLE public.account_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_permissions ENABLE ROW LEVEL SECURITY;

-- Preserve the current admin role permissions as explicit per-account overrides.
INSERT INTO public.account_permission_overrides (user_id)
SELECT account.id
FROM public.accounts AS account
WHERE account.role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.account_permissions (user_id, permission)
SELECT account.id, permission.permission
FROM public.accounts AS account
JOIN public.admin_permissions AS permission
  ON permission.role = account.role
WHERE account.role = 'admin'
ON CONFLICT (user_id, permission) DO NOTHING;
