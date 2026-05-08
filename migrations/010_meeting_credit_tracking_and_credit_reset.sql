ALTER TABLE meetings ADD COLUMN IF NOT EXISTS requester_credit_cost INTEGER DEFAULT 1;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS accepter_credit_cost INTEGER DEFAULT 0;

ALTER TABLE credits ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

UPDATE credits
SET last_reset_at = COALESCE(last_reset_at, updated_at, NOW());
