"use client";

/**
 * CloudflareTurnstile — Invisible bot-protection widget.
 *
 * Renders the Cloudflare Turnstile challenge on auth pages (register, login,
 * forgot-password) to block bots and automated abuse.
 *
 * Setup:
 * 1. Create a Turnstile widget at https://dash.cloudflare.com → Turnstile
 * 2. Set NEXT_PUBLIC_TURNSTILE_SITE_KEY (client) and TURNSTILE_SECRET_KEY (server)
 *
 * Usage:
 *   <CloudflareTurnstile onVerify={(token) => setTurnstileToken(token)} />
 *
 * The parent form should pass the token to the API route, which verifies it
 * server-side using `verifyTurnstileToken()` from "@/lib/turnstile".
 */

import { useEffect, useRef, useCallback } from "react";

interface CloudflareTurnstileProps {
  /** Called with the verification token when the challenge passes */
  onVerify: (token: string) => void;
  /** Called when the token expires (user should re-verify) */
  onExpire?: () => void;
  /** Called when verification fails */
  onError?: () => void;
  /** Widget theme — defaults to "light" */
  theme?: "light" | "dark" | "auto";
}

// Global flag to track script loading state
let scriptLoaded = false;
let scriptLoading = false;

export default function CloudflareTurnstile({
  onVerify,
  onExpire,
  onError,
  theme = "light",
}: CloudflareTurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !siteKey) return;
    if (widgetIdRef.current !== null) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const turnstile = (window as any).turnstile;
    if (!turnstile) return;

    widgetIdRef.current = turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme,
      callback: onVerify,
      "expired-callback": onExpire,
      "error-callback": onError,
    });
  }, [siteKey, theme, onVerify, onExpire, onError]);

  useEffect(() => {
    if (!siteKey) return;

    // If script already loaded, render immediately
    if (scriptLoaded) {
      renderWidget();
      return;
    }

    // If script is loading, wait for it
    if (scriptLoading) {
      const interval = setInterval(() => {
        if (scriptLoaded) {
          clearInterval(interval);
          renderWidget();
        }
      }, 100);
      return () => clearInterval(interval);
    }

    // Load the Turnstile script
    scriptLoading = true;
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      scriptLoading = false;
      renderWidget();
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup widget on unmount
      if (widgetIdRef.current !== null) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).turnstile?.remove(widgetIdRef.current);
        } catch {
          // Silently ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, renderWidget]);

  // If no site key configured, don't render anything (dev mode graceful skip)
  if (!siteKey) return null;

  return <div ref={containerRef} className="my-2" />;
}
