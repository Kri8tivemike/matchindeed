/**
 * Active Status Utility
 *
 * Provides functions to format "last active" timestamps into
 * human-readable status labels and determine online/active state.
 *
 * Thresholds:
 * - Online: active within last 5 minutes
 * - Recently active: active within last 60 minutes
 * - Active today: active today
 * - Active X days ago: older activity
 */

/** Threshold in minutes to consider a user "online" */
const ONLINE_THRESHOLD_MINUTES = 5;

/** Threshold in minutes to consider "recently active" */
const RECENT_THRESHOLD_MINUTES = 60;

/**
 * Check if a timestamp indicates the user is currently online
 */
export function isOnline(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false;
  const diff = Date.now() - new Date(lastActiveAt).getTime();
  return diff < ONLINE_THRESHOLD_MINUTES * 60 * 1000;
}

/**
 * Check if a timestamp indicates recent activity (within 1 hour)
 */
export function isRecentlyActive(lastActiveAt: string | null): boolean {
  if (!lastActiveAt) return false;
  const diff = Date.now() - new Date(lastActiveAt).getTime();
  return diff < RECENT_THRESHOLD_MINUTES * 60 * 1000;
}

/**
 * Format a last_active_at timestamp into a user-friendly status label
 *
 * Returns: { label, color, dotColor, isOnline }
 */
export function getActiveStatus(lastActiveAt: string | null): {
  label: string;
  color: string;        // Text color class
  dotColor: string;     // Dot color class (for status indicator)
  isOnline: boolean;
} {
  if (!lastActiveAt) {
    return {
      label: "New member",
      color: "text-gray-400",
      dotColor: "bg-gray-300",
      isOnline: false,
    };
  }

  const now = Date.now();
  const activeTime = new Date(lastActiveAt).getTime();
  const diffMs = now - activeTime;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Online (within 5 minutes)
  if (diffMinutes < ONLINE_THRESHOLD_MINUTES) {
    return {
      label: "Online now",
      color: "text-green-600",
      dotColor: "bg-green-500",
      isOnline: true,
    };
  }

  // Recently active (within 1 hour)
  if (diffMinutes < RECENT_THRESHOLD_MINUTES) {
    return {
      label: `Active ${diffMinutes}m ago`,
      color: "text-emerald-500",
      dotColor: "bg-emerald-400",
      isOnline: false,
    };
  }

  // Active today (within 24 hours)
  if (diffHours < 24) {
    return {
      label: `Active ${diffHours}h ago`,
      color: "text-blue-500",
      dotColor: "bg-blue-400",
      isOnline: false,
    };
  }

  // Active within a week
  if (diffDays < 7) {
    return {
      label: `Active ${diffDays}d ago`,
      color: "text-gray-500",
      dotColor: "bg-gray-400",
      isOnline: false,
    };
  }

  // Older than a week
  return {
    label: `Active ${diffDays}d ago`,
    color: "text-gray-400",
    dotColor: "bg-gray-300",
    isOnline: false,
  };
}
