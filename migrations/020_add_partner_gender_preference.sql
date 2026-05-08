-- Persist onboarding "who are you interested in?" as a hard discover/search constraint.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS partner_gender_preference TEXT;

ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_partner_gender_preference_check;

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_partner_gender_preference_check
  CHECK (
    partner_gender_preference IS NULL
    OR partner_gender_preference = ANY (ARRAY['male', 'female'])
  ) NOT VALID;
