import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluateGenderEligibility } from "@/lib/matching/gender-rules";
import { sendPushNotificationIfAllowed } from "@/lib/onesignal";
import {
  getAccountState,
  isTargetInteractionUnavailable,
  resolveOwnInteractionBlockMessage,
  TARGET_ACCOUNT_INACTIVE_MESSAGE,
} from "@/lib/account-interactions";

/**
 * Activities API Route
 * 
 * Handles user interactions: wink, like, interested
 * Features:
 * - Activity limit enforcement based on user tier
 * - Prevents duplicate actions
 * - Creates notifications for target users
 * - Detects mutual matches
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create admin client for bypassing RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

type ActivityType = "wink" | "like" | "interested" | "rejected";
type PositiveActivityType = Exclude<ActivityType, "rejected">;
type ActivityBody = {
  user_id?: string;
  target_user_id?: string;
  activity_type?: ActivityType;
};

/**
 * Check if user has reached their activity limit
 */
async function checkActivityLimit(
  userId: string,
  activityType: ActivityType,
  period: "day" | "week" | "month"
): Promise<{ allowed: boolean; limit: number; used: number }> {
  try {
    // Get user's tier
    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("tier")
      .eq("id", userId)
      .single();

    if (!account?.tier) {
      return { allowed: false, limit: 0, used: 0 };
    }

    // Get activity limits for user's tier
    const { data: limits } = await supabaseAdmin
      .from("user_activity_limits")
      .select("*")
      .eq("tier", account.tier)
      .single();

    if (!limits) {
      // No limits set, allow unlimited
      return { allowed: true, limit: Infinity, used: 0 };
    }

    // Determine limit field based on activity type and period
    const limitField = `${activityType}s_per_${period}` as keyof typeof limits;
    const limit = (limits[limitField] as number) || Infinity;

    if (limit === Infinity) {
      return { allowed: true, limit: Infinity, used: 0 };
    }

    // Calculate period start date
    const now = new Date();
    let periodStart: Date;
    
    if (period === "day") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "week") {
      const dayOfWeek = now.getDay();
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - dayOfWeek);
      periodStart.setHours(0, 0, 0, 0);
    } else {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Count activities in this period
    const { count } = await supabaseAdmin
      .from("user_activities")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("activity_type", activityType)
      .gte("created_at", periodStart.toISOString());

    const used = count || 0;
    const allowed = used < limit;

    return { allowed, limit, used };
  } catch (error) {
    console.error("Error checking activity limit:", error);
    return { allowed: false, limit: 0, used: 0 };
  }
}

/**
 * Check if a mutual positive interaction exists.
 */
async function checkMutualMatch(
  userId: string,
  targetUserId: string
): Promise<boolean> {
  try {
    // Check if target user has already sent any positive activity to the current user.
    const { data: targetActivity } = await supabaseAdmin
      .from("user_activities")
      .select("activity_type")
      .eq("user_id", targetUserId)
      .eq("target_user_id", userId)
      .in("activity_type", ["like", "interested", "wink"])
      .maybeSingle();

    return !!targetActivity;
  } catch (error) {
    console.error("Error checking mutual match:", error);
    return false;
  }
}

/**
 * Create notification for target user
 */
async function createNotification(
  userId: string,
  targetUserId: string,
  activityType: PositiveActivityType
): Promise<void> {
  try {
    const activityLabels: Record<string, string> = {
      wink: "winked at you",
      like: "liked you",
      interested: "is interested in you",
    };

    const label = activityLabels[activityType] || "interacted with you";

    await supabaseAdmin.from("notifications").insert({
      user_id: targetUserId,
      type: activityType,
      title: "New Activity",
      message: `Someone ${label}`,
      data: {
        from_user_id: userId,
        activity_type: activityType,
      },
    });

    const senderName = await getUserDisplayName(userId);
    const pushCopy: Record<PositiveActivityType, { title: string; message: string }> = {
      like: {
        title: `${senderName} liked you`,
        message: "Open Likes to like back or pass.",
      },
      wink: {
        title: `${senderName} winked at you`,
        message: "See who noticed you on MatchIndeed.",
      },
      interested: {
        title: `${senderName} is interested in you`,
        message: "Open Likes to respond.",
      },
    };

    await sendPushNotificationIfAllowed({
      userId: targetUserId,
      type: activityType,
      title: pushCopy[activityType].title,
      message: pushCopy[activityType].message,
      url: "/dashboard/likes?tab=received",
      data: {
        from_user_id: userId,
        activity_type: activityType,
      },
    });
  } catch (error) {
    console.error("Error creating notification:", error);
  }
}

