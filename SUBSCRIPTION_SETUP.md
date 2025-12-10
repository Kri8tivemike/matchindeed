# Subscription System Setup Guide

This guide will help you set up the subscription system with multi-currency support and admin-configurable pricing.

## Prerequisites

- Supabase project set up and configured
- Stripe account configured
- Environment variables properly set

## Step 1: Database Migration

### Run the Migration

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file: `migrations/001_create_subscription_pricing.sql`
4. Copy the entire SQL content
5. Paste it into the SQL Editor
6. Click **Run** to execute

This will create:
- `subscription_pricing` table
- Row Level Security (RLS) policies
- Default pricing values for all tiers

### Verify Migration

After running the migration, verify the table was created:

```sql
SELECT * FROM subscription_pricing;
```

You should see 4 rows (basic, standard, premium, vip) with default pricing.

## Step 2: Environment Variables

Add the following environment variables to your `.env.local` file:

```env
# Existing Stripe variables
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_STANDARD_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID=price_...

# Admin Configuration (optional)
# Comma-separated list of admin email addresses
ADMIN_EMAILS=admin@matchindeed.com,superadmin@matchindeed.com

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

### Admin Email Configuration

The `ADMIN_EMAILS` environment variable allows you to specify which email addresses have admin access. Users with these emails will be able to update subscription pricing through the API.

**Note:** You can also set admin status by:
1. Adding a `role` column to the `accounts` table and setting it to `'admin'`
2. Setting user metadata: `user.user_metadata.is_admin = true`
3. Setting app metadata: `user.app_metadata.is_admin = true`

## Step 3: Stripe Configuration

### Enable Multi-Currency Support

1. Go to your Stripe Dashboard
2. Navigate to **Settings** → **Payment methods**
3. Ensure you have payment methods enabled for:
   - NGN (Nigerian Naira) - if available
   - USD (US Dollar)
   - GBP (British Pound)

**Note:** Stripe may have limitations on NGN support depending on your account location. Check Stripe's documentation for supported currencies in your region.

### Test Currency Detection

The system automatically detects user currency based on IP location:
- **Nigeria (NG)** → NGN (Naira)
- **United Kingdom (GB)** → GBP (British Pounds)
- **All other countries** → USD (US Dollars)

You can test this by:
1. Using a VPN to change your IP location
2. Checking the subscription page to see prices in the correct currency

## Step 4: Admin Pricing Management

### Using the API

Once the migration is complete and you have admin access, you can update pricing via the API:

```bash
# Update Standard tier pricing
curl -X POST http://localhost:3001/api/subscription-pricing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "tier_id": "standard",
    "price_ngn": 35000,
    "price_usd": 22,
    "price_gbp": 18
  }'
```

### Using Supabase Dashboard

You can also update pricing directly in the Supabase dashboard:

1. Go to **Table Editor**
2. Select `subscription_pricing` table
3. Edit the row for the tier you want to update
4. Modify the price values
5. Save changes

## Step 5: Testing

### Test Subscription Flow

1. **Test Basic Tier:**
   - Navigate to `/dashboard/profile/subscription`
   - Click "Subscribe Now" on Basic tier
   - Complete the checkout process
   - Verify the account tier is updated

2. **Test Currency Detection:**
   - Use different IP locations (VPN)
   - Verify prices display in correct currency
   - Test checkout with different currencies

3. **Test Admin Pricing Update:**
   - Login as admin user
   - Update pricing via API
   - Verify new prices appear on subscription page

### Test Admin Access

```typescript
// In your code or API route
import { getAuthenticatedAdmin } from "@/lib/auth-helpers";

const { user, isAdmin } = await getAuthenticatedAdmin();
if (isAdmin) {
  // User has admin access
}
```

## Step 6: Production Considerations

### Security

1. **Admin Authentication:**
   - Ensure `ADMIN_EMAILS` is set in production environment
   - Consider implementing a more robust admin role system
   - Add rate limiting to the pricing update endpoint

2. **RLS Policies:**
   - Review and adjust RLS policies as needed
   - Ensure only authorized users can update pricing

3. **API Security:**
   - The pricing update endpoint requires admin authentication
   - Consider adding additional security measures (API keys, etc.)

### Monitoring

1. **Track Pricing Changes:**
   - The `subscription_pricing` table includes `updated_at` and `updated_by` fields
   - Monitor these for audit purposes

2. **Error Handling:**
   - Check logs for currency detection failures
   - Monitor Stripe webhook events for payment issues

## Troubleshooting

### Currency Not Detecting Correctly

If currency detection fails:
- Check browser console for errors
- Verify IP geolocation service is accessible
- Fallback to USD if detection fails

### Pricing Not Updating

If admin pricing updates aren't working:
1. Verify the migration was run successfully
2. Check admin authentication is working
3. Verify RLS policies allow updates
4. Check API logs for errors

### Stripe Currency Issues

If Stripe doesn't support a currency:
- The system will fallback to USD
- Consider using currency conversion for unsupported currencies
- Check Stripe's supported currencies list

## Support

For issues or questions:
1. Check the migration README: `migrations/README.md`
2. Review API documentation in code comments
3. Check Supabase and Stripe documentation

## Next Steps

- [ ] Run database migration
- [ ] Configure environment variables
- [ ] Set up admin emails
- [ ] Test subscription flow
- [ ] Test currency detection
- [ ] Test admin pricing updates
- [ ] Deploy to production
