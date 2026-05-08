-- Align account lifecycle statuses with app logic and harden exposed public tables.

-- ---------------------------------------------------------------------------
-- accounts: fix lifecycle status constraint + secure default role
-- ---------------------------------------------------------------------------
ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_account_status_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_account_status_check
  CHECK (
    account_status = ANY (
      ARRAY[
        'active',
        'suspended',
        'banned',
        'pending_verification',
        'deactivated',
        'deletion_requested'
      ]
    )
  ) NOT VALID;

ALTER TABLE public.accounts
  VALIDATE CONSTRAINT accounts_account_status_check;

ALTER TABLE public.accounts
  ALTER COLUMN role SET DEFAULT 'user'::user_role;

-- ---------------------------------------------------------------------------
-- Exposed tables: enable RLS and remove broad grants
-- ---------------------------------------------------------------------------
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_rule_acknowledgments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_deletion_requests FROM anon, authenticated;
REVOKE ALL ON TABLE public.blocked_users FROM anon, authenticated;
REVOKE ALL ON TABLE public.credit_transactions FROM anon, authenticated;
REVOKE ALL ON TABLE public.meeting_rule_acknowledgments FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- account_deletion_requests policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS account_deletion_requests_select_own_or_admin
  ON public.account_deletion_requests;
DROP POLICY IF EXISTS account_deletion_requests_insert_own
  ON public.account_deletion_requests;
DROP POLICY IF EXISTS account_deletion_requests_update_admin
  ON public.account_deletion_requests;
DROP POLICY IF EXISTS account_deletion_requests_delete_admin
  ON public.account_deletion_requests;

CREATE POLICY account_deletion_requests_select_own_or_admin
  ON public.account_deletion_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin_user());

CREATE POLICY account_deletion_requests_insert_own
  ON public.account_deletion_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE POLICY account_deletion_requests_update_admin
  ON public.account_deletion_requests
  FOR UPDATE
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

CREATE POLICY account_deletion_requests_delete_admin
  ON public.account_deletion_requests
  FOR DELETE
  TO authenticated
  USING (is_admin_user());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.account_deletion_requests
  TO authenticated;

-- ---------------------------------------------------------------------------
-- blocked_users policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS blocked_users_select_owner_or_admin
  ON public.blocked_users;
DROP POLICY IF EXISTS blocked_users_insert_self_as_blocker
  ON public.blocked_users;
DROP POLICY IF EXISTS blocked_users_update_owner_or_admin
  ON public.blocked_users;
DROP POLICY IF EXISTS blocked_users_delete_owner_or_admin
  ON public.blocked_users;

CREATE POLICY blocked_users_select_owner_or_admin
  ON public.blocked_users
  FOR SELECT
  TO authenticated
  USING (
    blocker_id = auth.uid()
    OR blocked_id = auth.uid()
    OR is_admin_user()
  );

CREATE POLICY blocked_users_insert_self_as_blocker
  ON public.blocked_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    blocker_id = auth.uid()
    AND blocked_id <> auth.uid()
  );

CREATE POLICY blocked_users_update_owner_or_admin
  ON public.blocked_users
  FOR UPDATE
  TO authenticated
  USING (blocker_id = auth.uid() OR is_admin_user())
  WITH CHECK (blocker_id = auth.uid() OR is_admin_user());

CREATE POLICY blocked_users_delete_owner_or_admin
  ON public.blocked_users
  FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid() OR is_admin_user());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.blocked_users
  TO authenticated;

-- ---------------------------------------------------------------------------
-- credit_transactions policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS credit_transactions_select_own_or_admin
  ON public.credit_transactions;
DROP POLICY IF EXISTS credit_transactions_insert_admin
  ON public.credit_transactions;
DROP POLICY IF EXISTS credit_transactions_update_admin
  ON public.credit_transactions;
DROP POLICY IF EXISTS credit_transactions_delete_admin
  ON public.credit_transactions;

CREATE POLICY credit_transactions_select_own_or_admin
  ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin_user());

CREATE POLICY credit_transactions_insert_admin
  ON public.credit_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_user());

CREATE POLICY credit_transactions_update_admin
  ON public.credit_transactions
  FOR UPDATE
  TO authenticated
  USING (is_admin_user())
  WITH CHECK (is_admin_user());

CREATE POLICY credit_transactions_delete_admin
  ON public.credit_transactions
  FOR DELETE
  TO authenticated
  USING (is_admin_user());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.credit_transactions
  TO authenticated;

-- ---------------------------------------------------------------------------
-- meeting_rule_acknowledgments policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS meeting_rule_ack_select_own_or_admin
  ON public.meeting_rule_acknowledgments;
DROP POLICY IF EXISTS meeting_rule_ack_insert_participant
  ON public.meeting_rule_acknowledgments;
DROP POLICY IF EXISTS meeting_rule_ack_update_participant_or_admin
  ON public.meeting_rule_acknowledgments;
DROP POLICY IF EXISTS meeting_rule_ack_delete_admin
  ON public.meeting_rule_acknowledgments;

CREATE POLICY meeting_rule_ack_select_own_or_admin
  ON public.meeting_rule_acknowledgments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin_user());

CREATE POLICY meeting_rule_ack_insert_participant
  ON public.meeting_rule_acknowledgments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.meeting_participants mp
      WHERE mp.meeting_id = meeting_rule_acknowledgments.meeting_id
        AND mp.user_id = auth.uid()
    )
  );

CREATE POLICY meeting_rule_ack_update_participant_or_admin
  ON public.meeting_rule_acknowledgments
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR is_admin_user())
  WITH CHECK (
    is_admin_user()
    OR (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.meeting_participants mp
        WHERE mp.meeting_id = meeting_rule_acknowledgments.meeting_id
          AND mp.user_id = auth.uid()
      )
    )
  );

CREATE POLICY meeting_rule_ack_delete_admin
  ON public.meeting_rule_acknowledgments
  FOR DELETE
  TO authenticated
  USING (is_admin_user());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.meeting_rule_acknowledgments
  TO authenticated;