async function getUserDisplayName(userId: string): Promise<string> {
  const [{ data: account }, { data: profile }] = await Promise.all([
    supabaseAdmin
      .from("accounts")
      .select("display_name, email")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  return (
    profile?.first_name ||
    account?.display_name ||
    account?.email?.split("@")[0] ||
    "Someone"
  );
}

async function getUserGender(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_profiles")
    .select("gender")
    .eq("user_id", userId)
    .maybeSingle();

  return typeof data?.gender === "string" ? data.gender : null;
}

/**
 * Helper to get authenticated user from request
 * For client-side calls, user_id is passed in body/query params and validated
 */
async function getAuthUser(
  request: NextRequest,
  body?: ActivityBody
): Promise<string | null> {
  // Check query params for user_id (for DELETE requests)
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get("user_id");

  // If user_id is in body, validate it exists
  if (body?.user_id) {
    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("id", body.user_id)
      .single();
    
    if (account) {
      return body.user_id;
    }
  }

  // If user_id is in query params, validate it exists
  if (userIdParam) {
    const { data: account } = await supabaseAdmin
      .from("accounts")
      .select("id")
      .eq("id", userIdParam)
      .single();
    
    if (account) {
      return userIdParam;
    }
  }

  // Try to get from Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      return user.id;
    }
  }

  return null;
}

