# MatchIndeed Client Corrections: Execution Backlog

Date: 2026-02-19  
Scope source: client feedback docs + current codebase review

## Objective
Deliver client-requested corrections without breaking the current production flow:

1. Landing widget -> `/register` -> `/verify-email` -> `/dashboard/profile/edit`
2. Existing Supabase auth/session model
3. Existing tier/credits/calendar architecture

## P0 (Blockers / Must ship first)

### P0.1 Account lifecycle correctness (deactivate/delete safety)
Status: Not done

Files:
- `src/app/api/profile/account/route.ts`
- `src/app/dashboard/profile/my-account/page.tsx`
- `src/app/dashboard/calendar/page.tsx`
- `src/app/dashboard/discover/page.tsx`

Issues:
- API updates `accounts.status` but table uses `accounts.account_status`.
- Delete endpoint hard-deletes user data, conflicting with requested soft-delete/deactivate workflow.

Actions:
- Replace `status` usage with `account_status`.
- Convert delete from hard-delete to request-based soft-delete flow.
- Add reason capture + password/OTP confirmation step.
- Return explicit success state on deactivate and redirect user to dashboard with confirmation.

Acceptance:
- Deactivation toggles visibility/calendar and returns success message.
- User record remains in DB after delete request.
- Soft-deleted/deactivated users are excluded from discover/search/likes/meeting requests.

### P0.2 Signup policy hardening (terms + age validation)
Status: Partially done

Files:
- `src/components/SocialAuthButtons.tsx`
- `src/app/register/page.tsx`
- `src/app/api/auth/register/route.ts`
- `src/app/auth/callback/route.ts`
- `src/app/dashboard/profile/edit/page.tsx`
- `src/lib/age-restrictions.ts`

Issues:
- Google signup does not require terms acceptance.
- DOB step has no reliable backend/DB-level 18+ enforcement.

Actions:
- Add mandatory terms checkbox before Google OAuth and email signup submit.
- Enforce 18+ in server path and DB trigger (to prevent client bypass).
- Reject underage profile writes with clear API/UX message.

Acceptance:
- Cannot register or OAuth-signup without terms consent.
- Any attempt to set DOB under 18 fails consistently.

### P0.3 Profile onboarding flow cleanup (high-friction UX)
Status: Not done

Files:
- `src/app/dashboard/profile/edit/page.tsx`
- `src/lib/profile-completeness.ts`
- `src/components/ProfileCompletenessCard.tsx`

Issues:
- Heavy preselected defaults.
- No back button on profile edit flow.
- "Reveal your personality" step still present.
- About Me requirements not aligned (optional, helper examples, 80-200 chars when provided).
- Minimum 2-photo requirement not enforced on completion.

Actions:
- Remove risky defaults and auto-selects (especially "I'd rather not say" defaults).
- Add persistent back button on every profile onboarding step.
- Remove "Reveal your personality" step.
- Make About Me skippable, enforce 80-200 only if provided.
- Enforce minimum 2 photos before profile completion flag is set.

Acceptance:
- User can move forward/backward through onboarding safely.
- Profile completion cannot finalize with <2 photos.
- Completion prompts disappear when profile is genuinely complete.

### P0.4 Revenue path stability (wallet and upgrade blockers)
Status: Not done

Files:
- `src/app/dashboard/profile/wallet/page.tsx`
- `src/app/api/create-checkout-session/route.ts`
- `src/components/MeetingRequestModal.tsx`
- `src/app/dashboard/likes/page.tsx`

Issues:
- `?canceled=true` flow can leave users in a stuck UX state.
- No min/max funding guardrails requested by client.
- Upgrade/credit CTAs are missing in some restricted-action messages.

Actions:
- Make canceled checkout recoverable without page reload.
- Add purchase bounds (client target: min 5, max 2000 equivalent by currency).
- Add direct upgrade/wallet links in all tier/credit restriction messages.

Acceptance:
- Canceling checkout does not freeze wallet page actions.
- Funding limits are enforced client and server side.
- Restriction banners include actionable upgrade/wallet links.

### P0.5 High-impact quick fixes from client report
Status: Not done

Files:
- `src/app/dashboard/likes/page.tsx`
- `src/app/dashboard/discover/page.tsx`
- `src/app/dashboard/history/page.tsx`

Actions:
- Fix Likes empty-state CTA label/link mismatch (`Edit Profile` should not route to discover).
- Fix misleading completion message shown when profile is complete.
- Add search input/button on history page.

