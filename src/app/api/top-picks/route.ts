import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateTopPicks } from "@/lib/top-picks-algorithm";

/**
 * Top Picks API Route
 * 
 * Handles fetching and generating daily top picks for users
 * Features:
 * - Fetches current day's top picks
 * - Generates picks on-the-fly if not available
 * - Stores picks in database for consistency
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create admin client for bypassing RLS
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Helper to get authenticated user from request
 */
async function getAuthUser(request: NextRequest, body?: any): Promise<string | null> {
  // Check query params for user_id
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
 * GET /api/top-picks
 * Get current day's top picks for authenticated user
 * Generates picks if they don't exist for today
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const userId = await getAuthUser(request, {});
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

    // Check if top picks exist for today
    const { data: existingPicks, error: fetchError } = await supabaseAdmin
      .from("user_top_picks")
      .select(`
        id,
        target_user_id,
        score,
        pick_date
      `)
      .eq("user_id", userId)
      .eq("pick_date", today)
      .order("score", { ascending: false })
      .limit(5);

    if (fetchError) {
      console.error("Error fetching top picks:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch top picks" },
        { status: 500 }
      );
    }

    // If picks exist for today, fetch profile data for them
    if (existingPicks && existingPicks.length > 0) {
      const targetUserIds = existingPicks.map((pick: any) => pick.target_user_id);
      
      // Fetch accounts for these users
      const { data: accounts } = await supabaseAdmin
        .from("accounts")
        .select("id, display_name, account_status")
        .in("id", targetUserIds);
      
      const accountMap = new Map((accounts || []).map((acc: any) => [acc.id, acc]));
      
      // Fetch profiles for these users
      const { data: profiles } = await supabaseAdmin
        .from("user_profiles")
        .select("user_id, first_name, last_name, date_of_birth, location, height_cm, photos, profile_photo_url, education_level, religion, have_children, want_children, smoking_habits, updated_at, ethnicity")
        .in("user_id", targetUserIds);
      
      const profileMap = new Map((profiles || []).map((prof: any) => [prof.user_id, prof]));
      
      const picks = existingPicks.map((pick: any) => {
        const profile = profileMap.get(pick.target_user_id);
        const account = accountMap.get(pick.target_user_id);
        
        // Calculate age
        let age: number | null = null;
        if (profile?.date_of_birth) {
          const birthDate = new Date(profile.date_of_birth);
          const today = new Date();
          age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
        }

        // Get primary photo
        const primaryPhoto = (profile?.photos && profile.photos.length > 0)
          ? profile.photos[0]
          : profile?.profile_photo_url || "/placeholder-profile.svg";

        return {
          id: pick.id,
          user_id: pick.target_user_id,
          name: profile?.first_name || account?.display_name || "User",
          age,
          city: profile?.location || null,
          imageUrl: primaryPhoto,
          score: pick.score,
          // Additional profile data for display
          height_cm: profile?.height_cm || null,
          education_level: profile?.education_level || null,
          religion: profile?.religion || null,
          have_children: profile?.have_children || null,
          want_children: profile?.want_children || null,
          smoking: profile?.smoking_habits || null,
        };
      });

      return NextResponse.json({ picks, generated: false });
    }

    // No picks for today, generate them
    console.log(`Generating top picks for user ${userId} for date ${today}`);
    const compatibilityScores = await generateTopPicks(userId, 5);

    if (compatibilityScores.length === 0) {
      return NextResponse.json({ picks: [], generated: true, message: "No compatible profiles found" });
    }

    // Store picks in database
    const picksToInsert = compatibilityScores.map(score => ({
      user_id: userId,
      target_user_id: score.profile.user_id,
      pick_date: today,
      score: score.score,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("user_top_picks")
      .insert(picksToInsert);

    if (insertError) {
      console.error("Error storing top picks:", insertError);
      // Continue anyway, return the picks even if storage fails
    }

    // Format picks for response
    const picks = compatibilityScores.map(score => {
      const profile = score.profile;
      
      // Calculate age
      let age: number | null = null;
      if (profile.date_of_birth) {
        const birthDate = new Date(profile.date_of_birth);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      }

      // Get primary photo
      const primaryPhoto = (profile.photos && profile.photos.length > 0)
        ? profile.photos[0]
        : profile.profile_photo_url || "/placeholder-profile.svg";

      return {
        id: null, // Will be set after insert
        user_id: profile.user_id,
        name: profile.first_name || "User",
        age,
        city: profile.location || null,
        imageUrl: primaryPhoto,
        score: score.score,
          // Additional profile data
          height_cm: profile.height_cm || null,
          education_level: profile.education_level || null,
          religion: profile.religion || null,
          have_children: profile.have_children || null,
          want_children: profile.want_children || null,
          smoking: profile.smoking || null,
      };
    });

    return NextResponse.json({ picks, generated: true });
  } catch (error) {
    console.error("Error in GET /api/top-picks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
