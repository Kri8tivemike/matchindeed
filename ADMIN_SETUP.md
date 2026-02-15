# Admin Account Setup Guide

## Admin Login Credentials
- **Email:** `Kri8tivemike@gmail.com`
- **Password:** `123@Kri8`
- **Role:** `superadmin`

## Setup Instructions

### Method 1: Automatic Setup (Recommended)
1. Navigate to your app's registration page: `/register`
2. Sign up with the credentials above
3. The database trigger will automatically:
   - Set your role to `superadmin`
   - Set account status to `active`
   - Verify your email
   - Set tier to `vip`

### Method 2: Manual Setup (If user already exists)
If the user account already exists but doesn't have admin privileges, run this SQL in your Supabase SQL Editor:

```sql
SELECT set_user_as_admin('Kri8tivemike@gmail.com', 'superadmin');
```

### Method 3: Via Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Users**
3. Click **"Add user"** → **"Create new user"**
4. Enter:
   - Email: `Kri8tivemike@gmail.com`
   - Password: `123@Kri8`
   - Auto Confirm User: ✅ (checked)
5. After creation, run the SQL function above to set admin role

## Verification

After signing up, verify the admin account by running:

```sql
SELECT 
  id,
  email,
  role,
  account_status,
  email_verified,
  tier
FROM accounts
WHERE email = 'Kri8tivemike@gmail.com';
```

Expected result:
- `role` should be `superadmin`
- `account_status` should be `active`
- `email_verified` should be `true`
- `tier` should be `vip`

## Accessing Admin Panel

Once set up:
1. Go to `/admin/login`
2. Login with the credentials above
3. You'll have full access to:
   - User management
   - Pricing controls
   - Photo moderation
   - Reports management
   - Activity logs
   - Analytics dashboard

## Troubleshooting

If the automatic trigger didn't work:
1. Check if the user exists: `SELECT * FROM accounts WHERE email = 'Kri8tivemike@gmail.com';`
2. Manually set admin role: `SELECT set_user_as_admin('Kri8tivemike@gmail.com', 'superadmin');`
3. Verify: `SELECT role, account_status FROM accounts WHERE email = 'Kri8tivemike@gmail.com';`

## MFA (Two-Factor Authentication)

Admin login requires MFA by default. If you see "Failed to start MFA enrollment":

1. **Enable MFA in Supabase:** Dashboard → Authentication → check that MFA/Verification is enabled (not "Verification Disabled").
2. **Skip MFA for development:** Add to `.env.local`:
   ```
   NEXT_PUBLIC_ADMIN_MFA_REQUIRED=false
   ```
   Then sign out and sign in again — you'll go straight to the admin panel.
3. **Or** when enrollment fails, click "Skip for now and go to admin panel" on the MFA setup page.

## Security Notes

- Keep admin credentials secure
- Consider using a stronger password in production
- Admin actions are logged in the `admin_logs` table for audit purposes