Acceptance:
- Like-page CTA routes correctly.
- Completion reminders are state-accurate.
- History page supports search.

## P1 (Important, after P0)

### P1.1 Location normalization and consistency
Files:
- `src/components/GooglePlacesAutocomplete.tsx`
- `src/app/dashboard/profile/edit/page.tsx`
- `src/app/dashboard/profile/preferences/page.tsx`
- `src/app/dashboard/discover/page.tsx`
- `src/app/dashboard/search/page.tsx`

Actions:
- Normalize stored location into `city + country` display format for user-facing surfaces.
- Keep raw location separately for audit/debug.
- Standardize filter behavior across search/discover.

### P1.2 Blocked locations and plan-aware messaging
Files:
- `src/app/dashboard/profile/preferences/blocked-locations/page.tsx`
- `src/app/api/profile/blocked-locations/route.ts`
- `src/components/MeetingRequestModal.tsx`

Actions:
- Add plan eligibility messaging when blocked-location features are restricted.
- Add upgrade path from restriction UI.

### P1.3 Meeting join/rules UX alignment
Files:
- `src/app/dashboard/meetings/join/page.tsx`
- `src/app/api/meetings/notifications/route.ts`
- `src/app/api/cron/meeting-notifications/route.ts`

Actions:
- Align modal copy/labels with client language ("Video Meeting").
- Ensure always-visible countdown behavior is clear and consistent.
- Keep rules acknowledgment gating before join.

### P1.4 Support/Help contact workflow
Files:
- `src/app/page.tsx`
- `src/app/api/...` (new support endpoint)
- `src/lib/zoho.ts` (reuse integration)

Actions:
- Add Contact Support form with required fields and categories.
- Route submissions to Zoho Desk and store a local copy.

## P2 (Enhancements / structured content systems)

### P2.1 Prompt system (choose 3 of 60)
Files:
- `src/app/dashboard/profile/edit/page.tsx`
- `src/components/*` (new prompt selector components)

Actions:
- Prompt cards, expansion, answer examples, progress 1/3..3/3, edit state.

### P2.2 About Me examples system
Files:
- `src/app/dashboard/profile/edit/page.tsx`
- `src/components/*` (new examples modal)

Actions:
- Rotating examples + "Show More Examples" modal sourced from client copy library.

### P2.3 Profile display order and consistency
Files:
- `src/components/ProfileDetailModal.tsx`
- `src/app/dashboard/profile/page.tsx`

Actions:
- Enforce requested section order and mobile parity.

## Migration Order (strict)

### 1) `migrations/20260219_01_account_lifecycle_soft_delete.sql`
- Add `accounts.deleted_at`, `accounts.deletion_reason`.
- Add `account_deletion_requests` table.
- Add indexes for lifecycle status queries.

### 2) `migrations/20260219_02_signup_policy_terms_age.sql`
- Add `accounts.accepted_terms_at`, `accounts.accepted_privacy_at`.
- Add trigger/function enforcing 18+ on `user_profiles.date_of_birth` writes.

### 3) `migrations/20260219_03_profile_constraints.sql`
- Add `accounts.name_change_count` (or equivalent constrained mechanism).
- Add optional `user_profiles.about_me_skipped` flag.

### 4) `migrations/20260219_04_location_normalization.sql`
- Add `user_profiles.location_city`, `user_profiles.location_country`, `user_profiles.location_raw`.
- Backfill from existing `location` where possible.

### 5) `migrations/20260219_05_support_prompts_tables.sql`
- Add support tickets table.
- Add prompt library and user prompt answers tables.

## Delivery Sequence

1. Ship Migrations 1-3, then P0.1/P0.2/P0.3 backend+frontend.
2. Ship P0.4/P0.5 and regression test auth/wallet/discover.
3. Ship Migration 4 and P1.1/P1.2.
4. Ship P1.3/P1.4.
5. Ship Migration 5 and P2 systems.

## Regression Test Gate (required before each deploy)

1. New signup (email + Google) with terms acceptance checks.
2. Email verification redirect to `/dashboard/profile/edit`.
3. Under-18 rejection path.
4. Profile completion flow with back navigation and 2-photo minimum.
5. Deactivate and delete-request flows.
6. Wallet top-up, canceled checkout recovery, and credit purchase limits.
7. Restriction messaging links (upgrade/wallet) from likes/meeting requests.
8. Search/discover/profile location display consistency.
