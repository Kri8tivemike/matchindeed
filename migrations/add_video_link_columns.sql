-- =========================================================
-- Migration: Add video meeting link columns to meetings table
-- =========================================================
-- Run this in your Supabase SQL Editor.
-- =========================================================

-- Add video meeting link columns
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS video_link TEXT DEFAULT NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS video_password TEXT DEFAULT NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS zoom_meeting_id TEXT DEFAULT NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS video_link_is_fallback BOOLEAN DEFAULT FALSE;

-- Index for quickly finding meetings with/without video links
CREATE INDEX IF NOT EXISTS idx_meetings_video_link ON meetings(video_link) WHERE video_link IS NOT NULL;

-- =========================================================
-- After running this migration:
-- 1. Configure Zoom credentials in your .env file:
--    ZOOM_ACCOUNT_ID=your_account_id
--    ZOOM_CLIENT_ID=your_client_id
--    ZOOM_CLIENT_SECRET=your_client_secret
--
-- 2. Or use without Zoom configured — a fallback meeting
--    room link will be generated automatically.
-- =========================================================
