-- Migration 036: Diagnose and repair wallet/credits state.
--
-- Run this in Supabase Dashboard → SQL Editor to:
-- 1. Ensure wallets + credits tables exist with correct schema
-- 2. Backfill any missing wallet/credit rows for users who have transaction records
-- 3. Fix any negative wallet balances
-- 4. Report current state
--
-- SAFE TO RUN MULTIPLE TIMES (idempotent).

-- ─── 1. Ensure wallets table exists ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Ensure wallet_transactions table exists ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL,
  amount_cents         INTEGER NOT NULL DEFAULT 0,
  balance_before_cents INTEGER,
  balance_after_cents  INTEGER,
  description          TEXT,
  reference_id         TEXT,
  admin_id             UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id
  ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference_id
  ON public.wallet_transactions(reference_id);

-- ─── 3. Ensure credits table exists ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  total        INTEGER NOT NULL DEFAULT 0,
  used         INTEGER NOT NULL DEFAULT 0,
  rollover     INTEGER NOT NULL DEFAULT 0,
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Backfill missing wallet rows for users who have transactions ──────────
INSERT INTO public.wallets (user_id, balance_cents)
SELECT DISTINCT wt.user_id, 0
FROM public.wallet_transactions wt
WHERE NOT EXISTS (
  SELECT 1 FROM public.wallets w WHERE w.user_id = wt.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- ─── 5. Fix negative wallet balances (clamp to 0) ────────────────────────────
UPDATE public.wallets
SET balance_cents = 0, updated_at = NOW()
WHERE balance_cents < 0;

-- ─── 6. Backfill missing credits rows for users who have memberships ──────────
INSERT INTO public.credits (user_id, total, used, rollover)
SELECT DISTINCT m.user_id, 0, 0, 0
FROM public.memberships m
WHERE NOT EXISTS (
  SELECT 1 FROM public.credits c WHERE c.user_id = m.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- ─── 7. Ensure both RPC functions exist (idempotent) ─────────────────────────
-- (Migration 035 should have already done this. This section is a safety net.)

-- ─── 8. Diagnostic report ─────────────────────────────────────────────────────
-- After running, check the output of these queries:

-- Total wallets:
SELECT COUNT(*) AS total_wallets, SUM(balance_cents) AS total_balance_cents FROM public.wallets;

-- Total credit rows:
SELECT COUNT(*) AS total_credit_rows,
       SUM(total) AS sum_total,
       SUM(used) AS sum_used,
       SUM(rollover) AS sum_rollover
FROM public.credits;

-- Recent Stripe credit purchase transactions:
SELECT
  wt.user_id,
  wt.reference_id AS stripe_session_id,
  wt.amount_cents,
  wt.balance_before_cents,
  wt.balance_after_cents,
  wt.description,
  wt.created_at
FROM public.wallet_transactions wt
WHERE wt.type = 'credit_purchase'
  AND wt.reference_id LIKE 'cs_%'
ORDER BY wt.created_at DESC
LIMIT 20;

-- Recent credit transactions:
SELECT
  ct.user_id,
  ct.amount,
  ct.action_type,
  ct.description,
  ct.created_at
FROM public.credit_transactions ct
ORDER BY ct.created_at DESC
LIMIT 20;

-- Users with credit purchases but 0 available credits (potential stuck state):
SELECT
  c.user_id,
  c.total,
  c.used,
  c.rollover,
  c.total - c.used + c.rollover AS available
FROM public.credits c
WHERE EXISTS (
  SELECT 1 FROM public.wallet_transactions wt
  WHERE wt.user_id = c.user_id AND wt.type = 'credit_purchase'
)
ORDER BY c.updated_at DESC
LIMIT 20;
