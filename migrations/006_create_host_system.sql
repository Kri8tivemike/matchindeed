-- Host System Tables and Policies
-- Created: 2026-02-17
-- Phase 5: Admin & Host Management

-- 1. Host Profiles Table
CREATE TABLE IF NOT EXISTS host_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    host_type TEXT NOT NULL CHECK (host_type IN ('basic', 'premium', 'vip')),
    commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    two_fa_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_host_profiles_user_id ON host_profiles(user_id);
CREATE INDEX idx_host_profiles_is_active ON host_profiles(is_active);
CREATE INDEX idx_host_profiles_host_type ON host_profiles(host_type);

-- 2. Host Meetings Table
CREATE TABLE IF NOT EXISTS host_meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    report_submitted BOOLEAN NOT NULL DEFAULT false,
    success_marked BOOLEAN,
    notes TEXT,
    video_recording_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(host_id, meeting_id)
);

CREATE INDEX idx_host_meetings_host_id ON host_meetings(host_id);
CREATE INDEX idx_host_meetings_meeting_id ON host_meetings(meeting_id);
CREATE INDEX idx_host_meetings_report_submitted ON host_meetings(report_submitted);
CREATE INDEX idx_host_meetings_success_marked ON host_meetings(success_marked);

-- 3. Host Earnings Table
CREATE TABLE IF NOT EXISTS host_earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES host_profiles(id) ON DELETE CASCADE,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(host_id, meeting_id)
);

CREATE INDEX idx_host_earnings_host_id ON host_earnings(host_id);
CREATE INDEX idx_host_earnings_meeting_id ON host_earnings(meeting_id);
CREATE INDEX idx_host_earnings_status ON host_earnings(status);
CREATE INDEX idx_host_earnings_paid_at ON host_earnings(paid_at);

-- Row Level Security Policies

-- Host Profiles RLS
ALTER TABLE host_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own host profile"
ON host_profiles FOR SELECT
USING (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can update their own host profile"
ON host_profiles FOR UPDATE
USING (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.uid() = user_id OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Only admins can insert host profiles"
ON host_profiles FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Host Meetings RLS
ALTER TABLE host_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view their own meetings"
ON host_meetings FOR SELECT
USING (
    host_id IN (SELECT id FROM host_profiles WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'role' = 'admin'
);

CREATE POLICY "Hosts can update their own meeting reports"
ON host_meetings FOR UPDATE
USING (
    host_id IN (SELECT id FROM host_profiles WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'role' = 'admin'
)
WITH CHECK (
    host_id IN (SELECT id FROM host_profiles WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'role' = 'admin'
);

-- Host Earnings RLS
ALTER TABLE host_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view their own earnings"
ON host_earnings FOR SELECT
USING (
    host_id IN (SELECT id FROM host_profiles WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'role' = 'admin'
);

CREATE POLICY "Only admins can insert earnings records"
ON host_earnings FOR INSERT
WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Only admins can update earnings records"
ON host_earnings FOR UPDATE
USING (auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON host_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON host_meetings TO authenticated;
GRANT SELECT ON host_earnings TO authenticated;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_host_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER host_profiles_updated_at_trigger
BEFORE UPDATE ON host_profiles
FOR EACH ROW
EXECUTE FUNCTION update_host_profiles_updated_at();

CREATE OR REPLACE FUNCTION update_host_meetings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER host_meetings_updated_at_trigger
BEFORE UPDATE ON host_meetings
FOR EACH ROW
EXECUTE FUNCTION update_host_meetings_updated_at();

CREATE OR REPLACE FUNCTION update_host_earnings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER host_earnings_updated_at_trigger
BEFORE UPDATE ON host_earnings
FOR EACH ROW
EXECUTE FUNCTION update_host_earnings_updated_at();
