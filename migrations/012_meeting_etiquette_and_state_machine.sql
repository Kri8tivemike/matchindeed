-- Phase 2.3 + 2.4 schema support:
-- - Meeting etiquette acknowledgment tracking.
-- - Meeting workflow state machine metadata.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS workflow_state TEXT DEFAULT 'requested';

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS rated_at TIMESTAMP WITH TIME ZONE;

UPDATE meetings
SET workflow_state = CASE
  WHEN status = 'canceled' THEN 'canceled'
  WHEN status = 'completed' THEN 'completed'
  WHEN status = 'confirmed' THEN 'confirmed'
  ELSE 'requested'
END
WHERE workflow_state IS NULL;

ALTER TABLE meetings
  DROP CONSTRAINT IF EXISTS meetings_workflow_state_check;

ALTER TABLE meetings
  ADD CONSTRAINT meetings_workflow_state_check CHECK (
    workflow_state IN (
      'requested',
      'accepted',
      'confirmed',
      'in_progress',
      'completed',
      'rated',
      'canceled'
    )
  );

CREATE TABLE IF NOT EXISTS meeting_rule_acknowledgments (
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_rule_ack_user
  ON meeting_rule_acknowledgments(user_id);