/**
 * POST /api/activities
 * Create a new user activity (wink, like, interested)
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ActivityBody;
    const { target_user_id, activity_type } = body;

    // Validate input
    if (!target_user_id || !activity_type) {
      return NextResponse.json(
        { error: "target_user_id and activity_type are required" },
        { status: 400 }
      );
    }

    if (!["wink", "like", "interested", "rejected"].includes(activity_type)) {
      return NextResponse.json(
        { error: "Invalid activity_type. Must be 'wink', 'like', 'interested', or 'rejected'" },
        { status: 400 }
      );
    }
    const normalizedActivityType = activity_type as ActivityType;

    // Get authenticated user
    const userId = await getAuthUser(request, body);
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [requesterAccount, targetAccount] = await Promise.all([
      getAccountState(supabaseAdmin, userId),
      getAccountState(supabaseAdmin, target_user_id),
    ]);

    const requesterBlockedMessage = resolveOwnInteractionBlockMessage(requesterAccount);
    if (requesterBlockedMessage) {
      return NextResponse.json(
        { error: requesterBlockedMessage, code: "account_deactivated" },
        { status: 403 }
      );
    }

    if (isTargetInteractionUnavailable(targetAccount)) {
      return NextResponse.json(
        { error: TARGET_ACCOUNT_INACTIVE_MESSAGE, code: "target_unavailable" },
        { status: 403 }
      );
    }

    // Prevent self-interaction
    if (userId === target_user_id) {
      return NextResponse.json(
        { error: "Cannot interact with yourself" },
        { status: 400 }
      );
    }

    if (normalizedActivityType !== "rejected") {
      const [requesterGender, targetGender] = await Promise.all([
        getUserGender(userId),
        getUserGender(target_user_id),
      ]);

      const genderEligibility = evaluateGenderEligibility({
        requesterGender,
        targetGender,
      });

      if (!genderEligibility.allowed) {
        return NextResponse.json(
          { error: genderEligibility.message, code: genderEligibility.code },
          { status: 403 }
        );
      }
    }

    // Check if activity already exists (only for positive interactions)
    // Allow updating "rejected" status if user changes their mind
    if (activity_type !== "rejected") {
      const { data: existingActivity } = await supabaseAdmin
        .from("user_activities")
        .select("id")
        .eq("user_id", userId)
        .eq("target_user_id", target_user_id)
        .eq("activity_type", activity_type)
        .maybeSingle();

      if (existingActivity) {
        return NextResponse.json(
          { error: "Activity already exists", mutual_match: false },
          { status: 400 }
        );
      }
    } else {
      // For "rejected", check if there's an existing rejected activity
      // If user rejects again, just return success (no need to create duplicate)
      const { data: existingRejected } = await supabaseAdmin
        .from("user_activities")
        .select("id")
        .eq("user_id", userId)
        .eq("target_user_id", target_user_id)
        .eq("activity_type", "rejected")
        .maybeSingle();

      if (existingRejected) {
        // Already rejected, just return success
        return NextResponse.json({
          success: true,
          message: "Profile already rejected",
        });
      }
    }

    // Check activity limits (only for positive interactions, not for "rejected")
    let dayCheck = { allowed: true, limit: Infinity, used: 0 };
    let weekCheck = { allowed: true, limit: Infinity, used: 0 };
    let monthCheck = { allowed: true, limit: Infinity, used: 0 };
    
    if (normalizedActivityType !== "rejected") {
      dayCheck = await checkActivityLimit(userId, normalizedActivityType as "wink" | "like" | "interested", "day");
      weekCheck = await checkActivityLimit(userId, normalizedActivityType as "wink" | "like" | "interested", "week");
      monthCheck = await checkActivityLimit(userId, normalizedActivityType as "wink" | "like" | "interested", "month");
    }

    if (!dayCheck.allowed) {
      return NextResponse.json(
        {
          error: "Daily limit reached",
          limit: dayCheck.limit,
          used: dayCheck.used,
          period: "day",
        },
        { status: 429 }
      );
    }

    if (!weekCheck.allowed) {
      return NextResponse.json(
        {
          error: "Weekly limit reached",
          limit: weekCheck.limit,
          used: weekCheck.used,
          period: "week",
        },
        { status: 429 }
      );
    }

    if (!monthCheck.allowed) {
      return NextResponse.json(
        {
          error: "Monthly limit reached",
          limit: monthCheck.limit,
          used: monthCheck.used,
          period: "month",
        },
        { status: 429 }
      );
    }

    // Create activity
    const { data: activity, error: activityError } = await supabaseAdmin
      .from("user_activities")
      .insert({
        user_id: userId,
        target_user_id,
        activity_type: normalizedActivityType,
      })
      .select()
      .single();

    if (activityError) {
      console.error("Error creating activity:", activityError);
      return NextResponse.json(
        { error: "Failed to create activity" },
        { status: 500 }
      );
    }

    // Check for mutual positive activity on any non-rejected action.
    let mutualMatch = false;
    if (normalizedActivityType !== "rejected") {
      mutualMatch = await checkMutualMatch(userId, target_user_id);
    }

    // Create notification for target user (only for positive interactions)
    // Don't notify users when they're rejected
    if (normalizedActivityType !== "rejected") {
      await createNotification(userId, target_user_id, normalizedActivityType);
    }

    // If mutual match, create notification for both users
    if (mutualMatch) {
      await supabaseAdmin.from("notifications").insert([
        {
          user_id: userId,
          type: "mutual_match",
          title: "It's a Match!",
          message: "You both showed interest in each other!",
          data: {
            matched_user_id: target_user_id,
          },
        },
        {
          user_id: target_user_id,
          type: "mutual_match",
          title: "It's a Match!",
          message: "You both showed interest in each other!",
          data: {
            matched_user_id: userId,
          },
        },
      ]);

      const [actorName, targetName] = await Promise.all([
        getUserDisplayName(userId),
        getUserDisplayName(target_user_id),
      ]);

      await Promise.all([
        sendPushNotificationIfAllowed({
          userId,
          type: "mutual_match",
          title: "It's a Match!",
          message: `You matched with ${targetName}. Say hello when you're ready.`,
          url: "/dashboard/matches",
          data: {
            matched_user_id: target_user_id,
          },
        }),
        sendPushNotificationIfAllowed({
          userId: target_user_id,
          type: "mutual_match",
          title: "It's a Match!",
          message: `You matched with ${actorName}. Say hello when you're ready.`,
          url: "/dashboard/matches",
          data: {
            matched_user_id: userId,
          },
        }),
      ]);
    }

    return NextResponse.json({
      success: true,
      activity,
      mutual_match: mutualMatch,
      limits: {
        day: { used: dayCheck.used, limit: dayCheck.limit },
        week: { used: weekCheck.used, limit: weekCheck.limit },
        month: { used: monthCheck.used, limit: monthCheck.limit },
      },
    });
  } catch (error) {
    console.error("Error in POST /api/activities:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/activities
 * Get user's activities (sent and received)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user_id_param = searchParams.get("user_id");

    // Get authenticated user
    const userId = await getAuthUser(request, {
      user_id: user_id_param ?? undefined,
    });
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const type = searchParams.get("type"); // "sent" or "received"
    const activityType = searchParams.get("activity_type"); // "wink", "like", "interested"

    let query = supabaseAdmin
      .from("user_activities")
      .select(`
        *,
        target_user:target_user_id (
          id,
          email,
          display_name,
          user_profiles (
            first_name,
            photos,
            profile_photo_url,
            location,
            date_of_birth
          )
        ),
        user:user_id (
          id,
          email,
          display_name,
          user_profiles (
            first_name,
            photos,
            profile_photo_url,
            location,
            date_of_birth
          )
        )
      `);

    if (type === "sent") {
      query = query.eq("user_id", userId);
    } else if (type === "received") {
      query = query.eq("target_user_id", userId);
    } else {
      // Get both sent and received
      query = query.or(`user_id.eq.${userId},target_user_id.eq.${userId}`);
    }

    if (activityType) {
      query = query.eq("activity_type", activityType);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching activities:", error);
      return NextResponse.json(
        { error: "Failed to fetch activities" },
        { status: 500 }
      );
    }

    return NextResponse.json({ activities: data || [] });
  } catch (error) {
    console.error("Error in GET /api/activities:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/activities
 * Delete a user activity (unlike, unwink, etc.)
 * Query params:
 * - activity_id: ID of the activity to delete
 * - target_user_id: Target user ID (alternative to activity_id)
 * - activity_type: Type of activity to delete (required if using target_user_id)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activityId = searchParams.get("activity_id");
    const targetUserId = searchParams.get("target_user_id");
    const activityType = searchParams.get("activity_type") as ActivityType | null;

    // Get authenticated user
    const userId = await getAuthUser(request, {});
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate input
    if (!activityId && (!targetUserId || !activityType)) {
      return NextResponse.json(
        { error: "Either activity_id or (target_user_id and activity_type) are required" },
        { status: 400 }
      );
    }

    // Allow deleting rejected activities too (for "unreject" functionality)
    if (activityType && !["wink", "like", "interested", "rejected"].includes(activityType)) {
      return NextResponse.json(
        { error: "Invalid activity_type. Must be 'wink', 'like', 'interested', or 'rejected'" },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from("user_activities")
      .select("id, user_id, target_user_id, activity_type");

    if (activityId) {
      // Delete by activity ID
      query = query.eq("id", activityId);
    } else {
      // Delete by target_user_id and activity_type
      query = query
        .eq("user_id", userId)
        .eq("target_user_id", targetUserId)
        .eq("activity_type", activityType);
    }

    // First, verify the activity exists and belongs to the user
    const { data: existingActivity, error: fetchError } = await query.maybeSingle();

    if (fetchError || !existingActivity) {
      return NextResponse.json(
        { error: "Activity not found" },
        { status: 404 }
      );
    }

    // Verify the activity belongs to the current user
    if (existingActivity.user_id !== userId) {
      return NextResponse.json(
        { error: "Not authorized to delete this activity" },
        { status: 403 }
      );
    }

    // Delete the activity
    const { error: deleteError } = await supabaseAdmin
      .from("user_activities")
      .delete()
      .eq("id", existingActivity.id);

    if (deleteError) {
      console.error("Error deleting activity:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete activity" },
        { status: 500 }
      );
    }

    // If deleting a positive interaction (like, wink, interested), also remove any "rejected" activity
    // for the same target user. This allows users to see profiles again after unliking them.
    if (existingActivity.activity_type !== "rejected" && existingActivity.target_user_id) {
      const { error: rejectDeleteError } = await supabaseAdmin
        .from("user_activities")
        .delete()
        .eq("user_id", userId)
        .eq("target_user_id", existingActivity.target_user_id)
        .eq("activity_type", "rejected");

      if (rejectDeleteError) {
        // Log but don't fail - this is a convenience feature
        console.warn("Error removing rejected activity (non-critical):", rejectDeleteError);
      } else {
        console.log(`Removed rejected activity for user ${existingActivity.target_user_id} after unliking`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Activity deleted successfully",
    });
  } catch (error) {
    console.error("Error in DELETE /api/activities:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
