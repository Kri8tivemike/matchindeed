-- ============================================================
-- Migration: Create blocked_users table
-- Purpose: Allow users to block other users for safety
-- Blocked users are hidden from discover, search, likes,
-- matches, and messages in both directions.
-- ============================================================

CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  reason TEXT,                          -- optional reason for blocking
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure a user can only block another user once
  UNIQUE(blocker_id, blocked_id)
);

-- Index for fast lookup of all users blocked BY a specific user
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);

-- Index for fast lookup of all users who BLOCKED a specific user
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);

-- Prevent a user from blocking themselves (sanity check)
ALTER TABLE blocked_users
  ADD CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id);
