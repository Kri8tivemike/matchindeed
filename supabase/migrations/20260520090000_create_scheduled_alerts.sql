-- Generic scheduled alert queue for user lifecycle, email, and push reminders.
-- MatchIndeed applies Supabase migrations manually from the SQL editor.

CREATE TABLE IF NOT EXISTS public.scheduled_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel = ANY (ARRAY['email'::text, 'push'::text])),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status = ANY (
        ARRAY[
          'pending'::text,
          'sent'::text,
          'cancelled'::text,
          'failed'::text
        ]
      )
    ),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scheduled_alerts_due_pending
  ON public.scheduled_alerts(send_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_alerts_user_created
  ON public.scheduled_alerts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_alerts_type_status
  ON public.scheduled_alerts(alert_type, status, send_at);

CREATE OR REPLACE FUNCTION public.set_scheduled_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scheduled_alerts_updated_at
  ON public.scheduled_alerts;

CREATE TRIGGER trg_scheduled_alerts_updated_at
  BEFORE UPDATE ON public.scheduled_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_scheduled_alerts_updated_at();

ALTER TABLE public.scheduled_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_alerts_admin_select
  ON public.scheduled_alerts;

CREATE POLICY scheduled_alerts_admin_select
  ON public.scheduled_alerts
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());
