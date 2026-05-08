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

import { createClient } from "@supabase/supabase-js";
import { shouldSendPush } from "@/lib/notification-preferences";
import {
  getPushQuietWindowMs,
  shouldQuietPushForRecentActivity,
} from "@/lib/push-policy";
import {
  isMissingNotificationDeliveryLogsTableError,
  type PushDeliveryStatus,
} from "@/lib/notification-delivery";

const ONESIGNAL_API_URL = "https://onesignal.com/api/v1/notifications";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://matchindeed.com"
    : "http://localhost:3001");

type PushDataValue = string | number | boolean | null;
type ColumnError = { code?: string; message?: string } | null;
type PushResultPayload = Record<string, unknown> | null;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let hasLastActiveAtColumn: boolean | null = null;
let hasNotificationDeliveryLogsTable: boolean | null = null;

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
  data?: Record<string, PushDataValue>;
}

interface ActivityPushNotificationOptions extends PushNotificationOptions {
  /** Notification type used for preference checks */
  type: string;
}

interface PushDeliveryResult {
  ok: boolean;
  status: PushDeliveryStatus;
  reason?: string;
  providerNotificationId?: string | null;
  providerPayload?: PushResultPayload;
}

function toAbsoluteUrl(url?: string) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url.startsWith("/") ? url : `/${url}`, APP_URL).toString();
}

function isOneSignalErrorResponse(result: unknown): result is { errors: unknown } {
  return typeof result === "object" && result !== null && "errors" in result;
}

function isMissingLastActiveAtColumn(error: ColumnError) {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("last_active_at")
  );
}

function getProviderNotificationId(result: PushResultPayload) {
  return typeof result?.id === "string" ? result.id : null;
}

function summarizeProviderReason(value: unknown): string | undefined {
  if (!value) return undefined;

  if (typeof value === "string") {
    return value.slice(0, 300);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => summarizeProviderReason(item))
      .filter(Boolean)
      .join("; ")
      .slice(0, 300);
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value).slice(0, 300);
    } catch {
      return "Provider returned a non-serializable error";
    }
  }

  return String(value).slice(0, 300);
}

async function logPushDelivery(
  options: ActivityPushNotificationOptions,
  result: PushDeliveryResult
) {
  if (hasNotificationDeliveryLogsTable === false) {
    return;
  }

  const insertResult = await supabaseAdmin
    .from("notification_delivery_logs")
    .insert({
      user_id: options.userId,
      channel: "push",
      notification_type: options.type,
      status: result.status,
      provider: "onesignal",
      title: options.title,
      url: toAbsoluteUrl(options.url) ?? null,
      reason: result.reason ?? null,
      provider_notification_id: result.providerNotificationId ?? null,
      metadata: {
        data: options.data ?? {},
        provider_payload: result.providerPayload ?? null,
      },
    });

  if (isMissingNotificationDeliveryLogsTableError(insertResult.error)) {
    hasNotificationDeliveryLogsTable = false;
    return;
  }

  if (insertResult.error) {
    console.error(
      "[OneSignal] Unable to write notification delivery log:",
      insertResult.error
    );
    return;
  }

  hasNotificationDeliveryLogsTable = true;
}

async function getUserLastActiveAt(userId: string): Promise<string | null> {
  if (hasLastActiveAtColumn === false) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("accounts")
    .select("last_active_at")
    .eq("id", userId)
    .maybeSingle();

  if (isMissingLastActiveAtColumn(error)) {
    hasLastActiveAtColumn = false;
    return null;
  }

  if (error) {
    console.error("[OneSignal] Unable to load last_active_at:", error);
    return null;
  }

  hasLastActiveAtColumn = true;
  return typeof data?.last_active_at === "string" ? data.last_active_at : null;
}

/**
 * Send a push notification to a specific user via OneSignal.
 * The user is identified by their Supabase userId (set as external_id
 * in the client SDK when the user logs in).
 */
async function sendPushNotificationDetailed(
  options: PushNotificationOptions
): Promise<PushDeliveryResult> {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const restKey = process.env.ONESIGNAL_REST_KEY;

  if (!appId || !restKey) {
    console.warn("[OneSignal] Missing NEXT_PUBLIC_ONESIGNAL_APP_ID or ONESIGNAL_REST_KEY — skipping push");
    return {
      ok: false,
      status: "missing_config",
      reason: "Missing NEXT_PUBLIC_ONESIGNAL_APP_ID or ONESIGNAL_REST_KEY",
    };
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
      url: toAbsoluteUrl(options.url),
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

    const result = await response.json().catch(() => null);

    if (!response.ok || isOneSignalErrorResponse(result)) {
      console.error("[OneSignal] Push failed:", response.status, result);
      return {
        ok: false,
        status: "failed_provider",
        reason:
          summarizeProviderReason(
            result && typeof result === "object" && "errors" in result
              ? result.errors
              : result
          ) ?? `HTTP ${response.status}`,
        providerPayload: result,
      };
    }

    return {
      ok: true,
      status: "sent",
      providerNotificationId: getProviderNotificationId(result),
      providerPayload: result,
    };
  } catch (error) {
    console.error("[OneSignal] Push request failed:", error);
    return {
      ok: false,
      status: "error",
      reason: summarizeProviderReason(
        error instanceof Error ? error.message : error
      ),
    };
  }
}

export async function sendPushNotification(
  options: PushNotificationOptions
): Promise<boolean> {
  const result = await sendPushNotificationDetailed(options);
  return result.ok;
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
      url: toAbsoluteUrl(url),
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

    const result = await response.json().catch(() => null);
    if (!response.ok || isOneSignalErrorResponse(result)) {
      console.error("[OneSignal] Bulk push failed:", response.status, result);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[OneSignal] Bulk push failed:", error);
    return false;
  }
}

/**
 * Send a push notification only when the recipient has enabled that
 * notification category in their preferences.
 */
export async function sendPushNotificationIfAllowed(
  options: ActivityPushNotificationOptions
): Promise<boolean> {
  try {
    const allowed = await shouldSendPush(options.userId, options.type);
    if (!allowed) {
      await logPushDelivery(options, {
        ok: false,
        status: "skipped_preference",
        reason: "Recipient disabled push notifications for this category",
      });
      return false;
    }

    const quietWindowMs = getPushQuietWindowMs(options.type);
    if (quietWindowMs > 0) {
      const lastActiveAt = await getUserLastActiveAt(options.userId);
      if (shouldQuietPushForRecentActivity(options.type, lastActiveAt)) {
        await logPushDelivery(options, {
          ok: false,
          status: "quieted_recent_activity",
          reason: `Recipient was recently active within ${quietWindowMs}ms`,
        });
        return false;
      }
    }

    const result = await sendPushNotificationDetailed({
      userId: options.userId,
      title: options.title,
      message: options.message,
      url: options.url,
      data: options.data,
    });
    await logPushDelivery(options, result);
    return result.ok;
  } catch (error) {
    console.error("[OneSignal] Preference check failed:", error);
    await logPushDelivery(options, {
      ok: false,
      status: "error",
      reason: summarizeProviderReason(
        error instanceof Error ? error.message : error
      ),
    });
    return false;
  }
}
