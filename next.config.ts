import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  devIndicators: {
    position: "bottom-right",
  },
  // Allow Tailscale Funnel domain for dev server WebSocket connections
  // This enables remote testing via https://michaels-mac-mini.tail0b12a7.ts.net:8443
  allowedDevOrigins: [
    "https://michaels-mac-mini.tail0b12a7.ts.net:8443",
    "https://michaels-mac-mini.tail0b12a7.ts.net",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "szmkvcifwopbnatsdcmw.supabase.co",
      },
      {
        protocol: "https",
        hostname: "ik.imagekit.io",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry build-time options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps for better stack traces
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,

  // Automatically tree-shake Sentry logger in production
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
  },
});
