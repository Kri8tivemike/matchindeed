-- Migration: Deprecate moderator role
-- Purpose:
--   MatchIndeed now uses four account roles: user, coordinator, admin, superadmin.
--   The old moderator role duplicated admin moderation permissions and is no longer
--   assignable by the app. Keep the enum label for migration compatibility, but
--   prevent future account usage and remove its permission rows.

UPDATE public.accounts
SET role = 'admin'::public.user_role
WHERE role = 'moderator'::public.user_role;

DELETE FROM public.admin_permissions
WHERE role = 'moderator';

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_no_moderator_role;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_no_moderator_role
  CHECK (role IS NULL OR role <> 'moderator'::public.user_role);
