-- Phase 1 credit model alignment for local/manual migrations.
ALTER TABLE subscription_pricing ADD COLUMN IF NOT EXISTS monthly_credits INTEGER DEFAULT 0;
ALTER TABLE subscription_pricing ADD COLUMN IF NOT EXISTS bonus_credits INTEGER DEFAULT 0;
ALTER TABLE subscription_pricing ADD COLUMN IF NOT EXISTS credit_price NUMERIC(10, 2) DEFAULT 0;

UPDATE subscription_pricing SET monthly_credits = 5, bonus_credits = 20, credit_price = 150 WHERE tier_id = 'basic';
UPDATE subscription_pricing SET monthly_credits = 10, bonus_credits = 40, credit_price = 200 WHERE tier_id = 'standard';
UPDATE subscription_pricing SET monthly_credits = 30, bonus_credits = 80, credit_price = 250 WHERE tier_id = 'premium';
UPDATE subscription_pricing SET monthly_credits = 999999, bonus_credits = 0, credit_price = 0 WHERE tier_id = 'vip';

UPDATE account_tier_config SET monthly_outgoing_credits = 5 WHERE tier = 'basic';
UPDATE account_tier_config SET monthly_outgoing_credits = 10 WHERE tier = 'standard';
UPDATE account_tier_config SET monthly_outgoing_credits = 30 WHERE tier = 'premium';
UPDATE account_tier_config SET monthly_outgoing_credits = 999999 WHERE tier = 'vip';

-- Align one-on-one tier permissions with the client pricing matrix.
UPDATE account_tier_config
SET
  can_one_on_one_to_basic = false,
  can_one_on_one_to_standard = false,
  can_one_on_one_to_premium = false,
  can_one_on_one_to_vip = false
WHERE tier = 'basic';

UPDATE account_tier_config
SET
  can_one_on_one_to_basic = true,
  can_one_on_one_to_standard = true,
  can_one_on_one_to_premium = false,
  can_one_on_one_to_vip = false
WHERE tier = 'standard';

UPDATE account_tier_config
SET
  can_one_on_one_to_basic = true,
  can_one_on_one_to_standard = true,
  can_one_on_one_to_premium = true,
  can_one_on_one_to_vip = false
WHERE tier = 'premium';

UPDATE account_tier_config
SET
  can_one_on_one_to_basic = true,
  can_one_on_one_to_standard = true,
  can_one_on_one_to_premium = true,
  can_one_on_one_to_vip = true
WHERE tier = 'vip';
