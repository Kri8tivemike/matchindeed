-- Align relationship status values with updated product wording.

UPDATE user_profiles
SET relationship_status = 'never_married'
WHERE relationship_status = 'single';

UPDATE user_profiles
SET relationship_status = 'i_will_tell_you_later'
WHERE relationship_status IN (
  'prefer_not_to_say',
  'i''d rather not say',
  'id rather not say'
);

UPDATE user_profiles
SET relationship_status = 'married_non_monogamous'
WHERE relationship_status = 'married (non-monogamous)';

DO $$
DECLARE
  relationship_constraint text;
BEGIN
  FOR relationship_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'user_profiles'
      AND n.nspname = 'public'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%relationship_status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS %I',
      relationship_constraint
    );
  END LOOP;
END $$;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_relationship_status_check
  CHECK (
    relationship_status IS NULL
    OR relationship_status = ANY (
      ARRAY[
        'never_married',
        'separated',
        'widowed',
        'married_non_monogamous',
        'divorced',
        'i_will_tell_you_later'
      ]
    )
  ) NOT VALID;

