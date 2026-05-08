-- Align existing profile_reactivation_requests schema with Phase 4 API expectations.
-- Intended for environments where the table already exists.

ALTER TABLE IF EXISTS profile_reactivation_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');

ALTER TABLE IF EXISTS profile_reactivation_requests
  ALTER COLUMN status SET DEFAULT 'partner_notified';

UPDATE profile_reactivation_requests
SET expires_at = COALESCE(created_at, CURRENT_TIMESTAMP) + INTERVAL '7 days'
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profile_reactivation_requests_partner_id
  ON profile_reactivation_requests(matched_with_user_id);

CREATE INDEX IF NOT EXISTS idx_profile_reactivation_requests_created_at
  ON profile_reactivation_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_reactivation_requests_expires_at
  ON profile_reactivation_requests(expires_at);

CREATE OR REPLACE FUNCTION update_profile_reactivation_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profile_reactivation_requests_updated_at
  ON profile_reactivation_requests;

CREATE TRIGGER update_profile_reactivation_requests_updated_at
  BEFORE UPDATE ON profile_reactivation_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_reactivation_requests_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profile_reactivation_requests'
      AND policyname = 'reactivation_update_partner'
  ) THEN
    CREATE POLICY reactivation_update_partner
      ON profile_reactivation_requests
      FOR UPDATE
      USING (matched_with_user_id = auth.uid())
      WITH CHECK (matched_with_user_id = auth.uid());
  END IF;
END $$;
