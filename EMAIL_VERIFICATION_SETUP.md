# Email Verification Setup — Resend

Verification emails are sent by **Supabase Auth** when users sign up.  
Configure **Resend SMTP** in Supabase so auth emails (signup, password reset) use Resend.  
Transactional emails in app APIs also use Resend (`src/lib/email.ts`, `RESEND_API_KEY`).

---

## Current Setup: Resend for Auth + Transactional

- **Auth emails** (signup verification, password reset): Supabase sends through Resend SMTP.
- **Transactional emails** (meetings, agreements, reactivation): app sends through Resend API.

---

## Resend SMTP for Supabase Auth

### 1. Prepare Resend sender domain

1. Log into [Resend](https://resend.com).
2. Add and verify your sending domain (for example `matchindeed.com`).
3. Confirm DNS records are green.

### 2. Create API key for SMTP

1. In Resend, go to **API Keys**.
2. Create an API key (sending access is enough for SMTP).
3. Copy the key (`re_...`).

### 3. Configure Supabase SMTP

1. Open **Supabase Dashboard** → your project → **Authentication** → **Email**.
2. Enable **Custom SMTP**.
3. Enter:

| Field | Value |
|-------|-------|
| **Host** | `smtp.resend.com` |
| **Port** | `587` |
| **Username** | `resend` |
| **Password** | Your Resend API key (`re_...`) |
| **Sender email** | Verified sender (e.g. `noreply@matchindeed.com`) |
| **Sender name** | `MatchIndeed` |

4. Save.

After this, Supabase signup/password-reset emails will route via Resend.

---

## App Environment Variables

Use these in app runtime (`.env.local` and production env):

```bash
RESEND_API_KEY=re_...
EMAIL_FROM="MatchIndeed <noreply@matchindeed.com>"
NEXT_PUBLIC_APP_URL=https://www.matchindeed.com
```

Optional integration smoke fallback recipient:

```bash
RESEND_TEST_TO_EMAIL=admin@matchindeed.com
```

---

## Redirect URLs

In Supabase:

**Authentication** → **URL Configuration** → **Redirect URLs**

Examples:

```txt
https://www.matchindeed.com/**
https://michaels-mac-mini.tail0b12a7.ts.net:8443/**
http://localhost:3001/**
```

---

## Quick Checks

1. Supabase Auth logs  
   Dashboard → Logs → Auth (check verification send failures).
2. Resend dashboard  
   Check email events, bounces, and suppression list.
3. App test endpoint (dev only)  
   `GET /api/test-email`

---

## Resend Verification Button

The **Resend verification email** action on `/verify-email` still uses Supabase Auth resend.  
So it also uses Resend once Supabase SMTP is configured to Resend.

Because Supabase Auth owns this resend email body, the hosted **Confirm signup**
template must be customized in Supabase, not only in the app's Resend templates.

### Professional Confirm Signup Template

The production-ready template lives at:

```txt
supabase/templates/confirmation.html
```

Apply it with the Supabase Management API:

```bash
export SUPABASE_ACCESS_TOKEN="your-supabase-management-access-token"
export NEXT_PUBLIC_SUPABASE_URL="https://szmkvcifwopbnatsdcmw.supabase.co"
node scripts/update-supabase-auth-confirmation-template.mjs
```

Or paste the same HTML manually:

1. Open Supabase Dashboard.
2. Go to **Authentication** -> **Email Templates**.
3. Open **Confirm signup**.
4. Set subject to `Confirm your MatchIndeed account`.
5. Paste the contents of `supabase/templates/confirmation.html`.
6. Save and send a test verification email.
