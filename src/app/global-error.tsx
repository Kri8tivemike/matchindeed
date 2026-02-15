"use client";

/**
 * Global Error Boundary
 * Catches unhandled errors in the root layout and reports them to Sentry.
 * This is the last-resort error UI shown to users when something breaks.
 */
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto max-w-md text-center px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">
            Something went wrong
          </h2>
          <p className="mb-6 text-sm text-gray-600">
            We encountered an unexpected error. Our team has been notified.
          </p>
          <button
            onClick={reset}
            className="rounded-full bg-[#1f419a] px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#17357b]"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
