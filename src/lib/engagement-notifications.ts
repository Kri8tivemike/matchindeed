export const ENGAGEMENT_NOTIFICATION_TYPES = {
  received: ["like", "wink", "interested"],
  views: ["profile_view"],
} as const;

export type EngagementNotificationCategory =
  keyof typeof ENGAGEMENT_NOTIFICATION_TYPES;

export const ENGAGEMENT_UNREAD_UPDATED_EVENT =
  "matchindeed:engagement-unread-updated";

export function getEngagementNotificationCategory(
  notificationType: string
): EngagementNotificationCategory | null {
  if ((ENGAGEMENT_NOTIFICATION_TYPES.received as readonly string[]).includes(notificationType)) {
    return "received";
  }

  if ((ENGAGEMENT_NOTIFICATION_TYPES.views as readonly string[]).includes(notificationType)) {
    return "views";
  }

  return null;
}
