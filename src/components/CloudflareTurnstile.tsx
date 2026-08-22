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

import { useEffect, useRef } from "react";

interface CloudflareTurnstileProps {
  /** Called with the verification token when the challenge passes */
  onVerify: (token: string) => void;
  /** Called when the token expires (user should re-verify) */
  onExpire?: () => void;
  /** Called when verification fails */
  onError?: () => void;
  /** Widget theme — defaults to "light" */
  theme?: "light" | "dark" | "auto";
  /** Change this value to reset the existing widget without remounting it */
  resetKey?: number;
}

type TurnstileAPI = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      "response-field"?: boolean;
    }
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}

let scriptPromise: Promise<TurnstileAPI> | null = null;

function loadTurnstile(): Promise<TurnstileAPI> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );
    const script = existingScript || document.createElement("script");

    const handleLoad = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        scriptPromise = null;
        reject(new Error("Turnstile loaded without exposing its API."));
      }
    };
    const handleError = () => {
      scriptPromise = null;
      reject(new Error("Unable to load Turnstile."));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existingScript) {
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

export default function CloudflareTurnstile({
  onVerify,
  onExpire,
  onError,
  theme = "light",
  resetKey = 0,
}: CloudflareTurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  const previousResetKeyRef = useRef(resetKey);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  }, [onVerify, onExpire, onError]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || widgetIdRef.current !== null) {
          return;
        }

        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token) => onVerifyRef.current(token),
          "expired-callback": () => onExpireRef.current?.(),
          "error-callback": () => onErrorRef.current?.(),
          "response-field": false,
        });
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current?.();
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null) {
        try {
          window.turnstile?.remove(widgetIdRef.current);
        } catch {
          // Silently ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme]);

  useEffect(() => {
    if (resetKey === previousResetKeyRef.current) return;
    previousResetKeyRef.current = resetKey;

    if (widgetIdRef.current !== null) {
      window.turnstile?.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  // If no site key configured, don't render anything (dev mode graceful skip)
  if (!siteKey) return null;

  return <div ref={containerRef} className="my-2 min-h-[65px]" />;
}
