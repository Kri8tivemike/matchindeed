-- Create reactivation_requests table for managing profile reactivation workflow
CREATE TABLE IF NOT EXISTS reactivation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES user_matches(id) ON DELETE CASCADE,
  reason_id INTEGER NOT NULL,
  custom_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'auto_approved')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reactivation_requests_user_id ON reactivation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_reactivation_requests_match_id ON reactivation_requests(match_id);
CREATE INDEX IF NOT EXISTS idx_reactivation_requests_status ON reactivation_requests(status);
CREATE INDEX IF NOT EXISTS idx_reactivation_requests_expires_at ON reactivation_requests(expires_at);

-- Enable RLS on reactivation_requests table
ALTER TABLE reactivation_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own reactivation requests
CREATE POLICY "Users can view own reactivation requests" ON reactivation_requests
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can create reactivation requests
CREATE POLICY "Users can create reactivation requests" ON reactivation_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own pending requests
CREATE POLICY "Users can update own reactivation requests" ON reactivation_requests
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reactivation_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_reactivation_requests_updated_at ON reactivation_requests;
CREATE TRIGGER update_reactivation_requests_updated_at
  BEFORE UPDATE ON reactivation_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_reactivation_requests_updated_at();
