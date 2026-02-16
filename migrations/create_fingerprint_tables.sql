-- ============================================================
-- Device Fingerprint Tables for Fraud Detection
-- Run this migration in Supabase SQL Editor
-- ============================================================

-- Stores fingerprint events (login, signup, payment, etc.)
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  event_type TEXT NOT NULL DEFAULT 'login',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by visitor ID (fraud checks)
CREATE INDEX IF NOT EXISTS idx_fingerprints_visitor ON device_fingerprints(visitor_id);

-- Index for fast lookups by user (admin panel)
CREATE INDEX IF NOT EXISTS idx_fingerprints_user ON device_fingerprints(user_id);

-- Index for time-based queries (recent activity)
CREATE INDEX IF NOT EXISTS idx_fingerprints_created ON device_fingerprints(created_at DESC);

-- Stores banned/blocked device fingerprints
CREATE TABLE IF NOT EXISTS banned_fingerprints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id TEXT NOT NULL UNIQUE,
  reason TEXT,
  banned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast ban lookups
CREATE INDEX IF NOT EXISTS idx_banned_visitor ON banned_fingerprints(visitor_id);

-- Enable RLS
ALTER TABLE device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE banned_fingerprints ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write fingerprints (no client access)
CREATE POLICY "Service role full access to device_fingerprints"
  ON device_fingerprints
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to banned_fingerprints"
  ON banned_fingerprints
  FOR ALL
  USING (auth.role() = 'service_role');
