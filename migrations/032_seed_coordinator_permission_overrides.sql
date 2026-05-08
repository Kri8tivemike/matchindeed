-- Give existing coordinator accounts their default dashboard permissions.
-- Accounts with already-configured permissions are left untouched.

WITH coordinator_accounts AS (
  SELECT id AS user_id
  FROM public.accounts
  WHERE role = 'coordinator'::public.user_role

  UNION

  SELECT user_id
  FROM public.meeting_coordinators
  WHERE enabled IS TRUE
    AND user_id IS NOT NULL
),
new_overrides AS (
  INSERT INTO public.account_permission_overrides (user_id)
  SELECT coordinator.user_id
  FROM coordinator_accounts AS coordinator
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.account_permission_overrides AS existing
    WHERE existing.user_id = coordinator.user_id
  )
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id
)
INSERT INTO public.account_permissions (user_id, permission)
SELECT new_overrides.user_id, permission.name
FROM new_overrides
CROSS JOIN (
  VALUES
    ('view_assigned_meetings'),
    ('view_upcoming_meetings'),
    ('join_approved_meetings')
) AS permission(name)
ON CONFLICT (user_id, permission) DO NOTHING;
