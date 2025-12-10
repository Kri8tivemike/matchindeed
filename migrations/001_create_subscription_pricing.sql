-- Migration: Create subscription_pricing table for admin-configurable pricing
-- This table allows administrators to override default subscription pricing

-- Create subscription_pricing table
CREATE TABLE IF NOT EXISTS subscription_pricing (
  tier_id TEXT PRIMARY KEY CHECK (tier_id IN ('basic', 'standard', 'premium', 'vip')),
  price_ngn NUMERIC(12, 2) NOT NULL CHECK (price_ngn >= 0),
  price_usd NUMERIC(10, 2) NOT NULL CHECK (price_usd >= 0),
  price_gbp NUMERIC(10, 2) NOT NULL CHECK (price_gbp >= 0),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on updated_at for faster queries
CREATE INDEX IF NOT EXISTS idx_subscription_pricing_updated_at ON subscription_pricing(updated_at);

-- Enable Row Level Security (RLS)
ALTER TABLE subscription_pricing ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to read pricing (public information)
CREATE POLICY "Allow public read access to subscription pricing"
  ON subscription_pricing
  FOR SELECT
  USING (true);

-- Policy: Only admins can insert/update pricing
-- Note: You'll need to implement admin role checking in your application
-- For now, this allows service role to manage pricing
CREATE POLICY "Allow service role to manage subscription pricing"
  ON subscription_pricing
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Insert default pricing (can be overridden by admins)
INSERT INTO subscription_pricing (tier_id, price_ngn, price_usd, price_gbp)
VALUES
  ('basic', 10000.00, 7.00, 5.50),
  ('standard', 31500.00, 20.00, 16.00),
  ('premium', 63000.00, 43.00, 34.00),
  ('vip', 1500000.00, 1000.00, 800.00)
ON CONFLICT (tier_id) DO NOTHING;

-- Add comment to table
COMMENT ON TABLE subscription_pricing IS 'Stores admin-configurable subscription pricing for all tiers in multiple currencies';
COMMENT ON COLUMN subscription_pricing.tier_id IS 'Subscription tier: basic, standard, premium, or vip';
COMMENT ON COLUMN subscription_pricing.price_ngn IS 'Price in Nigerian Naira';
COMMENT ON COLUMN subscription_pricing.price_usd IS 'Price in US Dollars';
COMMENT ON COLUMN subscription_pricing.price_gbp IS 'Price in British Pounds';
COMMENT ON COLUMN subscription_pricing.updated_by IS 'User ID of the admin who last updated this pricing';
