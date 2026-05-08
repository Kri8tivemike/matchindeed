-- Grant existing coordinator accounts access to the 2FA auth setup feature by default.

WITH coordinator_accounts AS (
  SELECT id AS user_id
  FROM public.accounts
  WHERE role = 'coordinator'::public.user_role

  UNION

  SELECT user_id
  FROM public.meeting_coordinators
  WHERE enabled IS TRUE
    AND user_id IS NOT NULL
)
INSERT INTO public.account_permissions (user_id, permission)
SELECT coordinator_accounts.user_id, 'manage_2fa_auth'
FROM coordinator_accounts
ON CONFLICT (user_id, permission) DO NOTHING;
