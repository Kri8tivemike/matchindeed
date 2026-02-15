-- =========================================================
-- Migration: Create messages table for matched user messaging
-- =========================================================
-- Run this in your Supabase SQL Editor.
-- Prerequisites: user_matches table must exist.
-- =========================================================

-- 1. Create the messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES user_matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'system')),
  read_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for fast message retrieval
CREATE INDEX IF NOT EXISTS idx_messages_match_id ON messages(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(match_id, read_at) WHERE read_at IS NULL;

-- 3. Add last_message_at to user_matches for sorting conversations
ALTER TABLE user_matches ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE user_matches ADD COLUMN IF NOT EXISTS last_message_preview TEXT DEFAULT NULL;

-- 4. Enable RLS on messages table
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies: users can only see messages from their own matches
CREATE POLICY "Users can view messages in their matches" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_matches
      WHERE user_matches.id = messages.match_id
      AND (user_matches.user1_id = auth.uid() OR user_matches.user2_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert messages in their matches" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM user_matches
      WHERE user_matches.id = messages.match_id
      AND user_matches.messaging_enabled = true
      AND (user_matches.user1_id = auth.uid() OR user_matches.user2_id = auth.uid())
    )
  );

-- 6. Enable Supabase Realtime for the messages table
-- Run this separately if needed:
-- ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- 7. Create function to update last_message_at on user_matches
CREATE OR REPLACE FUNCTION update_match_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_matches
  SET last_message_at = NEW.created_at,
      last_message_preview = LEFT(NEW.content, 100)
  WHERE id = NEW.match_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger
DROP TRIGGER IF EXISTS trigger_update_match_last_message ON messages;
CREATE TRIGGER trigger_update_match_last_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_match_last_message();

-- =========================================================
-- IMPORTANT: Enable Realtime for live messaging
-- Go to Supabase Dashboard > Database > Replication
-- Enable the "messages" table for Realtime
-- Or run: ALTER PUBLICATION supabase_realtime ADD TABLE messages;
-- =========================================================
