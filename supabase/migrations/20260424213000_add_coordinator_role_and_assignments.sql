-- Migration: Coordinator role and single meeting assignment support
-- Purpose:
--   Allow coordinator accounts to exist as a first-class role while keeping
--   meeting assignment tied to meeting_participants(role = 'coordinator').

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'coordinator';

CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_participants_one_coordinator
  ON public.meeting_participants(meeting_id)
  WHERE role = 'coordinator';

CREATE INDEX IF NOT EXISTS idx_meeting_participants_coordinator_user
  ON public.meeting_participants(user_id, meeting_id)
  WHERE role = 'coordinator';

CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting_role
  ON public.meeting_participants(meeting_id, role);
