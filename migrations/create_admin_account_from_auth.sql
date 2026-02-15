-- ============================================================
-- Create admin account when user exists in auth.users but not in accounts
-- Run this in Supabase SQL Editor when set_user_as_admin fails with
-- "User with email X not found in accounts table"
-- ============================================================

-- Step 1: Create account row from auth.users (if missing)
INSERT INTO accounts (id, email, display_name, role, account_status, email_verified, tier)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'first_name', split_part(au.email, '@', 1)),
  'superadmin',
  'active',
  true,
  'vip'
FROM auth.users au
WHERE au.email = 'Kri8tivemike@gmail.com'
AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = au.id);

-- Step 2: If account already existed, update role instead
UPDATE accounts
SET role = 'superadmin', account_status = 'active', email_verified = true, tier = 'vip'
WHERE email = 'Kri8tivemike@gmail.com';

-- Step 3: Verify
SELECT id, email, role, account_status, email_verified, tier
FROM accounts
WHERE email = 'Kri8tivemike@gmail.com';
