ALTER TABLE public.meeting_availability
ADD COLUMN IF NOT EXISTS scheduled_at_utc TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.sync_meeting_availability_scheduled_at_utc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_timezone TEXT := 'UTC';
BEGIN
  SELECT COALESCE(NULLIF(timezone, ''), 'UTC')
    INTO resolved_timezone
  FROM public.calendar_configurations
  WHERE user_id = NEW.user_id;

  NEW.scheduled_at_utc :=
    ((NEW.slot_date::text || ' ' || NEW.slot_time::text)::timestamp AT TIME ZONE resolved_timezone);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_meeting_availability_scheduled_at_utc
ON public.meeting_availability;

CREATE TRIGGER trg_sync_meeting_availability_scheduled_at_utc
BEFORE INSERT OR UPDATE OF user_id, slot_date, slot_time
ON public.meeting_availability
FOR EACH ROW
EXECUTE FUNCTION public.sync_meeting_availability_scheduled_at_utc();

UPDATE public.meeting_availability AS ma
SET scheduled_at_utc =
  ((ma.slot_date::text || ' ' || ma.slot_time::text)::timestamp AT TIME ZONE COALESCE(NULLIF(cc.timezone, ''), 'UTC'))
FROM public.calendar_configurations AS cc
WHERE cc.user_id = ma.user_id
  AND ma.scheduled_at_utc IS NULL;

UPDATE public.meeting_availability AS ma
SET scheduled_at_utc =
  ((ma.slot_date::text || ' ' || ma.slot_time::text)::timestamp AT TIME ZONE 'UTC')
WHERE ma.scheduled_at_utc IS NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_availability_scheduled_at_utc
ON public.meeting_availability (scheduled_at_utc);

CREATE INDEX IF NOT EXISTS idx_meeting_availability_user_scheduled_at_utc
ON public.meeting_availability (user_id, scheduled_at_utc);
