-- =========================================================
-- Migration: Add pending review status and resolution indexes
-- Purpose:
--   Support the admin post-meeting review queue without falling
--   back to every pending meeting.
-- =========================================================

ALTER TYPE public.charge_status ADD VALUE IF NOT EXISTS 'pending_review';

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS fault_determination TEXT,
  ADD COLUMN IF NOT EXISTS host_notes TEXT,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_resolution TEXT,
  ADD COLUMN IF NOT EXISTS admin_resolution_notes TEXT,
  ADD COLUMN IF NOT EXISTS admin_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_resolved_by UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meetings_outcome_check'
  ) THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_outcome_check
      CHECK (
        outcome IS NULL OR
        outcome IN ('completed', 'no_show', 'early_leave', 'network_disconnect')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meetings_fault_determination_check'
  ) THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_fault_determination_check
      CHECK (
        fault_determination IS NULL OR
        fault_determination IN ('no_fault', 'requester_fault', 'accepter_fault', 'both_fault')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meetings_admin_resolution_check'
  ) THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_admin_resolution_check
      CHECK (
        admin_resolution IS NULL OR
        admin_resolution IN (
          'charge_requester',
          'refund_requester',
          'charge_accepter',
          'no_charge',
          'split'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meetings_charge_status_finalized_at
  ON public.meetings(charge_status, finalized_at ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_meetings_charge_status_admin_resolved_at
  ON public.meetings(charge_status, admin_resolved_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_meetings_charge_status_created_at
  ON public.meetings(charge_status, created_at DESC);

