-- Restrict account inserts to self-provisioning authenticated users.
-- Service-role writes are unaffected.

DROP POLICY IF EXISTS "Anyone can create account" ON public.accounts;

CREATE POLICY "Anyone can create account"
  ON public.accounts
  FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() = id
    AND role = 'user'::user_role
  );
