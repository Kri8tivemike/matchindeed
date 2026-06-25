-- Add admin approval lifecycle to gender-change safety pauses.

ALTER TABLE public.gender_change_events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending_approval',
  ADD COLUMN IF NOT EXISTS verification_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_reviewed_by UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gender_change_events_status_check'
  ) THEN
    ALTER TABLE public.gender_change_events
      ADD CONSTRAINT gender_change_events_status_check
      CHECK (
        status = ANY (
          ARRAY[
            'pending_verification',
            'pending_approval',
            'approved',
            'rejected',
            'restored'
          ]
        )
      );
  END IF;
END $$;

UPDATE public.gender_change_events
SET
  status = COALESCE(status, 'pending_approval'),
  verification_completed_at = COALESCE(verification_completed_at, changed_at)
WHERE status IS NULL OR verification_completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gender_change_events_status_changed
  ON public.gender_change_events(status, changed_at DESC);

DROP INDEX IF EXISTS idx_gender_change_events_pause_due;
CREATE INDEX IF NOT EXISTS idx_gender_change_events_pause_due
  ON public.gender_change_events(pause_until)
  WHERE restored_at IS NULL AND status = 'approved';

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
    status,
    verification_completed_at,
    metadata
  )
  VALUES (
    NEW.user_id,
    OLD.gender,
    NEW.gender,
    v_pause_until,
    COALESCE(v_previous_profile_visible, TRUE),
    'pending_approval',
    NOW(),
    jsonb_build_object(
      'source', 'user_profiles_gender_update_trigger',
      'partner_gender_preference', v_partner_gender_preference
    )
  );

  RETURN NEW;
END;
$$;
