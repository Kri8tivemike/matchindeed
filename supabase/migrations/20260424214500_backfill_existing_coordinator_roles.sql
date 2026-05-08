-- Migration: Backfill existing coordinator account roles
-- Purpose:
--   Existing meeting_coordinators rows predate the dedicated coordinator role.
--   Promote only enabled, linked coordinator accounts that are still plain users.

UPDATE public.accounts AS account
SET role = 'coordinator'
FROM public.meeting_coordinators AS coordinator
WHERE coordinator.user_id = account.id
  AND coordinator.enabled IS TRUE
  AND account.role = 'user';
