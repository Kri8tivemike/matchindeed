-- =========================================================
-- Migration: Schedule admin/coordinator meeting reminders
-- Purpose:
--   Ensure upcoming confirmed meetings have 30-minute and
--   10-minute reminders for meeting users, active admins, and
--   coordinators assigned as meeting participants.
-- =========================================================

UPDATE public.meeting_coordinators AS coordinator
SET user_id = account.id
FROM public.accounts AS account
WHERE coordinator.user_id IS NULL
  AND lower(coordinator.email) = lower(account.email);

CREATE INDEX IF NOT EXISTS idx_meeting_notifications_due_unsent
  ON public.meeting_notifications(sent_at)
  WHERE (
    email_sent IS DISTINCT FROM TRUE
    OR dashboard_sent IS DISTINCT FROM TRUE
  );

WITH future_confirmed_meetings AS (
  SELECT id, scheduled_at
  FROM public.meetings
  WHERE status = 'confirmed'
    AND scheduled_at > now()
),
reminder_types(notification_type, offset_interval) AS (
  VALUES
    ('30min', interval '30 minutes'),
    ('10min', interval '10 minutes')
),
reminder_recipients AS (
  SELECT meeting.id AS meeting_id, participant.user_id
  FROM future_confirmed_meetings AS meeting
  JOIN public.meeting_participants AS participant
    ON participant.meeting_id = meeting.id

  UNION

  SELECT meeting.id AS meeting_id, account.id AS user_id
  FROM future_confirmed_meetings AS meeting
  CROSS JOIN public.accounts AS account
  WHERE account.role IN ('admin', 'superadmin', 'moderator')
    AND account.account_status = 'active'

)
INSERT INTO public.meeting_notifications (
  meeting_id,
  user_id,
  notification_type,
  sent_at,
  email_sent,
  dashboard_sent
)
SELECT
  meeting.id,
  recipient.user_id,
  reminder.notification_type,
  meeting.scheduled_at - reminder.offset_interval,
  FALSE,
  FALSE
FROM future_confirmed_meetings AS meeting
JOIN reminder_recipients AS recipient
  ON recipient.meeting_id = meeting.id
CROSS JOIN reminder_types AS reminder
WHERE meeting.scheduled_at - reminder.offset_interval > now()
ON CONFLICT (meeting_id, user_id, notification_type) DO NOTHING;
