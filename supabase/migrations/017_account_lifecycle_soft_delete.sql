-- P0.1 Account lifecycle hardening:
-- - keep user records for deletion requests (soft-delete workflow)
-- - add metadata fields for deactivation/deletion state
-- - create account_deletion_requests audit table

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_reason text,
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES accounts(id),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user_id
  ON account_deletion_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_status
  ON account_deletion_requests(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_requests_pending_unique
  ON account_deletion_requests(user_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION set_account_deletion_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_deletion_requests_updated_at
  ON account_deletion_requests;

CREATE TRIGGER trg_account_deletion_requests_updated_at
  BEFORE UPDATE ON account_deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION set_account_deletion_requests_updated_at();
