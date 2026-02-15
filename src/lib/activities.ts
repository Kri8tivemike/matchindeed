/**
 * Activities Helper Functions
 * 
 * Client-side utilities for user interactions (wink, like, interested)
 */

import { supabase } from "./supabase";

export type ActivityType = "wink" | "like" | "interested" | "rejected";

export interface ActivityResponse {
  success: boolean;
  activity?: any;
  mutual_match?: boolean;
  limits?: {
    day: { used: number; limit: number };
    week: { used: number; limit: number };
    month: { used: number; limit: number };
  };
  error?: string;
  limit?: number;
  used?: number;
  period?: "day" | "week" | "month";
}

/**
 * Create a user activity (wink, like, or interested)
 */
export async function createActivity(
  targetUserId: string,
  activityType: ActivityType
): Promise<ActivityResponse> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Call API endpoint
    const response = await fetch("/api/activities", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_user_id: targetUserId,
        activity_type: activityType,
        user_id: user.id, // Pass user_id for validation
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to create activity",
        limit: data.limit,
        used: data.used,
        period: data.period,
      };
    }

    return data;
  } catch (error) {
    console.error("Error creating activity:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get user's activities (sent or received)
 */
export async function getActivities(
  type?: "sent" | "received",
  activityType?: ActivityType
) {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { activities: [], error: "Not authenticated" };
    }

    // Build query params
    const params = new URLSearchParams();
    params.append("user_id", user.id);
    if (type) params.append("type", type);
    if (activityType) params.append("activity_type", activityType);

    const response = await fetch(`/api/activities?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      return { activities: [], error: data.error || "Failed to fetch activities" };
    }

    return data;
  } catch (error) {
    console.error("Error fetching activities:", error);
    return {
      activities: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Delete a user activity (unlike, unwink, etc.)
 */
export async function deleteActivity(
  activityId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // Get auth token for the request
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    // Call API endpoint
    const params = new URLSearchParams();
    params.append("activity_id", activityId);
    params.append("user_id", user.id); // Pass user_id for validation

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`/api/activities?${params.toString()}`, {
      method: "DELETE",
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to delete activity",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting activity:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
