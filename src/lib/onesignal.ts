/**
 * OneSignal Push Notifications — Server-Side Utility
 *
 * Sends push notifications to users via OneSignal's REST API.
 * Works with the notification preferences already stored in the database.
 *
 * Environment variables required:
 *   NEXT_PUBLIC_ONESIGNAL_APP_ID — from https://dashboard.onesignal.com
 *   ONESIGNAL_REST_KEY           — REST API key from OneSignal dashboard
 *
 * Client-side SDK setup is in OneSignalProvider.tsx.
 */

const ONESIGNAL_API_URL = "https://onesignal.com/api/v1/notifications";

interface PushNotificationOptions {
  /** The user's Supabase auth ID (used as external_id in OneSignal) */
  userId: string;
  /** Notification title */
  title: string;
  /** Notification body message */
  message: string;
  /** Optional URL to open when clicked */
  url?: string;
  /** Optional data payload */
  data?: Record<string, string>;
}

/**
 * Send a push notification to a specific user via OneSignal.
 * The user is identified by their Supabase userId (set as external_id
 * in the client SDK when the user logs in).
 */
export async function sendPushNotification(
  options: PushNotificationOptions
): Promise<boolean> {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const restKey = process.env.ONESIGNAL_REST_KEY;

  if (!appId || !restKey) {
    console.warn("[OneSignal] Missing NEXT_PUBLIC_ONESIGNAL_APP_ID or ONESIGNAL_REST_KEY — skipping push");
    return false;
  }

  try {
    const body = {
      app_id: appId,
      include_aliases: {
        external_id: [options.userId],
      },
      target_channel: "push",
      headings: { en: options.title },
      contents: { en: options.message },
      url: options.url || undefined,
      data: options.data || undefined,
      // Auto-dismiss after 24 hours
      ttl: 86400,
    };

    const response = await fetch(ONESIGNAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${restKey}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (result.errors) {
      console.error("[OneSignal] Push failed:", result.errors);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[OneSignal] Push request failed:", error);
    return false;
  }
}

/**
 * Send push to multiple users at once.
 */
export async function sendBulkPush(
  userIds: string[],
  title: string,
  message: string,
  url?: string
): Promise<boolean> {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const restKey = process.env.ONESIGNAL_REST_KEY;

  if (!appId || !restKey) return false;
  if (userIds.length === 0) return false;

  try {
    const body = {
      app_id: appId,
      include_aliases: {
        external_id: userIds,
      },
      target_channel: "push",
      headings: { en: title },
      contents: { en: message },
      url: url || undefined,
      ttl: 86400,
    };

    const response = await fetch(ONESIGNAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${restKey}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    return !result.errors;
  } catch (error) {
    console.error("[OneSignal] Bulk push failed:", error);
    return false;
  }
}
