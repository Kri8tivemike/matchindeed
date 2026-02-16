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
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  return error || !user ? null : user;
}

// ---------------------------------------------------------------
// GET /api/messages
//
// Fetch messages for a match, or list all conversations.
//
// Query params:
//   match_id  — fetch messages for a specific match (paginated)
//   limit     — number of messages (default 50)
//   before    — cursor: fetch messages before this timestamp
//
// Without match_id: returns list of conversations (matches with messaging)
// ---------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("match_id");

    // -------------------------------------------------------
    // MODE 1: Fetch messages for a specific match
    // -------------------------------------------------------
    if (matchId) {
      const limit = parseInt(searchParams.get("limit") || "50", 10);
      const before = searchParams.get("before");

      // Verify user is part of this match
      const { data: match, error: matchError } = await supabase
        .from("user_matches")
        .select("id, user1_id, user2_id, messaging_enabled")
        .eq("id", matchId)
        .single();

      if (matchError || !match) {
        return NextResponse.json(
          { error: "Match not found" },
          { status: 404 }
        );
      }

      if (match.user1_id !== user.id && match.user2_id !== user.id) {
        return NextResponse.json(
          { error: "You are not part of this match" },
          { status: 403 }
        );
      }

      // Fetch messages
      let query = supabase
        .from("messages")
        .select("id, sender_id, content, message_type, read_at, created_at")
        .eq("match_id", matchId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (before) {
        query = query.lt("created_at", before);
      }

      const { data: messages, error: msgError } = await query;

      if (msgError) {
        console.error("Error fetching messages:", msgError);
        return NextResponse.json(
          { error: "Failed to fetch messages" },
          { status: 500 }
        );
      }

      // Mark unread messages from the OTHER user as read
      const partnerId =
        match.user1_id === user.id ? match.user2_id : match.user1_id;

      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("match_id", matchId)
        .eq("sender_id", partnerId)
        .is("read_at", null);

      return NextResponse.json({
        messages: (messages || []).reverse(), // Return in chronological order
        match_id: matchId,
        has_more: (messages || []).length === limit,
      });
    }

    // -------------------------------------------------------
    // MODE 2: List all conversations (matches with messaging)
    // -------------------------------------------------------
    // Try fetching with last_message_at column; fall back gracefully if it doesn't exist
    let matches: any[] | null = null;
    let matchesError: any = null;

    const { data: matchData, error: matchErr } = await supabase
      .from("user_matches")
      .select("id, user1_id, user2_id, matched_at, messaging_enabled, last_message_at, last_message_preview, meeting_id")
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .eq("messaging_enabled", true)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (matchErr && matchErr.code === "42703") {
      // Column doesn't exist yet — fallback query without last_message columns
      const { data: fallbackData, error: fallbackErr } = await supabase
        .from("user_matches")
        .select("id, user1_id, user2_id, matched_at, messaging_enabled, meeting_id")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .eq("messaging_enabled", true)
        .order("matched_at", { ascending: false });

      matches = (fallbackData || []).map((m: any) => ({
        ...m,
        last_message_at: null,
        last_message_preview: null,
      }));
      matchesError = fallbackErr;
    } else {
      matches = matchData;
      matchesError = matchErr;
    }

    if (matchesError) {
      console.error("Error fetching conversations:", matchesError);
      return NextResponse.json(
        { error: "Failed to fetch conversations" },
        { status: 500 }
      );
    }

    // Enrich with partner info and unread counts
    const conversations = [];
    for (const match of matches || []) {
      const partnerId =
        match.user1_id === user.id ? match.user2_id : match.user1_id;

      // Get partner profile
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("first_name, last_name, profile_photo_url, photos")
        .eq("user_id", partnerId)
        .single();

      // Get partner account
      const { data: account } = await supabase
        .from("accounts")
        .select("tier")
        .eq("id", partnerId)
        .single();

      // Count unread messages from partner
      const { count: unreadCount } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("match_id", match.id)
        .eq("sender_id", partnerId)
        .is("read_at", null);

      const partnerName = profile
        ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
        : "Unknown";

      const partnerPhoto =
        profile?.profile_photo_url ||
        (profile?.photos && profile.photos.length > 0
          ? profile.photos[0]
          : null);

      conversations.push({
        match_id: match.id,
        partner_id: partnerId,
        partner_name: partnerName,
        partner_photo: partnerPhoto,
        partner_tier: account?.tier || "basic",
        matched_at: match.matched_at,
        last_message_at: match.last_message_at,
        last_message_preview: match.last_message_preview,
        unread_count: unreadCount || 0,
        meeting_id: match.meeting_id,
      });
    }

    // Get total unread across all conversations
    const totalUnread = conversations.reduce(
      (sum, c) => sum + c.unread_count,
      0
    );

    return NextResponse.json({
      conversations,
      total_unread: totalUnread,
    });
  } catch (error) {
    console.error("Error in GET /api/messages:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------
// POST /api/messages
//
// Send a message to a match.
//
// Body:
//   match_id — the match to send to
//   content  — message text
// ---------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { match_id, content } = body;

    if (!match_id || !content?.trim()) {
      return NextResponse.json(
        { error: "match_id and content are required" },
        { status: 400 }
      );
    }

    // Validate message length
    if (content.trim().length > 2000) {
      return NextResponse.json(
        { error: "Message too long (max 2000 characters)" },
        { status: 400 }
      );
    }

    // Verify user is part of this match and messaging is enabled
    const { data: match, error: matchError } = await supabase
      .from("user_matches")
      .select("id, user1_id, user2_id, messaging_enabled")
      .eq("id", match_id)
      .single();

    if (matchError || !match) {
      return NextResponse.json(
        { error: "Match not found" },
        { status: 404 }
      );
    }

    if (match.user1_id !== user.id && match.user2_id !== user.id) {
      return NextResponse.json(
        { error: "You are not part of this match" },
        { status: 403 }
      );
    }

    if (!match.messaging_enabled) {
      return NextResponse.json(
        { error: "Messaging is not enabled for this match" },
        { status: 403 }
      );
    }

    // Insert the message
    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({
        match_id,
        sender_id: user.id,
        content: content.trim(),
        message_type: "text",
      })
      .select("id, sender_id, content, message_type, created_at")
      .single();

    if (insertError) {
      console.error("Error sending message:", insertError);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    // Update match last_message_at (the trigger handles this too, but do it explicitly for reliability)
    // Gracefully handle case where columns don't exist yet
    try {
      await supabase
        .from("user_matches")
        .update({
          last_message_at: message.created_at,
          last_message_preview: content.trim().substring(0, 100),
        })
        .eq("id", match_id);
    } catch {
      // Columns may not exist yet if migration hasn't been run — safe to ignore
    }

    // Send notification to the other user
    const partnerId =
      match.user1_id === user.id ? match.user2_id : match.user1_id;

    const { data: senderProfile } = await supabase
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", user.id)
      .single();

    const senderName = senderProfile?.first_name || "Your match";

    // In-app notification
    try {
      await supabase.from("notifications").insert({
        user_id: partnerId,
        type: "new_message",
        title: "New Message",
        message: `${senderName}: ${content.trim().substring(0, 80)}${content.trim().length > 80 ? "..." : ""}`,
        data: {
          match_id,
          sender_id: user.id,
          message_id: message.id,
        },
      });
    } catch (notifErr) {
      console.error("Error sending message notification:", notifErr);
    }

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("Error in POST /api/messages:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------
// PATCH /api/messages
//
// Mark messages as read.
//
// Body:
//   match_id — mark all unread messages in this match as read
// ---------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { match_id } = body;

    if (!match_id) {
      return NextResponse.json(
        { error: "match_id is required" },
        { status: 400 }
      );
    }

    // Verify user is part of this match
    const { data: match } = await supabase
      .from("user_matches")
      .select("user1_id, user2_id")
      .eq("id", match_id)
      .single();

    if (!match || (match.user1_id !== user.id && match.user2_id !== user.id)) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    // Mark all messages from the partner as read
    const partnerId =
      match.user1_id === user.id ? match.user2_id : match.user1_id;

    const { error } = await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("match_id", match_id)
      .eq("sender_id", partnerId)
      .is("read_at", null);

    if (error) {
      console.error("Error marking messages as read:", error);
      return NextResponse.json(
        { error: "Failed to mark messages as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PATCH /api/messages:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
