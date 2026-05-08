-- Phase 3: Match Confirmation + Relationship Agreements + Profile Offline Matched

-- ------------------------------------------------------------
-- Accounts visibility/profile state (used for auto-deactivation)
-- ------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS profile_visible BOOLEAN DEFAULT TRUE;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS calendar_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS profile_status TEXT DEFAULT 'online';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_profile_status_check'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_profile_status_check
      CHECK (profile_status IN ('online', 'offline_matched', 'hidden'));
  END IF;
END $$;

UPDATE accounts
SET
  profile_visible = COALESCE(profile_visible, TRUE),
  calendar_enabled = COALESCE(calendar_enabled, TRUE),
  profile_status = COALESCE(profile_status, 'online');

CREATE INDEX IF NOT EXISTS idx_accounts_profile_status ON accounts(profile_status);
CREATE INDEX IF NOT EXISTS idx_accounts_profile_visible ON accounts(profile_visible);

-- ------------------------------------------------------------
-- Meeting response outcome tracking
-- ------------------------------------------------------------
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS response_outcome TEXT;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS responses_completed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meetings_response_outcome_check'
  ) THEN
    ALTER TABLE meetings
      ADD CONSTRAINT meetings_response_outcome_check
      CHECK (response_outcome IN ('both_yes', 'both_no', 'mismatch'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- user_matches relationship agreement status
-- ------------------------------------------------------------
ALTER TABLE user_matches
  ADD COLUMN IF NOT EXISTS relationship_agreement_status TEXT DEFAULT 'pending';

ALTER TABLE user_matches
  ADD COLUMN IF NOT EXISTS relationship_agreement_signed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_matches_relationship_agreement_status_check'
  ) THEN
    ALTER TABLE user_matches
      ADD CONSTRAINT user_matches_relationship_agreement_status_check
      CHECK (relationship_agreement_status IN ('pending', 'signed', 'both_no', 'mismatch'));
  END IF;
END $$;

UPDATE user_matches
SET relationship_agreement_status = COALESCE(relationship_agreement_status, 'pending');

CREATE INDEX IF NOT EXISTS idx_user_matches_relationship_agreement_status
  ON user_matches(relationship_agreement_status);

-- ------------------------------------------------------------
-- Relationship agreements table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS relationship_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES user_matches(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  user1_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  agreement_text TEXT NOT NULL,
  signed_by_user1 BOOLEAN NOT NULL DEFAULT FALSE,
  signed_by_user2 BOOLEAN NOT NULL DEFAULT FALSE,
  user1_signed_at TIMESTAMPTZ,
  user2_signed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT relationship_agreements_status_check
    CHECK (status IN ('pending', 'signed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_agreements_unique_match
  ON relationship_agreements(match_id);

CREATE INDEX IF NOT EXISTS idx_relationship_agreements_meeting_id
  ON relationship_agreements(meeting_id);

CREATE INDEX IF NOT EXISTS idx_relationship_agreements_status
  ON relationship_agreements(status);

CREATE OR REPLACE FUNCTION update_relationship_agreements_updated_at_fn()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_relationship_agreements_updated_at
  ON relationship_agreements;

CREATE TRIGGER update_relationship_agreements_updated_at
  BEFORE UPDATE ON relationship_agreements
  FOR EACH ROW
  EXECUTE FUNCTION update_relationship_agreements_updated_at_fn();

ALTER TABLE relationship_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own relationship agreements"
  ON relationship_agreements;
CREATE POLICY "Users can view own relationship agreements"
  ON relationship_agreements
  FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

DROP POLICY IF EXISTS "Users can sign own relationship agreements"
  ON relationship_agreements;
CREATE POLICY "Users can sign own relationship agreements"
  ON relationship_agreements
  FOR UPDATE
  USING (auth.uid() = user1_id OR auth.uid() = user2_id)
  WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

DROP POLICY IF EXISTS "Service role can insert relationship agreements"
  ON relationship_agreements;
CREATE POLICY "Service role can insert relationship agreements"
  ON relationship_agreements
  FOR INSERT
  WITH CHECK (TRUE);

GRANT SELECT, UPDATE ON relationship_agreements TO authenticated;
GRANT ALL ON relationship_agreements TO service_role;
