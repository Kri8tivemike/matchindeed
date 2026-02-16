# Database Migrations

This directory contains SQL migration files for the MatchIndeed database schema.

## Running Migrations

### Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of the migration file
4. Click **Run** to execute

### Using Supabase CLI

If you have Supabase CLI installed:

```bash
# Link to your project (if not already linked)
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### Manual Execution

You can also execute the SQL directly in your Supabase SQL Editor or any PostgreSQL client connected to your database.

## Migration Files

### 001_create_subscription_pricing.sql

Creates the `subscription_pricing` table for admin-configurable subscription pricing.

**Features:**
- Stores pricing for all tiers (basic, standard, premium, vip)
- Supports multiple currencies (NGN, USD, GBP)
- Includes Row Level Security (RLS) policies
- Pre-populates with default pricing values

**Table Structure:**
- `tier_id` (TEXT, PRIMARY KEY): Subscription tier identifier
- `price_ngn` (NUMERIC): Price in Nigerian Naira
- `price_usd` (NUMERIC): Price in US Dollars
- `price_gbp` (NUMERIC): Price in British Pounds
- `updated_at` (TIMESTAMP): Last update timestamp
- `updated_by` (UUID): Admin user who made the update
- `created_at` (TIMESTAMP): Creation timestamp

## Admin Pricing Management

After running the migration, administrators can update pricing through:

1. **API Endpoint**: `POST /api/subscription-pricing`
   ```json
   {
     "tier_id": "standard",
     "price_ngn": 35000,
     "price_usd": 22,
     "price_gbp": 18
   }
   ```

2. **Direct Database Update**: Using Supabase dashboard or SQL editor

## Security Notes

- The table uses Row Level Security (RLS)
- Public read access is allowed (pricing is public information)
- Write access is restricted to service role (admin operations)
- You may want to add additional admin role checking in your application logic

## Next Steps

1. Run the migration in your Supabase project
2. Test the API endpoint to verify pricing can be updated
3. Implement admin authentication in the API route if needed
4. Consider adding an admin dashboard UI for managing pricing
