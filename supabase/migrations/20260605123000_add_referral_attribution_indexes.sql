-- Improve Growth Manager attribution reporting for referral signups.

CREATE INDEX IF NOT EXISTS idx_referrals_source
  ON public.referrals(source);

CREATE INDEX IF NOT EXISTS idx_referrals_metadata_utm_source
  ON public.referrals ((metadata->>'utm_source'));

CREATE INDEX IF NOT EXISTS idx_referrals_metadata_utm_campaign
  ON public.referrals ((metadata->>'utm_campaign'));

CREATE INDEX IF NOT EXISTS idx_referrals_metadata_signup_source
  ON public.referrals ((metadata->>'signup_source'));
