# Email Verification Setup — Troubleshooting

Verification emails are sent by **Supabase Auth** when users sign up. Configure **Postmark SMTP** in Supabase so auth emails (signup, password reset) use the same provider as transactional emails.

---

## Current Setup: Postmark for Auth + Transactional

- **Auth emails** (signup verification, password reset): Supabase sends via Postmark SMTP (configured in Supabase Dashboard)
- **Transactional emails** (meeting requests, notifications): App sends via Postmark API (`email.ts`, `POSTMARK_SERVER_TOKEN`)

---

## Postmark SMTP for Supabase Auth

Configure Postmark as Supabase's custom SMTP so all auth emails go through Postmark.

### 1. Get Postmark SMTP credentials

Postmark SMTP uses different credentials than the Server API token. Generate SMTP credentials:

1. Log into [Postmark](https://account.postmarkapp.com) and select your Server
2. Go to **Message Streams** → **Default Transactional Stream** → **Settings**
3. Scroll to **SMTP** → **Generate an SMTP token**
4. Copy the **Access Key** (username) and **Secret Key** (password) — the Secret Key is shown only once

### 2. Configure Supabase SMTP

1. Open **Supabase Dashboard** → your project → **Authentication** → **Email Templates**
2. Scroll to **SMTP Settings** → Enable **Custom SMTP**
3. Enter:

| Field | Value |
|-------|-------|
| **Host** | `smtp.postmarkapp.com` |
| **Port** | `587` |
| **Username** | Your Postmark SMTP Access Key |
| **Password** | Your Postmark SMTP Secret Key |
| **Sender email** | Verified address (e.g. `noreply@matchindeed.com`) |
| **Sender name** | `MatchIndeed` |

4. Click **Save**

After saving, all auth emails (signup, password reset, magic links) go through Postmark. No app code changes needed.

---

## Redirect URLs

The verification link must point to your app. Add all used URLs in:

**Supabase Dashboard** → **Authentication** → **URL Configuration** → **Redirect URLs**

Examples:

```
https://www.matchindeed.com/**
https://michaels-mac-mini.tail0b12a7.ts.net:8443/**
http://localhost:3001/**
```

---

## Environment Variable

Set `NEXT_PUBLIC_APP_URL` to the URL testers use:

- **Tailscale testing:** `https://michaels-mac-mini.tail0b12a7.ts.net:8443`
- **Production:** `https://www.matchindeed.com`
- **Local:** `http://localhost:3001`

The verification link uses this for `emailRedirectTo`. If it's wrong, the link will point to the wrong domain.

---

## "Email rate limit exceeded"

When users see this error on registration, Supabase's built-in email provider has hit its hourly limit (typically 2–4 emails/hour). **Fix:** Configure Postmark SMTP in Supabase (see above) so verification emails use Postmark.

---

## Quick Checks

1. **Supabase Auth logs**  
   Dashboard → Logs → Auth — look for email send errors.

2. **Spam folder**  
   Ask testers to check spam/junk.

3. **Postmark Activity**  
   Check [Postmark Activity](https://account.postmarkapp.com/servers/) for delivery status, bounces, or blocks.

---

## Resend verification email button

Users can use **Resend verification email** on the verify-email page. That also goes through Supabase Auth and uses the same Postmark SMTP.
