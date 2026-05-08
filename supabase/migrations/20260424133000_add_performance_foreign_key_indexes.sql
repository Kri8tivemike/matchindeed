-- =========================================================
-- Migration: Add covering indexes for frequently joined foreign keys
-- Purpose:
--   Reduce scan cost on admin, wallet, meeting, moderation, and report
--   screens as production data grows.
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_reviewed_by
  ON public.account_deletion_requests(reviewed_by)
  WHERE reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id
  ON public.admin_logs(admin_id)
  WHERE admin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_host_reports_guest_id
  ON public.host_reports(guest_id)
  WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_host_reports_resolved_by
  ON public.host_reports(resolved_by)
  WHERE resolved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_coordinators_created_by
  ON public.meeting_coordinators(created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_coordinators_user_id
  ON public.meeting_coordinators(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_participants_user_id
  ON public.meeting_participants(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_reports_finalized_by
  ON public.meeting_reports(finalized_by)
  WHERE finalized_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_admin_resolved_by
  ON public.meetings(admin_resolved_by)
  WHERE admin_resolved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_canceled_by
  ON public.meetings(canceled_by)
  WHERE canceled_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_finalized_by
  ON public.meetings(finalized_by)
  WHERE finalized_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_photo_moderation_reviewed_by
  ON public.photo_moderation(reviewed_by)
  WHERE reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_relationship_agreements_user1_id
  ON public.relationship_agreements(user1_id)
  WHERE user1_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_relationship_agreements_user2_id
  ON public.relationship_agreements(user2_id)
  WHERE user2_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_pricing_updated_by
  ON public.subscription_pricing(updated_by)
  WHERE updated_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user_id
  ON public.user_reports(reported_user_id)
  WHERE reported_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_id
  ON public.user_reports(reporter_id)
  WHERE reporter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_reports_reviewed_by
  ON public.user_reports(reviewed_by)
  WHERE reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_admin_id
  ON public.wallet_transactions(admin_id)
  WHERE admin_id IS NOT NULL;

