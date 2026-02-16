"use client";

/**
 * Mixpanel Analytics Integration
 *
 * Centralized analytics tracking for MatchIndeed.
 * Tracks key user events for funnel analysis, retention, and feature usage.
 *
 * Environment variable required:
 *   NEXT_PUBLIC_MIXPANEL_TOKEN — from https://mixpanel.com
 *
 * Usage:
 *   import { analytics } from "@/lib/analytics";
 *   analytics.track("profile_completed", { gender: "male" });
 *
 * Key funnels to track:
 *   signup → profile_complete → first_like → first_match → first_message → meeting_request → payment
 */

import mixpanel from "mixpanel-browser";

const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
let initialized = false;

/**
 * Initialize Mixpanel (called once on app load).
 */
function ensureInit() {
  if (initialized || !MIXPANEL_TOKEN) return;

  mixpanel.init(MIXPANEL_TOKEN, {
    track_pageview: "url-with-path",
    persistence: "localStorage",
    ignore_dnt: false, // Respect Do Not Track
  });

  initialized = true;
}

/**
 * Analytics API — wraps Mixpanel with graceful no-ops when not configured.
 */
export const analytics = {
  /**
   * Identify a user (call on login/signup).
   * Links all future events to this user.
   */
  identify(userId: string, properties?: Record<string, unknown>) {
    ensureInit();
    if (!MIXPANEL_TOKEN) return;

    mixpanel.identify(userId);
    if (properties) {
      mixpanel.people.set(properties);
    }
  },

  /**
   * Track a custom event.
   */
  track(event: string, properties?: Record<string, unknown>) {
    ensureInit();
    if (!MIXPANEL_TOKEN) return;

    mixpanel.track(event, properties);
  },

  /**
   * Set user profile properties (persistent).
   */
  setUserProperties(properties: Record<string, unknown>) {
    ensureInit();
    if (!MIXPANEL_TOKEN) return;

    mixpanel.people.set(properties);
  },

  /**
   * Increment a numeric user property (e.g., "total_likes").
   */
  increment(property: string, value = 1) {
    ensureInit();
    if (!MIXPANEL_TOKEN) return;

    mixpanel.people.increment(property, value);
  },

  /**
   * Reset identity (call on logout).
   */
  reset() {
    ensureInit();
    if (!MIXPANEL_TOKEN) return;

    mixpanel.reset();
  },
};

// ---------------------------------------------------------------
// Pre-defined event names (for type safety and consistency)
// ---------------------------------------------------------------
export const ANALYTICS_EVENTS = {
  // Auth
  SIGNUP: "signup",
  LOGIN: "login",
  LOGOUT: "logout",

  // Profile
  PROFILE_COMPLETED: "profile_completed",
  PROFILE_UPDATED: "profile_updated",
  PHOTO_UPLOADED: "photo_uploaded",
  PREFERENCES_SET: "preferences_set",

  // Discovery
  PROFILE_VIEWED: "profile_viewed",
  PROFILE_LIKED: "profile_liked",
  PROFILE_PASSED: "profile_passed",

  // Matches
  MATCH_MADE: "match_made",
  MATCH_VIEWED: "match_viewed",

  // Messaging
  MESSAGE_SENT: "message_sent",
  CONVERSATION_OPENED: "conversation_opened",

  // Meetings
  MEETING_REQUESTED: "meeting_requested",
  MEETING_ACCEPTED: "meeting_accepted",
  MEETING_COMPLETED: "meeting_completed",
  MEETING_CANCELLED: "meeting_cancelled",

  // Payments
  SUBSCRIPTION_STARTED: "subscription_started",
  WALLET_TOPUP: "wallet_topup",
  CREDITS_PURCHASED: "credits_purchased",

  // Engagement
  SEARCH_PERFORMED: "search_performed",
  FILTER_APPLIED: "filter_applied",
  TOP_PICKS_VIEWED: "top_picks_viewed",
} as const;
