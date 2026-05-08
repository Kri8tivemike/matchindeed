-- Allow profile view activity rows so the Likes > Views tab can load
-- the actual viewer/target relationship from user_activities.

ALTER TABLE public.user_activities
  DROP CONSTRAINT IF EXISTS user_activities_activity_type_check;

ALTER TABLE public.user_activities
  ADD CONSTRAINT user_activities_activity_type_check
  CHECK (
    activity_type = ANY (
      ARRAY[
        'wink'::text,
        'like'::text,
        'interested'::text,
        'message'::text,
        'meeting_request'::text,
        'rejected'::text,
        'profile_view'::text
      ]
    )
  );

CREATE INDEX IF NOT EXISTS idx_user_activities_profile_view_target_created
  ON public.user_activities (target_user_id, created_at DESC)
  WHERE activity_type = 'profile_view';

CREATE INDEX IF NOT EXISTS idx_user_activities_profile_view_viewer_target
  ON public.user_activities (user_id, target_user_id, created_at DESC)
  WHERE activity_type = 'profile_view';
