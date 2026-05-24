-- Make service-only referral tables explicit for Supabase security linting.

CREATE POLICY referral_fraud_checks_service_only
  ON public.referral_fraud_checks
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY referral_settings_service_only
  ON public.referral_settings
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY referral_audit_logs_service_only
  ON public.referral_audit_logs
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
