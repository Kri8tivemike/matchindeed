CREATE TABLE IF NOT EXISTS public.referral_ambassadors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'ended')),
  contract_target_referrals INTEGER NOT NULL DEFAULT 0
    CHECK (contract_target_referrals >= 0),
  contract_target_subscriptions INTEGER NOT NULL DEFAULT 0
    CHECK (contract_target_subscriptions >= 0),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_ambassadors_user_id
  ON public.referral_ambassadors(user_id);

CREATE INDEX IF NOT EXISTS idx_referral_ambassadors_status
  ON public.referral_ambassadors(status);

CREATE INDEX IF NOT EXISTS idx_referral_ambassadors_created_at
  ON public.referral_ambassadors(created_at DESC);

ALTER TABLE public.referral_ambassadors ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.referral_ambassadors TO service_role;

DROP POLICY IF EXISTS referral_ambassadors_service_only
  ON public.referral_ambassadors;

CREATE POLICY referral_ambassadors_service_only
  ON public.referral_ambassadors
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
