/**
 * Customer.io Behavioral Email/Messaging Integration
 *
 * Sends user events and profile data to Customer.io for:
 * - Re-engagement campaigns ("You haven't logged in for 7 days")
 * - Onboarding drips ("Complete your profile to get more matches")
 * - Milestone celebrations ("You got your first match!")
 * - Win-back campaigns ("We miss you — here are 3 new matches")
 *
 * Environment variables required:
 *   CUSTOMERIO_SITE_ID   — from https://customer.io
 *   CUSTOMERIO_API_KEY   — Track API key
 *
 * Usage:
 *   import { customerio } from "@/lib/customerio";
 *   await customerio.identify(userId, { email, name, tier });
 *   await customerio.track(userId, "profile_completed", { completionPercentage: 100 });
 */

const CUSTOMERIO_API_URL = "https://track.customer.io/api/v1";

function getAuthHeader(): string | null {
  const siteId = process.env.CUSTOMERIO_SITE_ID;
  const apiKey = process.env.CUSTOMERIO_API_KEY;
  if (!siteId || !apiKey) return null;
  return `Basic ${Buffer.from(`${siteId}:${apiKey}`).toString("base64")}`;
}

async function cioRequest(
  path: string,
  method: "PUT" | "POST" | "DELETE",
  body?: Record<string, unknown>
): Promise<boolean> {
  const auth = getAuthHeader();
  if (!auth) {
    console.warn("[Customer.io] Missing credentials — skipping");
    return false;
  }

  try {
    const response = await fetch(`${CUSTOMERIO_API_URL}${path}`, {
      method,
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return response.ok;
  } catch (error) {
    console.error("[Customer.io] Request failed:", error);
    return false;
  }
}

export const customerio = {
  /**
   * Identify/update a user in Customer.io.
   * Call on signup, login, and profile updates.
   */
  async identify(
    userId: string,
    attributes: {
      email: string;
      first_name?: string;
      last_name?: string;
      subscription_tier?: string;
      profile_completed?: boolean;
      city?: string;
      country?: string;
      gender?: string;
      age?: number;
      created_at?: number; // Unix timestamp
      [key: string]: unknown;
    }
  ) {
    return cioRequest(`/customers/${userId}`, "PUT", attributes);
  },

  /**
   * Track a behavioral event for a user.
   * Customer.io uses these to trigger campaigns.
   */
  async track(
    userId: string,
    eventName: string,
    data?: Record<string, unknown>
  ) {
    return cioRequest(`/customers/${userId}/events`, "POST", {
      name: eventName,
      data: data || {},
    });
  },

  /**
   * Track an anonymous event (before user is identified).
   */
  async trackAnonymous(eventName: string, data?: Record<string, unknown>) {
    return cioRequest("/events", "POST", {
      name: eventName,
      data: data || {},
    });
  },

  /**
   * Delete a user from Customer.io (e.g., account deletion).
   */
  async deleteUser(userId: string) {
    return cioRequest(`/customers/${userId}`, "DELETE");
  },
};

// ---------------------------------------------------------------
// Pre-defined events for Customer.io campaigns
// ---------------------------------------------------------------
export const CIO_EVENTS = {
  // Onboarding
  SIGNED_UP: "signed_up",
  PROFILE_COMPLETED: "profile_completed",
  PREFERENCES_SET: "preferences_set",
  FIRST_PHOTO_UPLOADED: "first_photo_uploaded",

  // Engagement
  FIRST_LIKE: "first_like",
  FIRST_MATCH: "first_match",
  FIRST_MESSAGE_SENT: "first_message_sent",
  FIRST_MEETING_REQUESTED: "first_meeting_requested",

  // Retention
  RETURNED_AFTER_INACTIVITY: "returned_after_inactivity",
  SUBSCRIPTION_UPGRADED: "subscription_upgraded",
  SUBSCRIPTION_CANCELLED: "subscription_cancelled",

  // Milestones
  TEN_MATCHES: "ten_matches",
  FIRST_MEETING_COMPLETED: "first_meeting_completed",
} as const;
