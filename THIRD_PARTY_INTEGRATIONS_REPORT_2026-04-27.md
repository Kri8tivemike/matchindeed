# MatchIndeed Third-Party Integrations Report

Date verified: April 27, 2026
Website reviewed: `https://matchindeed.com`

## Purpose

This report lists the third-party platforms, API services, and external providers currently connected to the MatchIndeed website or implemented in the codebase for website operations.

This report does not expose any secret values. It lists:

- provider name
- service purpose
- provider website or API URL
- configuration status
- the environment variable names used by the app

## Production-Confirmed Active Integrations

These services were confirmed as configured on the live production website as of April 27, 2026.

| Provider | Purpose in MatchIndeed | Provider URL / API URL | Production status | Environment variables used |
| --- | --- | --- | --- | --- |
| Supabase | Core backend, authentication, database, storage, and realtime features | [https://supabase.com](https://supabase.com), `https://szmkvcifwopbnatsdcmw.supabase.co` | Confirmed active | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Stripe | Subscription payments and wallet credit checkout | [https://stripe.com](https://stripe.com), [https://api.stripe.com](https://api.stripe.com) | Confirmed active | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` |
| Google Maps Places API | Address and location autocomplete | [https://developers.google.com/maps](https://developers.google.com/maps), `https://maps.googleapis.com/maps/api/js` | Confirmed active | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| OneSignal | Push notifications to users | [https://onesignal.com](https://onesignal.com), [https://dashboard.onesignal.com](https://dashboard.onesignal.com), `https://onesignal.com/api/v1/notifications` | Confirmed active | `NEXT_PUBLIC_ONESIGNAL_APP_ID`, `ONESIGNAL_REST_KEY` |
| Resend | Transactional email sending | [https://resend.com](https://resend.com), [https://api.resend.com](https://api.resend.com) | Confirmed active | `RESEND_API_KEY`, `EMAIL_FROM` |
| Zoom | Video meeting creation and meeting links | [https://marketplace.zoom.us](https://marketplace.zoom.us), `https://zoom.us/oauth/token`, `https://api.zoom.us/v2/users/me/meetings` | Confirmed active | `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` |
| TheHive.ai | Content moderation for photos and text | [https://thehive.ai](https://thehive.ai), `https://api.thehive.ai` | Confirmed active | `THEHIVE_SECRET_KEY` |
| OpenAI | AI-assisted moderation and identity-related image checks | [https://platform.openai.com](https://platform.openai.com), `https://api.openai.com/v1/responses` | Confirmed active | `OPENAI_API_KEY` |
| Customer.io | Behavioral messaging, lifecycle events, campaign triggers | [https://customer.io](https://customer.io), `https://track.customer.io/api/v1`, `https://api.customer.io/v1` | Confirmed active | `CUSTOMERIO_SITE_ID`, `CUSTOMERIO_API_KEY`, `CUSTOMERIO_APP_API_KEY` |

## Partially Configured or Incomplete Integrations

These providers are implemented in the project, but the live production environment appears incomplete based on the available server-side configuration review.

| Provider | Purpose in MatchIndeed | Provider URL / API URL | Current status | Environment variables observed |
| --- | --- | --- | --- | --- |
| Zoho | Planned support, CRM, operations, analytics, and back-office tooling | [https://www.zoho.com](https://www.zoho.com), [https://api-console.zoho.com](https://api-console.zoho.com), `https://accounts.zoho.com` | Only partially configured on production | `ZOHO_ORG_ID` confirmed, but OAuth credentials were not confirmed in production env |

## Implemented In Code But Not Confirmed As Live-Configured

These services are present in the codebase and may be planned, optional, or environment-dependent, but they were not confirmed as configured on the production server during this review.

| Provider | Purpose in MatchIndeed | Provider URL / API URL | Status |
| --- | --- | --- | --- |
| Sentry | Error tracking and production monitoring | [https://sentry.io](https://sentry.io) | Implemented in code, not production-confirmed |
| Cloudflare Turnstile | Bot protection on forms and registration | [https://dash.cloudflare.com](https://dash.cloudflare.com), `https://challenges.cloudflare.com/turnstile/v0/siteverify` | Implemented in code, not production-confirmed |
| FingerprintJS | Device fingerprinting and fraud reduction | [https://fingerprint.com](https://fingerprint.com) | Implemented in code, not production-confirmed |
| Mixpanel | Product analytics and event tracking | [https://mixpanel.com](https://mixpanel.com), `https://api.mixpanel.com/track` | Implemented in code, not production-confirmed |
| IPQualityScore | IP and email fraud scoring | [https://www.ipqualityscore.com](https://www.ipqualityscore.com) | Implemented in code, not production-confirmed |
| Africa's Talking | SMS delivery option | [https://africastalking.com](https://africastalking.com), `https://api.africastalking.com/version1/messaging` | Implemented in code, not production-confirmed |
| Sinch | Alternative SMS delivery option | [https://sinch.com](https://sinch.com), `https://us.sms.api.sinch.com` | Implemented in code, not production-confirmed |
| ImageKit | Image CDN and optimization option | [https://imagekit.io](https://imagekit.io) | Implemented in env template, not production-confirmed |

## Key Client Notes

- The website currently depends heavily on Supabase, Stripe, Zoom, Resend, OneSignal, Google Maps, TheHive.ai, OpenAI, and Customer.io.
- Stripe is clearly active for payments, but `STRIPE_WEBHOOK_SECRET` was not confirmed in the reviewed production `.env` files. This should be reviewed carefully because subscription or payment finalization can depend on a correctly configured webhook.
- Zoho support exists in the codebase, but the production setup looked incomplete during this review.
- Several security and analytics services exist in code but do not appear fully enabled in the reviewed production environment.

## Source Verification Basis

This report was compiled from:

- the active Next.js application code
- environment variable references in source files
- local project environment files
- a direct production server environment review performed on April 27, 2026

## Reference Implementation Areas

These project files show where the integrations are currently used:

- Supabase: `src/lib/supabase.ts`
- Stripe checkout: `src/app/api/create-checkout-session/route.ts`
- Resend email: `src/lib/email.ts`
- Zoom meetings: `src/lib/zoom.ts`
- OneSignal push: `src/lib/onesignal.ts`
- Google Places autocomplete: `src/components/GooglePlacesAutocomplete.tsx`
- Customer.io tracking: `src/lib/customerio.ts`
- TheHive.ai and OpenAI moderation: `src/lib/content-moderation.ts`
- Zoho integration utilities: `src/lib/zoho.ts`
