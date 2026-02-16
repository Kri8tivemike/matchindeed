-- Verification and Setup Script for Admin Account
-- Run this in Supabase SQL Editor after creating the auth user

-- Step 1: Check if user exists in accounts table
SELECT 
  id,
  email,
  role,
  account_status,
  email_verified,
  tier,
  created_at
FROM accounts
WHERE email = 'Kri8tivemike@gmail.com';

-- Step 2: If user exists but doesn't have admin role, set it:
-- (Uncomment and run if needed)
-- SELECT set_user_as_admin('Kri8tivemike@gmail.com', 'superadmin');

-- Step 3: Verify admin permissions
SELECT 
  a.email,
  a.role,
  a.account_status,
  COUNT(p.permission) as permission_count
FROM accounts a
LEFT JOIN admin_permissions p ON p.role = a.role
WHERE a.email = 'Kri8tivemike@gmail.com'
GROUP BY a.email, a.role, a.account_status;

-- Step 4: Expected Result:
-- email: Kri8tivemike@gmail.com
-- role: superadmin
-- account_status: active
-- permission_count: Should be 12 (all superadmin permissions)
