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

/**
 * Returns a Set of user IDs that should be excluded from feeds/listings.
 * Includes both users I blocked AND users who blocked me.
 */
export async function getBlockedUserIds(): Promise<Set<string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) return new Set();

    const myId = session.user.id;

    // Fetch both directions: users I blocked + users who blocked me
    const [blockedByMe, blockedMe] = await Promise.all([
      supabase
        .from("blocked_users")
        .select("blocked_id")
        .eq("blocker_id", myId),
      supabase
        .from("blocked_users")
        .select("blocker_id")
        .eq("blocked_id", myId),
    ]);

    const ids = new Set<string>();

    // If blocked_users table doesn't exist (404), gracefully return empty set
    if (blockedByMe.error || blockedMe.error) {
      return ids;
    }

    if (blockedByMe.data) {
      blockedByMe.data.forEach((row) => ids.add(row.blocked_id));
    }
    if (blockedMe.data) {
      blockedMe.data.forEach((row) => ids.add(row.blocker_id));
    }

    return ids;
  } catch {
    // Table may not exist yet — return empty set silently
    return new Set();
  }
}
