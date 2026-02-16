-- ============================================================
-- Migration: Add last_active_at column to accounts table
-- Purpose: Track when each user was last active on the platform
--          to power "Online now" filters and "Active X ago" labels
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- Index for efficient "active within last N minutes" queries
CREATE INDEX IF NOT EXISTS idx_accounts_last_active ON accounts(last_active_at DESC);

-- Set existing accounts' last_active_at to their created_at (backfill)
UPDATE accounts SET last_active_at = created_at WHERE last_active_at IS NULL;
