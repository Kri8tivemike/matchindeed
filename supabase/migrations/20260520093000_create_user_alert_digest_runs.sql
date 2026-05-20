-- Idempotency table for daily user alert digest emails.

CREATE TABLE IF NOT EXISTS public.user_alert_digest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  digest_type TEXT NOT NULL,
  digest_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (
      status = ANY (
        ARRAY[
          'processing'::text,
          'sent'::text,
          'skipped'::text,
          'failed'::text
        ]
      )
    ),
  count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  UNIQUE (user_id, digest_type, digest_date)
);

CREATE INDEX IF NOT EXISTS idx_user_alert_digest_runs_date_type
  ON public.user_alert_digest_runs(digest_date DESC, digest_type);

CREATE INDEX IF NOT EXISTS idx_user_alert_digest_runs_user_created
  ON public.user_alert_digest_runs(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_user_alert_digest_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_alert_digest_runs_updated_at
  ON public.user_alert_digest_runs;

CREATE TRIGGER trg_user_alert_digest_runs_updated_at
  BEFORE UPDATE ON public.user_alert_digest_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_alert_digest_runs_updated_at();

ALTER TABLE public.user_alert_digest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_alert_digest_runs_admin_select
  ON public.user_alert_digest_runs;

CREATE POLICY user_alert_digest_runs_admin_select
  ON public.user_alert_digest_runs
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());
