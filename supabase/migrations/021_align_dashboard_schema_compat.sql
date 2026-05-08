-- =========================================================
-- Migration: Align schema for dashboard compatibility
-- Purpose:
--   Ensure key tables/columns exist so client queries do not
--   fail on older Supabase environments.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------
-- blocked_users table (for bidirectional block filtering)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'blocked_users_no_self_block'
  ) THEN
    ALTER TABLE blocked_users
      ADD CONSTRAINT blocked_users_no_self_block CHECK (blocker_id <> blocked_id);
  END IF;
END $$;

-- ---------------------------------------------------------
-- accounts compatibility columns
-- ---------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS profile_visible BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

UPDATE accounts
SET
  profile_visible = COALESCE(profile_visible, TRUE),
  email_verified = COALESCE(email_verified, FALSE),
  last_active_at = COALESCE(last_active_at, created_at, NOW());

CREATE INDEX IF NOT EXISTS idx_accounts_profile_visible ON accounts(profile_visible);
CREATE INDEX IF NOT EXISTS idx_accounts_last_active ON accounts(last_active_at DESC);

-- ---------------------------------------------------------
-- notifications.read_at compatibility
-- ---------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read_at)
  WHERE read_at IS NULL;

-- ---------------------------------------------------------
-- messages.read_at compatibility
-- ---------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(match_id, read_at)
  WHERE read_at IS NULL;
