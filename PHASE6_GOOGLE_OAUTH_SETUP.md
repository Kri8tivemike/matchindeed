# Phase 6: Google OAuth Setup

## Overview

MatchIndeed supports "Continue with Google" on login and register pages. To enable it, configure the Google provider in Supabase.

## Supabase Dashboard Setup

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Providers**
2. Enable **Google** and add:
   - **Client ID** (from Google Cloud Console)
   - **Client Secret** (from Google Cloud Console)

## Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. Create **OAuth 2.0 Client ID** (type: Web application)
3. **Authorized JavaScript origins:**
   - `https://matchindeed.com` (production)
   - `http://localhost:3001` (development)
4. **Authorized redirect URIs:**
   - Supabase callback URL from Dashboard (e.g. `https://<project-ref>.supabase.co/auth/v1/callback`)
   - Add your app callback for local dev if needed
5. Copy Client ID and Client Secret to Supabase

## Redirect URLs (Supabase)

In **Authentication** → **URL Configuration**, add to **Redirect URLs**:

- `https://matchindeed.com/auth/callback`
- `http://localhost:3001/auth/callback`

## Files Added (Phase 6)

- `src/app/auth/callback/route.ts` — OAuth callback, session exchange, user provisioning
- `src/components/SocialAuthButtons.tsx` — Google sign-in button
- Login & Register pages — "Continue with Google" / "Or sign up with email"
