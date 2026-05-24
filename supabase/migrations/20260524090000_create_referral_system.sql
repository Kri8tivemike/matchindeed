-- MatchIndeed referral system: codes, relationships, rewards, settings, fraud flags, and audit logs.

ALTER TABLE public.account_permissions
  DROP CONSTRAINT IF EXISTS account_permissions_permission_check;

ALTER TABLE public.account_permissions
  ADD CONSTRAINT account_permissions_permission_check
  CHECK (
    permission IN (
      'view_users',
      'edit_users',
      'view_reports',
      'resolve_reports',
      'moderate_photos',
      'warn_users',
      'suspend_users',
      'view_meetings',
      'manage_meetings',
      'view_wallet',
      'manage_wallet',
      'view_analytics',
      'manage_pricing',
      'manage_calendar',
      'manage_hosts',
      'manage_reactivation',
      'view_logs',
      'manage_activity_limits',
      'manage_subadmins',
      'manage_2fa_auth',
      'view_referrals',
      'manage_referral_rewards',
      'manage_referral_settings',
      'review_referral_fraud',
      'view_assigned_meetings',
      'view_upcoming_meetings',
      'join_approved_meetings'
    )
  );

INSERT INTO public.admin_permissions (role, permission)
VALUES
  ('superadmin', 'view_referrals'),
  ('superadmin', 'manage_referral_rewards'),
  ('superadmin', 'manage_referral_settings'),
  ('superadmin', 'review_referral_fraud')
ON CONFLICT (role, permission) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_one_active_per_user
  ON public.referral_codes(user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id
  ON public.referral_codes(user_id);

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  referral_code_id UUID REFERENCES public.referral_codes(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'signup',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'blocked', 'reversed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referrals_no_self_referral CHECK (referrer_id <> referred_user_id),
  UNIQUE (referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id
  ON public.referrals(referrer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_created_at
  ON public.referrals(created_at DESC);

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  referrer_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  milestone TEXT NOT NULL
    CHECK (milestone IN ('profile_preferences_completed', 'first_subscription_purchased')),
  credits_awarded INTEGER NOT NULL CHECK (credits_awarded > 0),
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending_review', 'approved', 'held', 'rejected', 'reversed')),
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high', 'blocked')),
  risk_reasons TEXT[] NOT NULL DEFAULT '{}'::text[],
  approved_by UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  credit_transaction_id UUID REFERENCES public.credit_transactions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referral_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_id
  ON public.referral_rewards(referrer_id);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referred_user_id
  ON public.referral_rewards(referred_user_id);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_status
  ON public.referral_rewards(status);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_created_at
  ON public.referral_rewards(created_at DESC);

CREATE TABLE IF NOT EXISTS public.referral_fraud_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID REFERENCES public.referrals(id) ON DELETE CASCADE,
  reward_id UUID REFERENCES public.referral_rewards(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high', 'blocked')),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_fraud_checks_referral_id
  ON public.referral_fraud_checks(referral_id);

CREATE INDEX IF NOT EXISTS idx_referral_fraud_checks_reward_id
  ON public.referral_fraud_checks(reward_id);

CREATE TABLE IF NOT EXISTS public.referral_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.referral_settings (key, value, description)
VALUES
  ('profile_preferences_completed_credits', '2'::jsonb, 'Credits awarded when a referred user completes profile and preferences.'),
  ('first_subscription_purchased_credits', '2'::jsonb, 'Credits awarded when a referred user purchases their first subscription.'),
  ('auto_approve_low_risk_rewards', 'true'::jsonb, 'Automatically approve low-risk referral rewards.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.referral_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
  reward_id UUID REFERENCES public.referral_rewards(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_audit_logs_actor_id
  ON public.referral_audit_logs(actor_id);

CREATE INDEX IF NOT EXISTS idx_referral_audit_logs_created_at
  ON public.referral_audit_logs(created_at DESC);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_fraud_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_audit_logs ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.referral_codes TO service_role;
GRANT ALL ON TABLE public.referrals TO service_role;
GRANT ALL ON TABLE public.referral_rewards TO service_role;
GRANT ALL ON TABLE public.referral_fraud_checks TO service_role;
GRANT ALL ON TABLE public.referral_settings TO service_role;
GRANT ALL ON TABLE public.referral_audit_logs TO service_role;

CREATE POLICY referral_codes_select_own
  ON public.referral_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY referrals_select_participant
  ON public.referrals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

CREATE POLICY referral_rewards_select_participant
  ON public.referral_rewards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);
