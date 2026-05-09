-- Migration: Atomic credit operations + corrected wallet payment processor
--
-- Root causes fixed:
--   1. consumeCredits / refundConsumedCredits in src/lib/credits/actions.ts used a
--      non-atomic read-modify-write pattern (race condition between concurrent calls).
--   2. The live process_wallet_balance_payment RPC was setting
--      total = p_credits instead of total += p_credits for credit_purchase type,
--      causing purchased credits to overwrite instead of accumulate.
--
-- New RPCs:
--   consume_credits_atomic   — atomic deduction with FOR UPDATE row lock
--   refund_credits_atomic    — atomic refund with FOR UPDATE row lock
--   process_wallet_balance_payment — corrected, fully atomic wallet payment processor

-- ─────────────────────────────────────────────────────────────
-- 1. Atomic credit consumption
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_credits_atomic(
  p_user_id    UUID,
  p_amount     INTEGER,
  p_action_type TEXT DEFAULT 'credit_deduction',
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  success          BOOLEAN,
  available_before INTEGER,
  available_after  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     INTEGER;
  v_used      INTEGER;
  v_rollover  INTEGER;
  v_available INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Ensure credits row exists
  INSERT INTO public.credits (user_id, total, used, rollover, updated_at)
  VALUES (p_user_id, 0, 0, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- Acquire row lock
  SELECT c.total, c.used, c.rollover
  INTO v_total, v_used, v_rollover
  FROM public.credits c
  WHERE c.user_id = p_user_id
  FOR UPDATE;

  v_total    := COALESCE(v_total, 0);
  v_used     := COALESCE(v_used, 0);
  v_rollover := COALESCE(v_rollover, 0);
  v_available := GREATEST(0, v_total - v_used + v_rollover);

  IF v_available < p_amount THEN
    RETURN QUERY SELECT FALSE, v_available, v_available;
    RETURN;
  END IF;

  UPDATE public.credits
  SET used       = v_used + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, amount, action_type, description)
  VALUES (
    p_user_id,
    -p_amount,
    p_action_type,
    COALESCE(p_description, format('Consumed %s credit(s).', p_amount))
  );

  RETURN QUERY SELECT TRUE, v_available, v_available - p_amount;
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 2. Atomic credit refund
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_credits_atomic(
  p_user_id     UUID,
  p_amount      INTEGER,
  p_action_type TEXT DEFAULT 'credit_refund',
  p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN;
  END IF;

  -- Ensure credits row exists
  INSERT INTO public.credits (user_id, total, used, rollover, updated_at)
  VALUES (p_user_id, 0, 0, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- Acquire row lock
  SELECT c.used
  INTO v_used
  FROM public.credits c
  WHERE c.user_id = p_user_id
  FOR UPDATE;

  v_used := COALESCE(v_used, 0);

  UPDATE public.credits
  SET used       = GREATEST(0, v_used - p_amount),
      updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, amount, action_type, description)
  VALUES (
    p_user_id,
    p_amount,
    p_action_type,
    COALESCE(p_description, format('Refunded %s credit(s).', p_amount))
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────
-- 3. Corrected process_wallet_balance_payment
--    Previously: credit_purchase set total = p_credits  (BUG — overwrites)
--    Now:        credit_purchase sets total = total + p_credits  (additive)
--    All operations use FOR UPDATE locks; wallet deduction is rolled back
--    automatically on any exception inside the same transaction.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_wallet_balance_payment(
  p_user_id     UUID,
  p_type        TEXT,
  p_amount_cents INTEGER,
  p_credits     INTEGER DEFAULT NULL,
  p_tier        TEXT    DEFAULT NULL
)
RETURNS TABLE (
  success        BOOLEAN,
  balance_before INTEGER,
  balance_after  INTEGER,
  amount_deducted INTEGER,
  message        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before    INTEGER;
  v_balance_after     INTEGER;
  v_total_before      INTEGER;
  v_used              INTEGER;
  v_rollover          INTEGER;
  v_available_before  INTEGER;
  v_credits_to_add    INTEGER;
  v_membership_id     UUID;
  v_normalized_tier   TEXT;
BEGIN
  -- ── Validate inputs ────────────────────────────────────────
  IF p_type NOT IN ('subscription', 'credit_purchase', 'payment') THEN
    RAISE EXCEPTION 'Invalid payment type: %', p_type;
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- ── Ensure wallet exists and lock it ───────────────────────
  INSERT INTO public.wallets (user_id, balance_cents, updated_at)
  VALUES (p_user_id, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT w.balance_cents
  INTO v_balance_before
  FROM public.wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  v_balance_before := COALESCE(v_balance_before, 0);

  IF v_balance_before < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  v_balance_after := v_balance_before - p_amount_cents;

  -- Deduct from wallet
  UPDATE public.wallets
  SET balance_cents = v_balance_after,
      updated_at    = NOW()
  WHERE user_id = p_user_id;

  -- ── Branch on payment type ─────────────────────────────────

  IF p_type = 'subscription' THEN
    IF p_tier IS NULL THEN
      RAISE EXCEPTION 'Subscription tier is required';
    END IF;

    v_normalized_tier := lower(p_tier);

    v_credits_to_add := CASE v_normalized_tier
      WHEN 'basic'    THEN 5
      WHEN 'standard' THEN 10
      WHEN 'premium'  THEN 30
      WHEN 'vip'      THEN 999999
      ELSE 0
    END;

    -- Update account tier
    UPDATE public.accounts
    SET tier = v_normalized_tier
    WHERE id = p_user_id;

    -- Create or update membership
    SELECT m.id INTO v_membership_id
    FROM public.memberships m
    WHERE m.user_id = p_user_id
    ORDER BY m.created_at DESC
    LIMIT 1;

    IF v_membership_id IS NOT NULL THEN
      UPDATE public.memberships
      SET tier        = v_normalized_tier,
          status      = 'active',
          starts_at   = NOW(),
          expires_at  = NOW() + INTERVAL '30 days',
          price_cents = p_amount_cents,
          updated_at  = NOW()
      WHERE id = v_membership_id;
    ELSE
      INSERT INTO public.memberships (
        user_id, tier, status, starts_at, expires_at, price_cents, updated_at
      )
      VALUES (
        p_user_id, v_normalized_tier, 'active',
        NOW(), NOW() + INTERVAL '30 days',
        p_amount_cents, NOW()
      );
    END IF;

    -- Ensure credits row exists and lock it
    INSERT INTO public.credits (user_id, total, used, rollover, updated_at)
    VALUES (p_user_id, 0, 0, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING;

    SELECT c.total, c.used, c.rollover
    INTO v_total_before, v_used, v_rollover
    FROM public.credits c
    WHERE c.user_id = p_user_id
    FOR UPDATE;

    v_total_before     := COALESCE(v_total_before, 0);
    v_used             := COALESCE(v_used, 0);
    v_rollover         := COALESCE(v_rollover, 0);
    v_available_before := GREATEST(0, v_total_before - v_used + v_rollover);

    -- Reset cycle: monthly allocation + preserve available as rollover
    UPDATE public.credits
    SET total      = CASE WHEN v_normalized_tier = 'vip' THEN 999999 ELSE v_credits_to_add END,
        used       = 0,
        rollover   = CASE WHEN v_normalized_tier = 'vip' THEN 0 ELSE v_available_before END,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Record rollover transaction
    IF v_normalized_tier != 'vip' AND v_available_before > 0 THEN
      INSERT INTO public.credit_transactions (user_id, amount, action_type, description)
      VALUES (
        p_user_id, v_available_before, 'subscription_credit_rollover',
        format(
          'Rolled over %s unused credit(s) into the new %s subscription cycle.',
          v_available_before, v_normalized_tier
        )
      );
    END IF;

    -- Record allocation transaction
    INSERT INTO public.credit_transactions (user_id, amount, action_type, description)
    VALUES (
      p_user_id, v_credits_to_add, 'subscription_monthly_allocation',
      format('Allocated %s monthly credits for %s tier.', v_credits_to_add, v_normalized_tier)
    );

    -- Record wallet transaction
    INSERT INTO public.wallet_transactions (
      user_id, type, amount_cents,
      balance_before_cents, balance_after_cents,
      description, reference_id
    )
    VALUES (
      p_user_id, 'subscription_payment', -p_amount_cents,
      v_balance_before, v_balance_after,
      format(
        'Subscription payment for %s - %.2f',
        v_normalized_tier, (p_amount_cents::DECIMAL / 100)
      ),
      format('wallet_%s', extract(epoch FROM NOW())::BIGINT)
    );

    RETURN QUERY
    SELECT
      TRUE,
      v_balance_before, v_balance_after, p_amount_cents,
      format('Subscription activated for %s tier', v_normalized_tier);

  ELSIF p_type = 'credit_purchase' THEN
    IF p_credits IS NULL OR p_credits <= 0 THEN
      RAISE EXCEPTION 'A valid credit amount is required';
    END IF;

    -- Ensure credits row exists and lock it
    INSERT INTO public.credits (user_id, total, used, rollover, updated_at)
    VALUES (p_user_id, 0, 0, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING;

    SELECT c.total
    INTO v_total_before
    FROM public.credits c
    WHERE c.user_id = p_user_id
    FOR UPDATE;

    v_total_before := COALESCE(v_total_before, 0);

    -- ADD credits — do NOT set/overwrite
    UPDATE public.credits
    SET total      = v_total_before + p_credits,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Record credit transaction
    INSERT INTO public.credit_transactions (user_id, amount, action_type, description)
    VALUES (
      p_user_id, p_credits, 'credit_purchase_wallet',
      format('Purchased %s credit(s) using wallet balance.', p_credits)
    );

    -- Record wallet transaction
    INSERT INTO public.wallet_transactions (
      user_id, type, amount_cents,
      balance_before_cents, balance_after_cents,
      description, reference_id
    )
    VALUES (
      p_user_id, 'credit_purchase', -p_amount_cents,
      v_balance_before, v_balance_after,
      format(
        'Credit purchase (%s credits) - %.2f',
        p_credits, (p_amount_cents::DECIMAL / 100)
      ),
      format('wallet_%s', extract(epoch FROM NOW())::BIGINT)
    );

    RETURN QUERY
    SELECT
      TRUE,
      v_balance_before, v_balance_after, p_amount_cents,
      format('%s credits added successfully', p_credits);

  ELSE
    -- Generic wallet payment
    INSERT INTO public.wallet_transactions (
      user_id, type, amount_cents,
      balance_before_cents, balance_after_cents,
      description, reference_id
    )
    VALUES (
      p_user_id, 'payment', -p_amount_cents,
      v_balance_before, v_balance_after,
      format('Payment from wallet - %.2f', (p_amount_cents::DECIMAL / 100)),
      format('wallet_%s', extract(epoch FROM NOW())::BIGINT)
    );

    RETURN QUERY
    SELECT
      TRUE,
      v_balance_before, v_balance_after, p_amount_cents,
      'Payment processed successfully'::TEXT;
  END IF;
END;
$$;
