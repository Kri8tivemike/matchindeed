-- Enforce minimum platform age (18+) for new/updated user profile records.
-- Added as NOT VALID so existing legacy rows can be cleaned up separately.

ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_minimum_age_18;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_minimum_age_18
  CHECK (
    date_of_birth IS NULL
    OR date_of_birth <= ((CURRENT_DATE - INTERVAL '18 years')::date)
  ) NOT VALID;

