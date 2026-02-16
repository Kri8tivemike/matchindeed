"use client";

/**
 * FingerprintProvider — Wraps the app with FingerprintJS Pro context.
 *
 * Provides device fingerprinting capabilities to detect:
 * - Multi-account abuse (same device, multiple accounts)
 * - Ban evasion (banned user creates new email)
 * - Fraud patterns (same device used for chargebacks)
 *
 * Setup:
 * 1. Create account at https://fingerprint.com
 * 2. Set NEXT_PUBLIC_FINGERPRINT_API_KEY in .env
 *
 * Usage in child components:
 *   const { getVisitorId } = useFingerprint();
 *   const visitorId = await getVisitorId();
 */

import {
  FpjsProvider,
} from "@fingerprintjs/fingerprintjs-pro-react";
import { ReactNode } from "react";

interface FingerprintProviderProps {
  children: ReactNode;
}

export default function FingerprintProvider({ children }: FingerprintProviderProps) {
  const apiKey = process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY;

  // If no API key configured, render children without fingerprint context
  if (!apiKey) {
    return <>{children}</>;
  }

  return (
    <FpjsProvider
      loadOptions={{
        apiKey,
      }}
    >
      {children}
    </FpjsProvider>
  );
}
