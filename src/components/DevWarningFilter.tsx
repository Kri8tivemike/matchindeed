"use client";

import { useEffect } from "react";

/**
 * DevWarningFilter Component
 * 
 * Suppresses known Next.js 16 development warnings that are triggered by
 * the dev tools overlay hover inspection feature. These warnings are:
 * - "params are being enumerated" - Triggered when hovering over components
 *   that receive params as props (which are now Promises in Next.js 15+)
 * 
 * This component only runs in development mode and doesn't affect production builds.
 */
export function DevWarningFilter() {
  useEffect(() => {
    // Only run in development
    if (process.env.NODE_ENV !== "development") return;

    // Store the original console.error
    const originalConsoleError = console.error;

    // Override console.error to filter out specific Next.js dev warnings
    console.error = (...args: unknown[]) => {
      const message = args[0];
      if (typeof message === "string") {
        // Suppress known Next.js 16 dev tools warnings
        if (
          message.includes("params are being enumerated") ||
          message.includes("searchParams") && message.includes("Promise")
        ) {
          // These are known Next.js 16 dev tools issues triggered by hover inspection
          return;
        }
      }

      // Pass through all other errors
      originalConsoleError.apply(console, args);
    };

    // Cleanup: restore original console.error on unmount
    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  // This component doesn't render anything
  return null;
}
