-- Tighten remaining permissive policies, harden function search_path, and
-- validate user profile constraints after cleaning legacy invalid data.

-- ---------------------------------------------------------------------------
-- Remove permissive INSERT policies flagged as WITH CHECK true
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS meetings_insert ON public.meetings;
CREATE POLICY meetings_insert
  ON public.meetings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin_user()
    OR host_id = auth.uid()
  );

DROP POLICY IF EXISTS meeting_participants_insert ON public.meeting_participants;
CREATE POLICY meeting_participants_insert
  ON public.meeting_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin_user()
    OR user_id = auth.uid()
    OR is_meeting_host(meeting_id)
  );

DROP POLICY IF EXISTS wallet_transactions_insert ON public.wallet_transactions;
CREATE POLICY wallet_transactions_insert
  ON public.wallet_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "Service role can insert relationship agreements"
  ON public.relationship_agreements;
CREATE POLICY "Service role can insert relationship agreements"
  ON public.relationship_agreements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin_user()
    OR (
      (auth.uid() = user1_id OR auth.uid() = user2_id)
      AND EXISTS (
        SELECT 1
        FROM public.user_matches um
        WHERE um.id = relationship_agreements.match_id
          AND (
            (um.user1_id = relationship_agreements.user1_id AND um.user2_id = relationship_agreements.user2_id)
            OR
            (um.user1_id = relationship_agreements.user2_id AND um.user2_id = relationship_agreements.user1_id)
          )
          AND (
            relationship_agreements.meeting_id IS NULL
            OR um.meeting_id = relationship_agreements.meeting_id
          )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Harden function search_path (remediates mutable search_path warnings)
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.auto_set_admin_role() SET search_path = public;
ALTER FUNCTION public.is_admin_user() SET search_path = public;
ALTER FUNCTION public.is_meeting_host(uuid) SET search_path = public;
ALTER FUNCTION public.set_account_deletion_requests_updated_at() SET search_path = public;
ALTER FUNCTION public.set_admin_role_on_signup() SET search_path = public;
ALTER FUNCTION public.set_user_as_admin(text, text) SET search_path = public;
ALTER FUNCTION public.update_host_earnings_updated_at() SET search_path = public;
ALTER FUNCTION public.update_host_meetings_updated_at() SET search_path = public;
ALTER FUNCTION public.update_host_profiles_updated_at() SET search_path = public;
ALTER FUNCTION public.update_host_reports_updated_at() SET search_path = public;
ALTER FUNCTION public.update_match_last_message() SET search_path = public;
ALTER FUNCTION public.update_profile_reactivation_requests_updated_at() SET search_path = public;
ALTER FUNCTION public.update_relationship_agreements_updated_at_fn() SET search_path = public;

-- ---------------------------------------------------------------------------
-- Cleanup and validate user profile constraints
-- ---------------------------------------------------------------------------
UPDATE public.user_profiles
SET date_of_birth = NULL
WHERE date_of_birth IS NOT NULL
  AND date_of_birth > ((CURRENT_DATE - INTERVAL '18 years')::date);

ALTER TABLE public.user_profiles
  VALIDATE CONSTRAINT user_profiles_relationship_status_check;

ALTER TABLE public.user_profiles
  VALIDATE CONSTRAINT user_profiles_minimum_age_18;
