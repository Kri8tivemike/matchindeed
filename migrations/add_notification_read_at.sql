-- ============================================================================
-- Migration: Add read_at column to notifications table
-- Description: Enables tracking when a notification was read by the user.
--              If read_at IS NULL, the notification is unread.
--              If read_at has a timestamp, the notification is read.
-- ============================================================================

-- Add read_at column (nullable timestamp, defaults to NULL = unread)
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for efficient unread notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON notifications (user_id, read_at)
WHERE read_at IS NULL;

-- Create index for efficient notification listing (newest first)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON notifications (user_id, created_at DESC);

-- Enable Realtime for the notifications table (for live notification updates)
-- Run this in the Supabase Dashboard SQL editor:
-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============================================================================
-- VERIFICATION: Run this to confirm the migration was applied
-- ============================================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'notifications' AND column_name = 'read_at';
