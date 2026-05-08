"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { shouldSkipBackgroundRequest } from "@/lib/request-errors";

const STORAGE_KEY = "matchindeed:realtime-backoff-until";
const BACKOFF_MS = 2 * 60 * 1000;
const FAILURE_STATUSES = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);
const removingChannels = new WeakSet<RealtimeChannel>();

function readBackoffUntil(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeBackoffUntil(until: number): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (until > 0) {
      window.sessionStorage.setItem(STORAGE_KEY, String(until));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures and fall back to the current render state.
  }
}

export function shouldUseRealtime(): boolean {
  if (shouldSkipBackgroundRequest()) {
    return false;
  }

  return readBackoffUntil() <= Date.now();
}

export function noteRealtimeSubscribed(): void {
  writeBackoffUntil(0);
}

export function isRealtimeFailureStatus(status: string): boolean {
  return FAILURE_STATUSES.has(status);
}

export function noteRealtimeFailure(status: string): boolean {
  if (!isRealtimeFailureStatus(status)) {
    return false;
  }

  writeBackoffUntil(Date.now() + BACKOFF_MS);
  return true;
}

export function getRealtimeBackoffRemainingMs(now = Date.now()): number {
  return Math.max(0, readBackoffUntil() - now);
}

export function removeRealtimeChannelSafely(
  client: { removeChannel: (channel: RealtimeChannel) => Promise<unknown> },
  channel: RealtimeChannel | null | undefined
): boolean {
  if (!channel || removingChannels.has(channel)) {
    return false;
  }

  removingChannels.add(channel);
  void client.removeChannel(channel).finally(() => {
    removingChannels.delete(channel);
  });
  return true;
}
