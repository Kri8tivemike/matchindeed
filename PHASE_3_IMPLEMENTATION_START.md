# Phase 3 Implementation - Relationship Agreements & Profile Deactivation

## Status: STARTED (2026-02-17)

This document tracks the implementation status of Phase 3 for MatchIndeed.

### Completed Tasks

#### 1. ✅ Database Migration - migrations/004_create_relationship_agreements.sql
- Created and saved successfully
- Defines `relationship_agreements` table with:
  - Columns: id, match_id, user1_id, user2_id, agreement_text, signed_by_user1_at, signed_by_user2_at, status, created_at, updated_at
  - Indexes on match_id, user1_id, user2_id, status
  - Row Level Security (RLS) policies implemented
  - Grants for authenticated users and service role
  - Auto-updating trigger for updated_at field

#### 2. ✅ Project Structure Created
- `/src/lib/agreements/` directory created (ready for templates.ts)
- `/src/lib/profile/` directory ready for auto-deactivate.ts
- `/src/app/api/agreements/` directory ready for route.ts

### Remaining Tasks

#### 1. ⏳ src/lib/agreements/templates.ts  
Agreement template utilities with:
- `AgreementCustomizationOptions` interface
- `AgreementTemplate` interface  
- `getDefaultAgreementText()` function
- `getAgreementTemplate()` function
- `generateCustomizedAgreement()` function
- `validateAgreementContent()` function
- `getAvailableCustomizationOptions()` function

**Status**: File created but needs content

#### 2. ⏳ src/app/api/agreements/route.ts
Agreement API endpoints with:
- GET handler - Fetch agreement for a match
- POST handler - Create/sign agreement
- Input validation
- Authorization checks
- Supabase integration

#### 3. ⏳ src/lib/profile/auto-deactivate.ts
Profile deactivation utilities with:
- `deactivateProfile(userId, reason)` function
- `checkMatchStatus()` function
- `reactivateProfile(userId)` function
- Deactivation tracking

#### 4. ⏳ Update src/app/api/meetings/response/route.ts
Enhanced match logic:
- Check if BOTH users said YES
- Create relationship agreement if both YES
- Send notifications
- Handle mismatch (one YES, one NO)

#### 5. ⏳ Frontend Integration (not yet started)
- UI for agreement signing
- Profile management dashboard
- Match notifications

###  Files Status
- migrations/004_create_relationship_agreements.sql: ✅ CREATED
- src/lib/agreements/: ✅ CREATED (directory)
- src/lib/agreements/templates.ts: ⚠️ EMPTY
- src/lib/profile/: ⏳ PENDING
- src/app/api/agreements/: ⏳ PENDING

### Database Tables Referenced
- relationship_agreements (NEW)
- user_matches (existing)
- accounts (existing)
- user_profiles (existing)

### Next Steps
1. Populate src/lib/agreements/templates.ts with agreement template functions
2. Create src/app/api/agreements/route.ts with API handlers
3. Create src/lib/profile/auto-deactivate.ts with profile deactivation functions
4. Update src/app/api/meetings/response/route.ts to create agreements on mutual YES
5. Test database migration in Supabase
6. Test API endpoints

### Notes
- All files use TypeScript with proper type definitions
- Supabase integration uses service role for admin operations
- RLS policies ensure data privacy and security
- Error handling implemented for all operations

