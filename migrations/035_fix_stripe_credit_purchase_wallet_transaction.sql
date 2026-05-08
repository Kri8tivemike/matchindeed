-- Migration 035: Fix apply_stripe_credit_purchase to not show Stripe payments as wallet deductions.
--
-- The previous version stored amount_cents = -ABS(p_amount_cents) in wallet_transactions
-- which made Stripe credit purchases appear as wallet balance deductions in the transaction history,
-- even though the wallet balance was never actually charged (the user paid via Stripe card directly).
-- We fix this by storing amount_cents = 0 to indicate no wallet funds moved.
--
-- This migration also ensures the apply_stripe_wallet_topup and apply_stripe_credit_purchase
-- functions exist (idempotent via CREATE OR REPLACE).

-- Re-create apply_stripe_wallet_topup (unchanged, included for completeness)
CREATE OR REPLACE FUNCTION public.apply_stripe_wallet_topup(
  p_session_id TEXT,
  p_user_id UUID,
  p_amount_cents INTEGER,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  already_processed BOOLEAN,
  balance_before_cents INTEGER,
  balance_after_cents INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_before INTEGER;
  v_existing_after INTEGER;
  v_balance_before INTEGER;
  v_balance_after INTEGER;
BEGIN
  IF p_session_id IS NULL OR btrim(p_session_id) = '' THEN
    RAISE EXCEPTION 'Stripe session id is required';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Wallet top-up amount must be positive';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('stripe_wallet_topup'), hashtext(p_session_id));

  SELECT
    wt.balance_before_cents,
    wt.balance_after_cents
  INTO
    v_existing_before,
    v_existing_after
  FROM public.wallet_transactions wt
  WHERE wt.user_id = p_user_id
    AND wt.type = 'topup'
    AND wt.reference_id = p_session_id
  ORDER BY wt.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      TRUE,
      COALESCE(v_existing_before, 0),
      COALESCE(v_existing_after, 0);
    RETURN;
  END IF;

  INSERT INTO public.wallets (user_id, balance_cents, updated_at)
  VALUES (p_user_id, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT w.balance_cents
  INTO v_balance_before
  FROM public.wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  v_balance_before := COALESCE(v_balance_before, 0);
  v_balance_after := v_balance_before + p_amount_cents;

  UPDATE public.wallets
  SET balance_cents = v_balance_after,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.wallet_transactions (
    user_id,
    type,
    amount_cents,
    balance_before_cents,
    balance_after_cents,
    description,
    reference_id
  )
  VALUES (
    p_user_id,
    'topup',
    p_amount_cents,
    v_balance_before,
    v_balance_after,
    COALESCE(
      p_description,
      format('Wallet top-up via Stripe - %s', p_session_id)
    ),
    p_session_id
  );

  RETURN QUERY
  SELECT FALSE, v_balance_before, v_balance_after;
END;
$$;

-- Re-create apply_stripe_credit_purchase with the fix:
-- amount_cents = 0 (no wallet funds moved; user paid via Stripe card directly)
CREATE OR REPLACE FUNCTION public.apply_stripe_credit_purchase(
  p_session_id TEXT,
  p_user_id UUID,
  p_credits INTEGER,
  p_amount_cents INTEGER DEFAULT 0,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  already_processed BOOLEAN,
  total_before INTEGER,
  total_after INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_before INTEGER;
  v_total_after INTEGER;
  v_wallet_balance INTEGER;
BEGIN
  IF p_session_id IS NULL OR btrim(p_session_id) = '' THEN
    RAISE EXCEPTION 'Stripe session id is required';
  END IF;

  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'Purchased credits must be positive';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('stripe_credit_purchase'), hashtext(p_session_id));

  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE wt.user_id = p_user_id
      AND wt.type = 'credit_purchase'
      AND wt.reference_id = p_session_id
  ) THEN
    INSERT INTO public.credits (user_id, total, used, rollover, updated_at)
    VALUES (p_user_id, 0, 0, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING;

    SELECT c.total
    INTO v_total_before
    FROM public.credits c
    WHERE c.user_id = p_user_id;

    v_total_before := COALESCE(v_total_before, 0);

    RETURN QUERY
    SELECT TRUE, v_total_before, v_total_before;
    RETURN;
  END IF;

  INSERT INTO public.credits (user_id, total, used, rollover, updated_at)
  VALUES (p_user_id, 0, 0, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT c.total
  INTO v_total_before
  FROM public.credits c
  WHERE c.user_id = p_user_id
  FOR UPDATE;

  v_total_before := COALESCE(v_total_before, 0);
  v_total_after := v_total_before + p_credits;

  UPDATE public.credits
  SET total = v_total_after,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.wallets (user_id, balance_cents, updated_at)
  VALUES (p_user_id, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT w.balance_cents
  INTO v_wallet_balance
  FROM public.wallets w
  WHERE w.user_id = p_user_id;

  v_wallet_balance := COALESCE(v_wallet_balance, 0);

  INSERT INTO public.wallet_transactions (
    user_id,
    type,
    -- FIX: Use 0 instead of -amount_cents. The user paid via Stripe card directly;
    -- no wallet funds moved. Showing a negative amount was misleading users.
    amount_cents,
    balance_before_cents,
    balance_after_cents,
    description,
    reference_id
  )
  VALUES (
    p_user_id,
    'credit_purchase',
    0,              -- no wallet funds moved
    v_wallet_balance,
    v_wallet_balance,
    COALESCE(
      p_description,
      format('Credit purchase via Stripe - %s', p_session_id)
    ),
    p_session_id
  );

  RETURN QUERY
  SELECT FALSE, v_total_before, v_total_after;
END;
$$;

-- Grant execute permissions (same as migration 030)
GRANT EXECUTE ON FUNCTION public.apply_stripe_wallet_topup TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_credit_purchase TO service_role;
