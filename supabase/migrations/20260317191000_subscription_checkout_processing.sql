CREATE TABLE IF NOT EXISTS public.subscription_checkout_processing (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  stripe_subscription_id TEXT,
  amount_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  processing_token TEXT,
  credits_allocated INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_checkout_processing_user_id
  ON public.subscription_checkout_processing(user_id);

CREATE INDEX IF NOT EXISTS idx_subscription_checkout_processing_status
  ON public.subscription_checkout_processing(status);

ALTER TABLE public.subscription_checkout_processing ENABLE ROW LEVEL SECURITY;
