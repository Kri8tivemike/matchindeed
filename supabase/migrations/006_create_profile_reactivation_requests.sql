-- Create canonical table for profile reactivation workflow
-- Phase 4 closure: align dashboard API, admin workflow, and cron auto-approval.

CREATE TABLE IF NOT EXISTS profile_reactivation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  matched_with_user_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reason_code INTEGER,
  reason_text TEXT,
  status TEXT NOT NULL DEFAULT 'partner_notified' CHECK (
    status IN ('pending', 'partner_notified', 'partner_responded', 'approved', 'rejected')
  ),
  partner_response_code INTEGER,
  partner_response_text TEXT,
  admin_decision TEXT CHECK (admin_decision IN ('approved', 'rejected')),
  admin_notes TEXT,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE IF EXISTS profile_reactivation_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');

CREATE INDEX IF NOT EXISTS idx_profile_reactivation_requests_user_id
  ON profile_reactivation_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_profile_reactivation_requests_partner_id
  ON profile_reactivation_requests(matched_with_user_id);

CREATE INDEX IF NOT EXISTS idx_profile_reactivation_requests_status
  ON profile_reactivation_requests(status);

CREATE INDEX IF NOT EXISTS idx_profile_reactivation_requests_created_at
  ON profile_reactivation_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_reactivation_requests_expires_at
  ON profile_reactivation_requests(expires_at);

ALTER TABLE profile_reactivation_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profile_reactivation_requests'
      AND policyname = 'Users can insert own reactivation requests'
  ) THEN
    CREATE POLICY "Users can insert own reactivation requests"
      ON profile_reactivation_requests
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profile_reactivation_requests'
      AND policyname = 'Users can view own and partner reactivation requests'
  ) THEN
    CREATE POLICY "Users can view own and partner reactivation requests"
      ON profile_reactivation_requests
      FOR SELECT
      USING (auth.uid() = user_id OR auth.uid() = matched_with_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profile_reactivation_requests'
      AND policyname = 'Users can update partner responses only'
  ) THEN
    CREATE POLICY "Users can update partner responses only"
      ON profile_reactivation_requests
      FOR UPDATE
      USING (auth.uid() = matched_with_user_id)
      WITH CHECK (auth.uid() = matched_with_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profile_reactivation_requests'
      AND policyname = 'Admins can manage reactivation requests'
  ) THEN
    CREATE POLICY "Admins can manage reactivation requests"
      ON profile_reactivation_requests
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM accounts a
          WHERE a.id = auth.uid()
            AND a.role IN ('admin', 'superadmin', 'moderator')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM accounts a
          WHERE a.id = auth.uid()
            AND a.role IN ('admin', 'superadmin', 'moderator')
        )
      );
  END IF;
END $$;

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

GRANT SELECT, INSERT, UPDATE ON profile_reactivation_requests TO authenticated;
GRANT ALL ON profile_reactivation_requests TO service_role;
