-- =========================================================
-- Migration: Add blocked locations to user_preferences
-- =========================================================
-- Allows users to block specific countries/locations.
-- Users from blocked locations cannot contact or appear
-- in the user's discover/search results.
-- =========================================================

-- Add blocked_locations column (JSON array of location strings)
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS blocked_locations JSONB DEFAULT '[]'::jsonb;

-- =========================================================
-- Example usage:
--   blocked_locations = ["Nigeria", "London, United Kingdom"]
--
-- The filter matches against the user_profiles.location field
-- using case-insensitive partial matching.
-- =========================================================
