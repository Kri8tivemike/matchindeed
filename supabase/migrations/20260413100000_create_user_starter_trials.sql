CREATE TABLE IF NOT EXISTS public.user_starter_trials (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_slot_id UUID NULL REFERENCES public.meeting_availability(id) ON DELETE SET NULL,
  consumed_meeting_id UUID NULL REFERENCES public.meetings(id) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_starter_trials_active_slot_id
  ON public.user_starter_trials (active_slot_id);

CREATE INDEX IF NOT EXISTS idx_user_starter_trials_consumed_meeting_id
  ON public.user_starter_trials (consumed_meeting_id);

CREATE OR REPLACE FUNCTION public.update_user_starter_trials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_starter_trials_updated_at
  ON public.user_starter_trials;

CREATE TRIGGER trg_user_starter_trials_updated_at
BEFORE UPDATE ON public.user_starter_trials
FOR EACH ROW
EXECUTE FUNCTION public.update_user_starter_trials_updated_at();

ALTER TABLE public.user_starter_trials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own starter trial"
  ON public.user_starter_trials;

CREATE POLICY "Users can view their own starter trial"
  ON public.user_starter_trials
  FOR SELECT
  USING (auth.uid() = user_id);
