"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ADMIN_LOGIN_PATH, isAdminPathname } from "@/lib/admin/path";
import { COORDINATOR_LOGIN_PATH } from "@/lib/coordinator/path";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const LAST_ACTIVITY_KEY = "matchindeed:last-activity-at";
const IDLE_SIGN_OUT_KEY = "matchindeed:idle-sign-out-at";

const USER_PROTECTED_PREFIXES = ["/dashboard", "/host"];
const COORDINATOR_PROTECTED_PREFIXES = ["/coordinator"];

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "click",
  "keydown",
  "mousedown",
  "mousemove",
  "scroll",
  "touchstart",
  "wheel",
];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function getTimeoutRedirect(pathname: string | null) {
  if (!pathname) return null;

  if (isAdminPathname(pathname)) {
    return ADMIN_LOGIN_PATH;
  }

  if (startsWithAny(pathname, COORDINATOR_PROTECTED_PREFIXES)) {
    return COORDINATOR_LOGIN_PATH;
  }

  if (startsWithAny(pathname, USER_PROTECTED_PREFIXES)) {
    return "/login";
  }

  return null;
}

function readLastActivity() {
  const value = window.localStorage.getItem(LAST_ACTIVITY_KEY);
  const timestamp = value ? Number(value) : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function writeLastActivity(timestamp = Date.now()) {
  window.localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
}

function withReason(url: string, reason: string) {
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set("reason", reason);
  return `${path}?${params.toString()}`;
}

export function IdleSessionTimeout() {
  const pathname = usePathname();
  const router = useRouter();
  const signingOutRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const redirectTo = getTimeoutRedirect(pathname);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        signingOutRef.current = false;
        writeLastActivity();
      }

      if (event === "SIGNED_OUT" || !session) {
        signingOutRef.current = false;
        window.localStorage.removeItem(LAST_ACTIVITY_KEY);
        window.localStorage.removeItem(IDLE_SIGN_OUT_KEY);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!redirectTo) return;

    let isMounted = true;

    const clearIdleTimer = () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const signOutForInactivity = async () => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      clearIdleTimer();

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          await supabase.auth.signOut();
        }
      } catch (error) {
        console.error("Idle sign-out failed:", error);
      } finally {
        window.localStorage.setItem(IDLE_SIGN_OUT_KEY, String(Date.now()));
        if (isMounted) {
          router.replace(withReason(redirectTo, "idle"));
        }
      }
    };

    const scheduleIdleTimer = () => {
      clearIdleTimer();

      const lastActivity = readLastActivity() || Date.now();
      const elapsed = Date.now() - lastActivity;
      const remaining = Math.max(IDLE_TIMEOUT_MS - elapsed, 0);

      timeoutRef.current = window.setTimeout(() => {
        void signOutForInactivity();
      }, remaining);
    };

    const handleActivity = () => {
      const lastActivity = readLastActivity();

      if (lastActivity && Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
        void signOutForInactivity();
        return;
      }

      writeLastActivity();
      scheduleIdleTimer();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      handleActivity();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY) {
        scheduleIdleTimer();
      }

      if (event.key === IDLE_SIGN_OUT_KEY && event.newValue) {
        void signOutForInactivity();
      }
    };

    if (!readLastActivity()) {
      writeLastActivity();
    }

    scheduleIdleTimer();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    window.addEventListener("focus", handleActivity);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      isMounted = false;
      clearIdleTimer();
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
      window.removeEventListener("focus", handleActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [redirectTo, router]);

  return null;
}
