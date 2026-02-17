-- Migration: Create credit system tables and columns
ALTER TABLE subscription_pricing ADD COLUMN IF NOT EXISTS monthly_credits INTEGER DEFAULT 0;
ALTER TABLE subscription_pricing ADD COLUMN IF NOT EXISTS bonus_credits INTEGER DEFAULT 0;
ALTER TABLE subscription_pricing ADD COLUMN IF NOT EXISTS credit_price NUMERIC(10, 2) DEFAULT 0;

UPDATE subscription_pricing SET monthly_credits = 100, bonus_credits = 10, credit_price = 0.10 WHERE tier_id = 'basic';
UPDATE subscription_pricing SET monthly_credits = 500, bonus_credits = 50, credit_price = 0.08 WHERE tier_id = 'standard';
UPDATE subscription_pricing SET monthly_credits = 2000, bonus_credits = 200, credit_price = 0.05 WHERE tier_id = 'premium';

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);

ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS credits_remaining INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS credits_used_this_month INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS last_reset_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();
