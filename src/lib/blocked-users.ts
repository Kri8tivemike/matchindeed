/**
 * Blocked Users Utility
 *
 * Provides a client-side function to fetch all user IDs that should be
 * hidden from the current user's view. This includes:
 * - Users the current user has blocked (blocker_id = me)
 * - Users who have blocked the current user (blocked_id = me)
 *
 * Blocking is bidirectional in effect for privacy and safety.
 */

import { supabase } from "@/lib/supabase";
import { shouldSkipBackgroundRequest } from "@/lib/request-errors";

const BLOCKED_IDS_TTL_MS = 60_000;

let blockedIdsCache:
  | {
      userId: string;
      value: Set<string>;
      expiresAt: number;
    }
  | null = null;

/**
 * Returns a Set of user IDs that should be excluded from feeds/listings.
 * Includes both users I blocked AND users who blocked me.
 */
export async function getBlockedUserIds(): Promise<Set<string>> {
  try {
    const now = Date.now();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const currentUserId = session?.user?.id;
    if (!currentUserId) return new Set();

    if (
      blockedIdsCache &&
      blockedIdsCache.userId === currentUserId &&
      blockedIdsCache.expiresAt > now
    ) {
      return new Set(blockedIdsCache.value);
    }

    if (shouldSkipBackgroundRequest()) {
      return new Set();
    }

    const res = await fetch("/api/profile/block/ids", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!res.ok) return new Set();

    const payload = await res.json().catch(() => null);
    const blockedIds = Array.isArray(payload?.blocked_ids)
      ? payload.blocked_ids.filter((id: unknown): id is string => typeof id === "string")
      : [];
    const value = new Set<string>(blockedIds);
    blockedIdsCache = {
      userId: currentUserId,
      value,
      expiresAt: now + BLOCKED_IDS_TTL_MS,
    };

    return new Set(value);
  } catch {
    // Blocking is non-critical for rendering. Fail closed to empty.
    return blockedIdsCache ? new Set(blockedIdsCache.value) : new Set();
  }
}
