import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ENGAGEMENT_NOTIFICATION_TYPES,
  type EngagementNotificationCategory,
} from "@/lib/engagement-notifications";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type NotificationRow = {
  read_at?: string | null;
  [key: string]: unknown;
};

/**
 * Helper to get authenticated user from request
 */
async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

/**
 * GET /api/notifications
 *
 * Fetch the current user's notifications with optional filters.
 *
 * Query params:
 * - limit: number of notifications to fetch (default 20, max 100)
 * - offset: pagination offset (default 0)
 * - unread_only: "true" to fetch only unread notifications
 * - type: filter by notification type (e.g. "like", "meeting_finalized")
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Number(searchParams.get("limit") || "20"),
      100
    );
    const offset = Number(searchParams.get("offset") || "0");
    const unreadOnly = searchParams.get("unread_only") === "true";
    const typeFilter = searchParams.get("type");
    const summaryOnly = searchParams.get("summary") === "true";
    const engagementSummary = searchParams.get("engagement_summary") === "true";

    if (engagementSummary) {
      const { data: readState, error: readStateError } = await supabase
        .from("engagement_read_state")
        .select("received_seen_at, views_seen_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (readStateError) {
        console.error("Error fetching engagement read state:", readStateError);
        return NextResponse.json(
          { error: "Failed to fetch engagement notifications" },
          { status: 500 }
        );
      }

      const countUnseenByTypes = (types: readonly string[], seenAt?: string | null) => {
        let query =
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .in("type", [...types]);

        if (seenAt) {
          query = query.gt("created_at", seenAt);
        }

        return query;
      };

      const [receivedResult, viewsResult] = await Promise.all([
        countUnseenByTypes(
          ENGAGEMENT_NOTIFICATION_TYPES.received,
          readState?.received_seen_at
        ),
        countUnseenByTypes(
          ENGAGEMENT_NOTIFICATION_TYPES.views,
          readState?.views_seen_at
        ),
      ]);

      const error = receivedResult.error || viewsResult.error;
      if (error) {
        console.error("Error fetching unread engagement summary:", error);
        return NextResponse.json(
          { error: "Failed to fetch engagement notifications" },
          { status: 500 }
        );
      }

      const received = receivedResult.count || 0;
      const views = viewsResult.count || 0;
      return NextResponse.json({
        engagement_unread: { received, views, total: received + views },
      });
    }

    if (summaryOnly) {
      let countQuery = supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (unreadOnly) {
        countQuery = countQuery.is("read_at", null);
      }

      if (typeFilter) {
        countQuery = countQuery.eq("type", typeFilter);
      }

      const { count, error } = await countQuery;

      if (error) {
        if (error.message?.includes("read_at") || error.code === "42703") {
          return NextResponse.json({
            notifications: [],
            total: 0,
            unread_count: unreadOnly ? 0 : count || 0,
            limit: 0,
            offset: 0,
          });
        }

        console.error("Error fetching notification summary:", error);
        return NextResponse.json(
          { error: "Failed to fetch notifications" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        notifications: [],
        total: unreadOnly ? count || 0 : 0,
        unread_count: count || 0,
        limit: 0,
        offset: 0,
      });
    }

    // Build query — try with read_at column first, fallback without it
    let notifications: NotificationRow[] = [];
    let total = 0;
    let unreadCount = 0;
    let hasReadAtColumn = true;

    try {
      // Try fetching with read_at column
      let query = supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (unreadOnly) {
        query = query.is("read_at", null);
      }

      if (typeFilter) {
        query = query.eq("type", typeFilter);
      }

      const { data, error, count } = await query;

      if (error) {
        // If read_at column doesn't exist, fall back to basic query
        if (error.message?.includes("read_at") || error.code === "42703") {
          hasReadAtColumn = false;
        } else {
          console.error("Error fetching notifications:", error);
          return NextResponse.json(
            { error: "Failed to fetch notifications" },
            { status: 500 }
          );
        }
      } else {
        notifications = data || [];
        total = count || 0;
      }
    } catch {
      hasReadAtColumn = false;
    }

    // Fallback: query without read_at filtering
    if (!hasReadAtColumn) {
      let query = supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (typeFilter) {
        query = query.eq("type", typeFilter);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error("Error fetching notifications (fallback):", error);
        return NextResponse.json(
          { error: "Failed to fetch notifications" },
          { status: 500 }
        );
      }

      notifications = data || [];
      total = count || 0;
      // Without read_at column, all notifications are "unread"
      unreadCount = total;
    }

    // Get unread count (only if read_at column exists)
    if (hasReadAtColumn) {
      const { count: uc } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);

      unreadCount = uc || 0;
    }

    // Map notifications to include a computed `read` boolean
    const mappedNotifications = notifications.map((notification) => ({
      ...notification,
      read: hasReadAtColumn ? !!notification.read_at : false,
    }));

    return NextResponse.json({
      notifications: mappedNotifications,
      total,
      unread_count: unreadCount,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error in GET /api/notifications:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications
 *
 * Mark notifications as read.
 *
 * Body:
 * - notification_ids: string[] — specific notification IDs to mark read
 * - mark_all_read: boolean — mark all notifications as read
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notification_ids, mark_all_read, mark_engagement_read } = body;

    if (mark_engagement_read) {
      const category = mark_engagement_read as EngagementNotificationCategory;
      const types = ENGAGEMENT_NOTIFICATION_TYPES[category];

      if (!types) {
        return NextResponse.json(
          { error: "mark_engagement_read must be received or views" },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      const seenColumn = category === "received" ? "received_seen_at" : "views_seen_at";
      const { error } = await supabase.from("engagement_read_state").upsert(
        {
          user_id: user.id,
          [seenColumn]: now,
          updated_at: now,
        },
        { onConflict: "user_id" }
      );

      if (error) {
        console.error("Error marking engagement notifications as read:", error);
        return NextResponse.json(
          { error: "Failed to update engagement read state" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, category });
    }

    if (mark_all_read) {
      // Mark all of user's unread notifications as read
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);

      if (error) {
        // If read_at column doesn't exist, return success anyway (nothing to mark)
        if (error.message?.includes("read_at") || error.code === "42703") {
          return NextResponse.json({
            success: true,
            message: "Notification read tracking not yet configured. Please add a read_at column to the notifications table.",
          });
        }
        console.error("Error marking all as read:", error);
        return NextResponse.json(
          { error: "Failed to mark notifications as read" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "All notifications marked as read",
      });
    }

    if (
      notification_ids &&
      Array.isArray(notification_ids) &&
      notification_ids.length > 0
    ) {
      // Mark specific notifications as read
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", notification_ids)
        .eq("user_id", user.id);

      if (error) {
        if (error.message?.includes("read_at") || error.code === "42703") {
          return NextResponse.json({
            success: true,
            message: "Notification read tracking not yet configured.",
          });
        }
        console.error("Error marking notifications as read:", error);
        return NextResponse.json(
          { error: "Failed to mark notifications as read" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `${notification_ids.length} notification(s) marked as read`,
      });
    }

    return NextResponse.json(
      { error: "A supported notification read action is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in PATCH /api/notifications:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications
 *
 * Delete notifications.
 *
 * Body:
 * - notification_ids: string[] — specific notification IDs to delete
 * - delete_all_read: boolean — delete all read notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notification_ids, delete_all_read } = body;

    if (delete_all_read) {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user.id)
        .not("read_at", "is", null);

      if (error) {
        console.error("Error deleting read notifications:", error);
        return NextResponse.json(
          { error: "Failed to delete notifications" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "All read notifications deleted",
      });
    }

    if (
      notification_ids &&
      Array.isArray(notification_ids) &&
      notification_ids.length > 0
    ) {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .in("id", notification_ids)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error deleting notifications:", error);
        return NextResponse.json(
          { error: "Failed to delete notifications" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `${notification_ids.length} notification(s) deleted`,
      });
    }

    return NextResponse.json(
      { error: "Either notification_ids or delete_all_read is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in DELETE /api/notifications:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
