/**
 * Sentry Server-Side Configuration
 * Initializes error tracking for Node.js server (API routes, SSR).
 * Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring — capture 10% of server transactions
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Environment tag
  environment: process.env.NODE_ENV,
});
