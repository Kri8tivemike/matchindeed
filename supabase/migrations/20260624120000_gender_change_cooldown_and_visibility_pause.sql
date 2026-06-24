-- Enforce gender-change cooldowns, record safety pauses, and block direct
-- browser-side gender mutations.

CREATE TABLE IF NOT EXISTS public.gender_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  old_gender TEXT,
  new_gender TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pause_until TIMESTAMPTZ NOT NULL,
  previous_profile_visible BOOLEAN NOT NULL DEFAULT TRUE,
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,
  restored_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_gender_change_events_user_changed
  ON public.gender_change_events(user_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_gender_change_events_pause_due
  ON public.gender_change_events(pause_until)
  WHERE restored_at IS NULL;

ALTER TABLE public.gender_change_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.gender_change_events TO authenticated;
GRANT ALL ON public.gender_change_events TO service_role;

DROP POLICY IF EXISTS gender_change_events_select_own
  ON public.gender_change_events;
CREATE POLICY gender_change_events_select_own
  ON public.gender_change_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS gender_change_events_service_all
  ON public.gender_change_events;
CREATE POLICY gender_change_events_service_all
  ON public.gender_change_events
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE OR REPLACE FUNCTION public.handle_user_profile_gender_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_latest_changed_at TIMESTAMPTZ;
  v_next_eligible_at TIMESTAMPTZ;
  v_previous_profile_visible BOOLEAN;
  v_pause_until TIMESTAMPTZ;
  v_partner_gender_preference TEXT;
BEGIN
  IF OLD.gender IS NOT DISTINCT FROM NEW.gender THEN
    RETURN NEW;
  END IF;

  v_role := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '');

  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION
      'Gender changes must be submitted through the secure profile update endpoint.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Treat filling an empty legacy gender as initial setup, not a regulated change.
  IF OLD.gender IS NULL OR BTRIM(COALESCE(OLD.gender, '')) = '' THEN
    RETURN NEW;
  END IF;

  SELECT gce.changed_at
  INTO v_latest_changed_at
  FROM public.gender_change_events gce
  WHERE gce.user_id = NEW.user_id
  ORDER BY gce.changed_at DESC
  LIMIT 1;

  IF v_latest_changed_at IS NOT NULL THEN
    v_next_eligible_at := v_latest_changed_at + INTERVAL '90 days';
    IF v_next_eligible_at > NOW() THEN
      RAISE EXCEPTION
        'Gender can only be changed once every 90 days. You can change it again on %.',
        to_char(v_next_eligible_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT COALESCE(a.profile_visible, TRUE)
  INTO v_previous_profile_visible
  FROM public.accounts a
  WHERE a.id = NEW.user_id
  FOR UPDATE;

  v_pause_until := NOW() + INTERVAL '24 hours';

  IF NEW.gender = 'male' THEN
    v_partner_gender_preference := 'female';
  ELSIF NEW.gender = 'female' THEN
    v_partner_gender_preference := 'male';
  ELSE
    v_partner_gender_preference := NULL;
  END IF;

  UPDATE public.accounts
  SET
    profile_visible = FALSE,
    profile_status = 'hidden'
  WHERE id = NEW.user_id;

  INSERT INTO public.user_preferences (user_id, partner_gender_preference)
  VALUES (NEW.user_id, v_partner_gender_preference)
  ON CONFLICT (user_id)
  DO UPDATE SET partner_gender_preference = EXCLUDED.partner_gender_preference;

  INSERT INTO public.gender_change_events (
    user_id,
    old_gender,
    new_gender,
    pause_until,
    previous_profile_visible,
    metadata
  )
  VALUES (
    NEW.user_id,
    OLD.gender,
    NEW.gender,
    v_pause_until,
    COALESCE(v_previous_profile_visible, TRUE),
    jsonb_build_object(
      'source', 'user_profiles_gender_update_trigger',
      'partner_gender_preference', v_partner_gender_preference
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_gender_update
  ON public.user_profiles;

CREATE TRIGGER trg_user_profiles_gender_update
  BEFORE UPDATE OF gender ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_profile_gender_update();
