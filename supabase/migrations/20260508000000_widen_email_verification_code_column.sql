-- Migration: Widen email_verifications.verification_code from VARCHAR(6) to TEXT
--
-- Context: hashEmailVerificationCode() returns a SHA-256 hex string (64 chars).
-- It was being truncated to 6 chars as a workaround to fit the VARCHAR(6) column.
-- This migration permanently widens the column so the full hash can be stored,
-- after which the truncation workaround in email-verification-links.ts should be removed.
--
-- SAFE TO RUN: ALTER COLUMN TYPE VARCHAR→TEXT is a metadata-only change in PostgreSQL
-- (no table rewrite required when widening a character type).

ALTER TABLE public.email_verifications
  ALTER COLUMN verification_code TYPE TEXT;
