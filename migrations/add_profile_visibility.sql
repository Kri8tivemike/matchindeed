-- =========================================================
-- Migration: Add profile visibility columns
-- =========================================================
-- Adds profile_visible and calendar_enabled flags to the
-- accounts table. When profile_visible is false, the user's
-- profile is hidden from discover/search and their photos
-- become invisible to other users.
-- =========================================================

-- Add profile visibility flag (default: true — profiles are visible)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS profile_visible BOOLEAN DEFAULT TRUE;

-- Add calendar enabled flag (default: true — calendar is active)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS calendar_enabled BOOLEAN DEFAULT TRUE;

-- Index for quickly filtering visible profiles in discover/search
CREATE INDEX IF NOT EXISTS idx_accounts_profile_visible
  ON accounts(profile_visible) WHERE profile_visible = TRUE;

-- =========================================================
-- How it works:
--
-- 1. When a user toggles "Calendar Off":
--    - calendar_enabled = false
--    - profile_visible = false  (profile becomes hidden)
--    - Their profile won't appear in discover/search
--    - Their photos won't be shown to other users
--
-- 2. When a user toggles "Calendar On":
--    - calendar_enabled = true
--    - profile_visible = true  (profile becomes visible again)
--    - Their profile reappears in discover/search
-- =========================================================
