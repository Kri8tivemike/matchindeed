import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

    // Build query — try with read_at column first, fallback without it
    let notifications: any[] = [];
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
    } catch (err) {
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
    const mappedNotifications = notifications.map((n: any) => ({
      ...n,
      read: hasReadAtColumn ? !!n.read_at : false,
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
    const { notification_ids, mark_all_read } = body;

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
      { error: "Either notification_ids or mark_all_read is required" },
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
