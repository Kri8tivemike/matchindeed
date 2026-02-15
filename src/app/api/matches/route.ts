import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Mutual Matches API
 *
 * Returns all mutual matches for the authenticated user. A "mutual match"
 * is when two users have both expressed interest in each other:
 *
 *   1. Activity-based matches — both users have a like/wink/interested
 *      activity toward each other in user_activities.
 *   2. Post-meeting matches — a record exists in user_matches
 *      (created after both users responded "yes" after a video meeting).
 *
 * The response combines both types, deduplicates by partner_id,
 * and enriches each match with profile + account data.
 *
 * GET /api/matches
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;

    // ---------------------------------------------------------------
    // 1. Fetch activity-based mutual matches
    // ---------------------------------------------------------------

    // Get all positive activities sent BY the current user
    const { data: sentActivities } = await supabase
      .from("user_activities")
      .select("target_user_id, activity_type, created_at")
      .eq("user_id", userId)
      .in("activity_type", ["like", "wink", "interested"]);

    // Get all positive activities sent TO the current user
    const { data: receivedActivities } = await supabase
      .from("user_activities")
      .select("user_id, activity_type, created_at")
      .eq("target_user_id", userId)
      .in("activity_type", ["like", "wink", "interested"]);

    // Find mutual: users who appear in both sent and received
    const sentTargets = new Set(
      (sentActivities || []).map((a) => a.target_user_id)
    );
    const receivedFrom = new Set(
      (receivedActivities || []).map((a) => a.user_id)
    );

    // Build a map of activity-based mutual matches with details
    const activityMatches = new Map<
      string,
      {
        partner_id: string;
        matched_via: "activity";
        your_activity: string;
        their_activity: string;
        matched_at: string;
      }
    >();

    for (const sent of sentActivities || []) {
      if (receivedFrom.has(sent.target_user_id)) {
        const received = (receivedActivities || []).find(
          (r) => r.user_id === sent.target_user_id
        );
        // Use the later of the two activities as the "match" time
        const matchTime =
          received && received.created_at > sent.created_at
            ? received.created_at
            : sent.created_at;

        activityMatches.set(sent.target_user_id, {
          partner_id: sent.target_user_id,
          matched_via: "activity",
          your_activity: sent.activity_type,
          their_activity: received?.activity_type || "like",
          matched_at: matchTime,
        });
      }
    }

    // ---------------------------------------------------------------
    // 2. Fetch post-meeting matches from user_matches
    // ---------------------------------------------------------------

    const { data: meetingMatches } = await supabase
      .from("user_matches")
      .select("*")
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

    const meetingMatchMap = new Map<
      string,
      {
        partner_id: string;
        matched_via: "meeting";
        match_id: string;
        messaging_enabled: boolean;
        matched_at: string;
        last_message_at: string | null;
        last_message_preview: string | null;
        meeting_id: string | null;
      }
    >();

    for (const m of meetingMatches || []) {
      const partnerId = m.user1_id === userId ? m.user2_id : m.user1_id;
      meetingMatchMap.set(partnerId, {
        partner_id: partnerId,
        matched_via: "meeting",
        match_id: m.id,
        messaging_enabled: m.messaging_enabled || false,
        matched_at: m.matched_at,
        last_message_at: m.last_message_at || null,
        last_message_preview: m.last_message_preview || null,
        meeting_id: m.meeting_id || null,
      });
    }

    // ---------------------------------------------------------------
    // 3. Combine and deduplicate
    // ---------------------------------------------------------------

    // Collect all unique partner IDs
    const allPartnerIds = new Set([
      ...activityMatches.keys(),
      ...meetingMatchMap.keys(),
    ]);

    if (allPartnerIds.size === 0) {
      return NextResponse.json({ matches: [], total: 0 });
    }

    // Fetch partner profiles
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select(
        "user_id, first_name, last_name, date_of_birth, location, photos, profile_photo_url, height_cm, ethnicity, religion, education_level, about_yourself"
      )
      .in("user_id", [...allPartnerIds]);

    const profileMap = new Map(
      (profiles || []).map((p: any) => [p.user_id, p])
    );

    // Fetch partner accounts
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, tier, display_name, email_verified")
      .in("id", [...allPartnerIds]);

    const accountMap = new Map(
      (accounts || []).map((a: any) => [a.id, a])
    );

    // Build the unified matches list
    const matches: any[] = [];

    for (const partnerId of allPartnerIds) {
      const profile = profileMap.get(partnerId);
      const account = accountMap.get(partnerId);
      const activityMatch = activityMatches.get(partnerId);
      const meetingMatch = meetingMatchMap.get(partnerId);

      // Calculate age
      let age: number | null = null;
      if (profile?.date_of_birth) {
        const birth = new Date(profile.date_of_birth);
        const today = new Date();
        age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      }

      // Get primary photo
      const photo =
        profile?.photos && profile.photos.length > 0
          ? profile.photos[0]
          : profile?.profile_photo_url || null;

      // Determine match type: if both exist, meeting takes priority
      const matchType = meetingMatch
        ? "meeting"
        : activityMatch
        ? "activity"
        : "activity";

      // Use the earliest matched_at for sorting
      const matchedAt =
        meetingMatch?.matched_at || activityMatch?.matched_at || new Date().toISOString();

      matches.push({
        partner_id: partnerId,
        match_type: matchType,
        matched_at: matchedAt,
        // Profile info
        name: profile?.first_name || account?.display_name || "User",
        age,
        location: profile?.location || null,
        photo,
        ethnicity: profile?.ethnicity || null,
        religion: profile?.religion || null,
        education: profile?.education_level || null,
        about: profile?.about_yourself || null,
        tier: account?.tier || "basic",
        verified: account?.email_verified || false,
        // Activity match details
        your_activity: activityMatch?.your_activity || null,
        their_activity: activityMatch?.their_activity || null,
        // Meeting match details
        match_id: meetingMatch?.match_id || null,
        messaging_enabled: meetingMatch?.messaging_enabled || false,
        last_message_at: meetingMatch?.last_message_at || null,
        last_message_preview: meetingMatch?.last_message_preview || null,
        meeting_id: meetingMatch?.meeting_id || null,
        // Flags
        has_activity_match: !!activityMatch,
        has_meeting_match: !!meetingMatch,
      });
    }

    // Sort by most recent match first
    matches.sort(
      (a, b) =>
        new Date(b.matched_at).getTime() - new Date(a.matched_at).getTime()
    );

    return NextResponse.json({
      matches,
      total: matches.length,
      activity_matches: activityMatches.size,
      meeting_matches: meetingMatchMap.size,
    });
  } catch (error) {
    console.error("Error in GET /api/matches:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
