/**
 * Notification Preferences Helper — MatchIndeed
 *
 * Server-side utility to check a user's notification preferences
 * before sending in-app notifications or emails. Provides a simple
 * API: getUserNotificationPrefs() and shouldSend().
 *
 * Categories map notification types to preference keys:
 *   - likes/wink/interested → "likes"
 *   - mutual_match/match    → "matches"
 *   - message               → "messages"
 *   - meeting_*             → "meetings"
 *   - profile_view          → "views"
 *   - system/account/credit → "system"
 *   - marketing             → "marketing"
 */

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
export type NotificationChannel = "inapp" | "email" | "push";

export type NotificationCategory =
  | "likes"
  | "matches"
  | "messages"
  | "meetings"
  | "views"
  | "system"
  | "marketing";

export interface UserNotificationPrefs {
  likes_inapp: boolean;
  likes_email: boolean;
  likes_push: boolean;
  matches_inapp: boolean;
  matches_email: boolean;
  matches_push: boolean;
  messages_inapp: boolean;
  messages_email: boolean;
  messages_push: boolean;
  meetings_inapp: boolean;
  meetings_email: boolean;
  meetings_push: boolean;
  views_inapp: boolean;
  views_email: boolean;
  views_push: boolean;
  system_inapp: boolean;
  system_email: boolean;
  system_push: boolean;
  marketing_email: boolean;
}

// ---------------------------------------------------------------
// Defaults — used when no row exists or table is missing
// ---------------------------------------------------------------
const DEFAULTS: UserNotificationPrefs = {
  likes_inapp: true,
  likes_email: true,
  likes_push: true,
  matches_inapp: true,
  matches_email: true,
  matches_push: true,
  messages_inapp: true,
  messages_email: true,
  messages_push: true,
  meetings_inapp: true,
  meetings_email: true,
  meetings_push: true,
  views_inapp: true,
  views_email: false,
  views_push: false,
  system_inapp: true,
  system_email: true,
  system_push: true,
  marketing_email: false,
};

// ---------------------------------------------------------------
// Map notification types (from `notifications.type`) to categories
// ---------------------------------------------------------------
const TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  like: "likes",
  wink: "likes",
  interested: "likes",

  mutual_match: "matches",
  match_created: "matches",
  match_found: "matches",

  new_message: "messages",
  message: "messages",

  meeting_request: "meetings",
  meeting_accepted: "meetings",
  meeting_cancelled: "meetings",
  meeting_canceled: "meetings",
  meeting_reminder: "meetings",
  meeting_rules: "meetings",
  meeting_completed: "meetings",
  meeting_finalized: "meetings",
  meeting_response_submitted: "meetings",
  meeting_responses_complete: "meetings",
  meeting_pending_review: "meetings",
  meeting_investigation: "meetings",

  profile_view: "views",

  credit_refund: "system",
  wallet_debit: "system",
  account_warning: "system",
  profile_reactivated: "system",
  investigation_resolved: "system",

  marketing: "marketing",
  promotion: "marketing",
};

// ---------------------------------------------------------------
// Fetch a user's notification preferences
// ---------------------------------------------------------------
export async function getUserNotificationPrefs(
  userId: string
): Promise<UserNotificationPrefs> {
  try {
    const { data, error } = await supabaseAdmin
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // Table doesn't exist or other error → return defaults
    if (error || !data) {
      return { ...DEFAULTS };
    }

    // Merge with defaults to fill any missing columns
    const prefs = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as (keyof UserNotificationPrefs)[]) {
      if (data[key] !== undefined && data[key] !== null) {
        prefs[key] = data[key];
      }
    }
    return prefs;
  } catch {
    return { ...DEFAULTS };
  }
}

// ---------------------------------------------------------------
// Check if a notification should be sent
// ---------------------------------------------------------------

/**
 * Determine whether to send a notification for the given type and channel.
 *
 * @param userId   — The recipient's user ID
 * @param type     — The notification type string (e.g. "like", "meeting_request")
 * @param channel  — The delivery channel: "inapp", "email", or "push"
 * @returns true if the notification should be sent
 */
export async function shouldSend(
  userId: string,
  type: string,
  channel: NotificationChannel
): Promise<boolean> {
  // Determine category from type
  const category = TYPE_TO_CATEGORY[type] || "system";

  // System notifications are always sent via in-app (safety override)
  if (category === "system" && channel === "inapp") {
    return true;
  }

  const prefs = await getUserNotificationPrefs(userId);

  // Build the preference key (e.g. "likes_email", "meetings_inapp")
  // Marketing only has email
  if (category === "marketing") {
    return !!prefs.marketing_email;
  }

  const prefKey = `${category}_${channel}` as keyof UserNotificationPrefs;
  return !!prefs[prefKey];
}

/**
 * Convenience: check if in-app notification should be sent.
 */
export async function shouldSendInApp(
  userId: string,
  type: string
): Promise<boolean> {
  return shouldSend(userId, type, "inapp");
}

/**
 * Convenience: check if email notification should be sent.
 */
export async function shouldSendEmail(
  userId: string,
  type: string
): Promise<boolean> {
  return shouldSend(userId, type, "email");
}
