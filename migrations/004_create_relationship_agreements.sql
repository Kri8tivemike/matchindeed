-- Create relationship_agreements table
CREATE TABLE IF NOT EXISTS relationship_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES user_matches(id) ON DELETE CASCADE,
  user1_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  agreement_text TEXT NOT NULL,
  signed_by_user1_at TIMESTAMP WITH TIME ZONE,
  signed_by_user2_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_relationship_agreements_match_id ON relationship_agreements(match_id);
CREATE INDEX IF NOT EXISTS idx_relationship_agreements_user1_id ON relationship_agreements(user1_id);
CREATE INDEX IF NOT EXISTS idx_relationship_agreements_user2_id ON relationship_agreements(user2_id);
CREATE INDEX IF NOT EXISTS idx_relationship_agreements_status ON relationship_agreements(status);

-- Enable Row Level Security
ALTER TABLE relationship_agreements ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view agreements they are part of
CREATE POLICY "Users can view their own agreements"
  ON relationship_agreements
  FOR SELECT
  USING (
    auth.uid() = user1_id OR
    auth.uid() = user2_id OR
    (SELECT role FROM accounts WHERE id = auth.uid()) IN ('admin', 'superadmin', 'moderator')
  );

-- RLS Policy: Users can insert agreements (system only - via service role)
CREATE POLICY "System can create agreements"
  ON relationship_agreements
  FOR INSERT
  WITH CHECK (true);

-- RLS Policy: Users can update agreements (sign agreements)
CREATE POLICY "Users can sign their own agreements"
  ON relationship_agreements
  FOR UPDATE
  USING (
    auth.uid() = user1_id OR
    auth.uid() = user2_id
  )
  WITH CHECK (
    auth.uid() = user1_id OR
    auth.uid() = user2_id
  );

-- Grant permissions
GRANT SELECT, UPDATE ON relationship_agreements TO authenticated;
GRANT ALL ON relationship_agreements TO service_role;

-- Add trigger for updated_at
CREATE TRIGGER update_relationship_agreements_updated_at
  BEFORE UPDATE ON relationship_agreements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
