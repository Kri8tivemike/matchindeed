CREATE TABLE IF NOT EXISTS public.engagement_read_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  received_seen_at TIMESTAMPTZ,
  views_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.engagement_read_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their engagement read state"
  ON public.engagement_read_state;
CREATE POLICY "Users can view their engagement read state"
  ON public.engagement_read_state
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their engagement read state"
  ON public.engagement_read_state;
CREATE POLICY "Users can insert their engagement read state"
  ON public.engagement_read_state
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their engagement read state"
  ON public.engagement_read_state;
CREATE POLICY "Users can update their engagement read state"
  ON public.engagement_read_state
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Existing members start clean so old activity is not presented as newly unseen.
INSERT INTO public.engagement_read_state (
  user_id,
  received_seen_at,
  views_seen_at
)
SELECT id, NOW(), NOW()
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

