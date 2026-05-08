-- Update subscription pricing defaults to Phase 1 client-approved values.

INSERT INTO subscription_pricing (tier_id, price_ngn, price_usd, price_gbp)
VALUES
  ('basic', 7500.00, 9.99, 7.99),
  ('standard', 15000.00, 19.99, 16.99),
  ('premium', 27000.00, 34.99, 29.99),
  ('vip', 1500000.00, 1000.00, 800.00)
ON CONFLICT (tier_id) DO UPDATE
SET
  price_ngn = EXCLUDED.price_ngn,
  price_usd = EXCLUDED.price_usd,
  price_gbp = EXCLUDED.price_gbp,
  updated_at = CURRENT_TIMESTAMP;
