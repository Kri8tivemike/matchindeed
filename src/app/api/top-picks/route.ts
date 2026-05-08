import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateTopPicks } from "@/lib/top-picks-algorithm";
import { toStateCountryLabel } from "@/lib/location";
import {
  getMinimumRequestableMeetingStartIso,
  hasRequestableMeetingAvailability,
} from "@/lib/meetings/request-availability";
import {
  matchesPartnerGenderPreference,
  resolvePartnerGenderPreference,
} from "@/lib/matching/interest-preference";
import { evaluateGenderEligibility } from "@/lib/matching/gender-rules";

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

type StoredTopPick = {
  id: string;
  target_user_id: string;
  score: number;
  pick_date: string;
};

type AccountRow = {
  id: string;
  display_name: string | null;
  account_status: string | null;
  profile_visible?: boolean | null;
  calendar_enabled?: boolean | null;
};

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  date_of_birth: string | null;
  location: string | null;
  gender: string | null;
  photos: string[] | null;
  profile_photo_url: string | null;
  height_cm: number | null;
  education_level: string | null;
  religion: string | null;
  have_children: string | null;
  want_children: string | null;
  smoking_habits: string | null;
};

/**
 * Helper to get authenticated user from Bearer token
 */
async function getAuthUser(request: NextRequest): Promise<string | null> {
  // Try to get from Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      return user.id;
    }
  }

  // Compatibility fallback for older clients that pass user_id in query params.
  const { searchParams } = new URL(request.url);
  const userIdParam = searchParams.get("user_id");
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
    const userId = await getAuthUser(request);
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [{ data: userPreferences, error: userPreferencesError }, { data: requesterProfile }] =
      await Promise.all([
        supabaseAdmin
          .from("user_preferences")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("user_profiles")
          .select("gender")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
    if (userPreferencesError) {
      console.warn("Top picks preference lookup warning:", userPreferencesError);
    }
    const requesterGender = requesterProfile?.gender || null;
    const partnerGenderPreference = resolvePartnerGenderPreference({
      partnerGenderPreference: userPreferences?.partner_gender_preference || null,
      legacyPartnerExperience: userPreferences?.partner_experience || null,
      requesterGender,
    });

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
      const storedPicks = existingPicks as StoredTopPick[];
      const targetUserIds = storedPicks.map((pick) => pick.target_user_id);
      
      // Fetch accounts for these users
      const { data: accounts } = await supabaseAdmin
        .from("accounts")
        .select("id, display_name, account_status, profile_visible, calendar_enabled")
        .in("id", targetUserIds);

      const { data: availabilityRows } = await supabaseAdmin
        .from("meeting_availability")
        .select("user_id")
        .in("user_id", targetUserIds)
        .gte("scheduled_at_utc", getMinimumRequestableMeetingStartIso());
      
      const accountMap = new Map((accounts as AccountRow[] | null || []).map((acc) => [acc.id, acc]));
      const slotsSet = new Set(
        ((availabilityRows || []) as Array<{ user_id: string }>).map((row) => row.user_id)
      );
      
      // Fetch profiles for these users
      const { data: profiles } = await supabaseAdmin
        .from("user_profiles")
        .select("user_id, first_name, last_name, date_of_birth, location, gender, height_cm, photos, profile_photo_url, education_level, religion, have_children, want_children, smoking_habits, updated_at, ethnicity")
        .in("user_id", targetUserIds);
      
      const profileMap = new Map((profiles as ProfileRow[] | null || []).map((prof) => [prof.user_id, prof]));
      
      const picks = storedPicks
        .map((pick) => {
          const profile = profileMap.get(pick.target_user_id);
          const account = accountMap.get(pick.target_user_id);

          if (
            !profile ||
            !account ||
            (account.account_status || "active") !== "active" ||
            !evaluateGenderEligibility({
              requesterGender,
              targetGender: profile.gender,
            }).allowed ||
            !matchesPartnerGenderPreference(
              profile.gender,
              partnerGenderPreference
            )
          ) {
            return null;
          }
          
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
            id: pick.id,
            user_id: pick.target_user_id,
            name: profile.first_name || account?.display_name || "User",
            age,
            city: toStateCountryLabel(profile.location) || null,
            imageUrl: primaryPhoto,
            score: pick.score,
            hasCalendarSlots: hasRequestableMeetingAvailability(
              account,
              slotsSet.has(pick.target_user_id)
            ),
            // Additional profile data for display
            height_cm: profile.height_cm || null,
            education_level: profile.education_level || null,
            religion: profile.religion || null,
            have_children: profile.have_children || null,
            want_children: profile.want_children || null,
            smoking: profile.smoking_habits || null,
          };
        })
        .filter((pick): pick is NonNullable<typeof pick> => Boolean(pick));

      if (picks.length > 0) {
        return NextResponse.json({ picks, generated: false });
      }

      // Existing picks are stale for the user's current preference; regenerate.
      await supabaseAdmin
        .from("user_top_picks")
        .delete()
        .eq("user_id", userId)
        .eq("pick_date", today);
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
    const targetUserIds = compatibilityScores.map((score) => score.profile.user_id);
    const [{ data: accounts }, { data: availabilityRows }] = await Promise.all([
      supabaseAdmin
        .from("accounts")
        .select("id, account_status, profile_visible, calendar_enabled")
        .in("id", targetUserIds),
      supabaseAdmin
        .from("meeting_availability")
        .select("user_id")
        .in("user_id", targetUserIds)
        .gte("scheduled_at_utc", getMinimumRequestableMeetingStartIso()),
    ]);

    const accountMap = new Map(
      ((accounts || []) as AccountRow[]).map((account) => [account.id, account])
    );
    const slotsSet = new Set(
      ((availabilityRows || []) as Array<{ user_id: string }>).map((row) => row.user_id)
    );

    const picks = compatibilityScores.map(score => {
      const profile = score.profile;
      const account = accountMap.get(profile.user_id);
      
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
        city: toStateCountryLabel(profile.location) || null,
        imageUrl: primaryPhoto,
        score: score.score,
        hasCalendarSlots: hasRequestableMeetingAvailability(
          account,
          slotsSet.has(profile.user_id)
        ),
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
