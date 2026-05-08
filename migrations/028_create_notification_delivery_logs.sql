-- Capture durable notification delivery outcomes for push analytics and support.

CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'push'
    CHECK (channel = ANY (ARRAY['push'::text, 'email'::text, 'inapp'::text])),
  notification_type TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (
      status = ANY (
        ARRAY[
          'sent'::text,
          'skipped_preference'::text,
          'quieted_recent_activity'::text,
          'missing_config'::text,
          'failed_provider'::text,
          'error'::text
        ]
      )
    ),
  provider TEXT,
  title TEXT,
  url TEXT,
  reason TEXT,
  provider_notification_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_created_at
  ON public.notification_delivery_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_user_created
  ON public.notification_delivery_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_status_created
  ON public.notification_delivery_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_logs_type_created
  ON public.notification_delivery_logs (notification_type, created_at DESC);

ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_delivery_logs_admin_select
  ON public.notification_delivery_logs;

CREATE POLICY notification_delivery_logs_admin_select
  ON public.notification_delivery_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());
