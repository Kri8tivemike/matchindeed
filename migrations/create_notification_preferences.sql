-- ============================================================
-- Migration: Create notification_preferences table
-- Purpose: Store per-user notification/email delivery preferences.
--          Each row controls whether a specific notification
--          category is delivered via in-app, email, or push.
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- ---- Activity notifications ----
  likes_inapp       BOOLEAN DEFAULT TRUE,   -- Likes / winks / interested
  likes_email       BOOLEAN DEFAULT TRUE,
  likes_push        BOOLEAN DEFAULT TRUE,

  -- ---- Match notifications ----
  matches_inapp     BOOLEAN DEFAULT TRUE,   -- Mutual matches
  matches_email     BOOLEAN DEFAULT TRUE,
  matches_push      BOOLEAN DEFAULT TRUE,

  -- ---- Message notifications ----
  messages_inapp    BOOLEAN DEFAULT TRUE,   -- New messages
  messages_email    BOOLEAN DEFAULT TRUE,
  messages_push     BOOLEAN DEFAULT TRUE,

  -- ---- Meeting notifications ----
  meetings_inapp    BOOLEAN DEFAULT TRUE,   -- Meeting requests, reminders, cancellations
  meetings_email    BOOLEAN DEFAULT TRUE,
  meetings_push     BOOLEAN DEFAULT TRUE,

  -- ---- Profile view notifications ----
  views_inapp       BOOLEAN DEFAULT TRUE,   -- Profile views
  views_email       BOOLEAN DEFAULT FALSE,  -- Off by default (can be noisy)
  views_push        BOOLEAN DEFAULT FALSE,

  -- ---- System / Account notifications ----
  system_inapp      BOOLEAN DEFAULT TRUE,   -- Account warnings, investigations, refunds
  system_email      BOOLEAN DEFAULT TRUE,
  system_push       BOOLEAN DEFAULT TRUE,

  -- ---- Marketing / Promotional ----
  marketing_email   BOOLEAN DEFAULT FALSE,  -- Off by default (opt-in)

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  -- One row per user
  UNIQUE(user_id)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);
