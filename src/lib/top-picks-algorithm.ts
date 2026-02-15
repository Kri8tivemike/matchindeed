/**
 * Top Picks Compatibility Algorithm
 * 
 * Calculates compatibility scores for profile matching based on:
 * - Preference matching (60%)
 * - Profile quality (20%)
 * - Activity level (10%)
 * - Interaction history (10%)
 */

import { createClient } from "@supabase/supabase-js";

// Lazy initialization of admin client (only for server-side use)
let supabaseAdmin: ReturnType<typeof createClient> | null = null;

function getSupabaseAdmin() {
  // This function should only be called server-side (in API routes)
  // It's used by generateTopPicks which is only called from server-side API routes
  if (typeof window !== "undefined") {
    throw new Error("getSupabaseAdmin should only be called server-side");
  }
  
  if (!supabaseAdmin) {
    // Only access these env vars server-side
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase environment variables are not set. NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
    }
    
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  }
  
  return supabaseAdmin;
}

export interface UserPreferences {
  partner_location: string | null;
  partner_age_range: string | null;
  partner_height_min_cm: number | null;
  partner_height_max_cm: number | null;
  partner_ethnicity: string[] | null;
  partner_religion: string[] | null;
  partner_education: string[] | null;
  partner_employment: string | null;
  partner_have_children: string | null;
  partner_want_children: string | null;
  partner_smoking: string | null;
  partner_drinking: string | null;
  partner_diet: string | null;
  partner_pets: string | null;
}

export interface ProfileData {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  location: string | null;
  height_cm: number | null;
  photos: string[] | null;
  profile_photo_url: string | null;
  education_level: string | null;
  employment: string | null;
  religion: string | null;
  have_children: string | null;
  want_children: string | null;
  smoking: string | null;
  drinking: string | null;
  diet: string | null;
  pets: string | null;
  ethnicity: string[] | null;
}

export interface CompatibilityScore {
  profile: ProfileData;
  score: number;
  breakdown: {
    preferences: number;
    quality: number;
    activity: number;
    interactions: number;
  };
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Check if age matches preferred range
 */
function matchesAgeRange(age: number | null, preferredRange: string | null): boolean {
  if (!age || !preferredRange) return true; // No preference = match
  
  const [min, max] = preferredRange.split("-").map(Number);
  return age >= min && age <= max;
}

/**
 * Check if location matches preference (simple string matching for now)
 */
function matchesLocation(profileLocation: string | null, preferredLocation: string | null): boolean {
  if (!preferredLocation) return true; // No preference = match
  if (!profileLocation) return false;
  
  // Simple case-insensitive matching
  return profileLocation.toLowerCase().includes(preferredLocation.toLowerCase()) ||
         preferredLocation.toLowerCase().includes(profileLocation.toLowerCase());
}

/**
 * Check if height matches preferred range
 */
function matchesHeightRange(heightCm: number | null, minCm: number | null, maxCm: number | null): boolean {
  if (!heightCm) return true; // No height data = match
  if (!minCm || !maxCm) return true; // No preference = match
  
  return heightCm >= minCm && heightCm <= maxCm;
}

/**
 * Check if array value matches preference
 */
function matchesArrayPreference(profileValue: string[] | null, preferredValue: string[] | null): boolean {
  if (!preferredValue || preferredValue.length === 0) return true; // No preference = match
  if (!profileValue || profileValue.length === 0) return false;
  
  // Check if any preferred value matches any profile value
  return preferredValue.some(pref => 
    profileValue.some(prof => 
      prof.toLowerCase() === pref.toLowerCase()
    )
  );
}

/**
 * Check if string value matches preference
 */
function matchesStringPreference(profileValue: string | null, preferredValue: string | null): boolean {
  if (!preferredValue) return true; // No preference = match
  if (!profileValue) return false;
  
  return profileValue.toLowerCase() === preferredValue.toLowerCase();
}

/**
 * Calculate preference matching score (0-60 points)
 */
function calculatePreferenceScore(
  profile: ProfileData,
  preferences: UserPreferences
): number {
  let score = 0;
  const maxScore = 60;
  const criteriaCount = 10; // Total number of criteria (reduced since some fields not in user_profiles)
  const pointsPerCriteria = maxScore / criteriaCount;

  const age = calculateAge(profile.date_of_birth);
  
  // Age range match (8 points)
  if (matchesAgeRange(age, preferences.partner_age_range)) {
    score += pointsPerCriteria * 1.3; // Slightly more weight for age
  }

  // Location match (4 points)
  if (matchesLocation(profile.location, preferences.partner_location)) {
    score += pointsPerCriteria * 0.7;
  }

  // Height range match (4 points)
  if (matchesHeightRange(
    profile.height_cm,
    preferences.partner_height_min_cm,
    preferences.partner_height_max_cm
  )) {
    score += pointsPerCriteria * 0.7;
  }

  // Education match (4 points)
  if (profile.education_level && preferences.partner_education) {
    if (matchesArrayPreference([profile.education_level], preferences.partner_education)) {
      score += pointsPerCriteria * 0.7;
    }
  } else {
    score += pointsPerCriteria * 0.7; // No preference = match
  }

  // Religion match (4 points)
  if (profile.religion && preferences.partner_religion) {
    if (matchesArrayPreference([profile.religion], preferences.partner_religion)) {
      score += pointsPerCriteria * 0.7;
    }
  } else {
    score += pointsPerCriteria * 0.7; // No preference = match
  }

  // Employment match (4 points) - not available in user_profiles, skip
  // Give points for no preference
  if (!preferences.partner_employment) {
    score += pointsPerCriteria * 0.7;
  }

  // Have children match (4 points) - profile has boolean, preferences have string
  const profileHaveChildren = profile.have_children === true ? 'yes' : (profile.have_children === false ? 'no' : null);
  if (matchesStringPreference(profileHaveChildren, preferences.partner_have_children)) {
    score += pointsPerCriteria * 0.7;
  }

  // Want children match (4 points)
  if (matchesStringPreference(profile.want_children, preferences.partner_want_children)) {
    score += pointsPerCriteria * 0.7;
  }

  // Smoking match (4 points) - profile uses smoking_habits, preferences use partner_smoking
  // Map smoking_habits values to preference values
  let profileSmokingPreference: string | null = null;
  if (profile.smoking === 'never') profileSmokingPreference = 'no';
  else if (profile.smoking === 'occasionally' || profile.smoking === 'regularly') profileSmokingPreference = 'yes';
  else if (profile.smoking === 'trying_to_quit') profileSmokingPreference = 'no';
  
  if (matchesStringPreference(profileSmokingPreference, preferences.partner_smoking)) {
    score += pointsPerCriteria * 0.7;
  } else if (!preferences.partner_smoking) {
    score += pointsPerCriteria * 0.7; // No preference = match
  }

  // Drinking match (4 points) - not available in user_profiles, skip
  // Diet match (4 points) - not available in user_profiles, skip
  // Pets match (4 points) - not available in user_profiles, skip

  // Ethnicity match (4 points)
  if (profile.ethnicity && preferences.partner_ethnicity) {
    if (matchesArrayPreference(profile.ethnicity, preferences.partner_ethnicity)) {
      score += pointsPerCriteria * 0.7;
    }
  } else {
    score += pointsPerCriteria * 0.7; // No preference = match
  }

  return Math.min(score, maxScore);
}

/**
 * Calculate profile quality score (0-20 points)
 */
function calculateQualityScore(profile: ProfileData, accountStatus: string): number {
  let score = 0;
  const maxScore = 20;

  // Account must be active (required)
  if (accountStatus !== "active") {
    return 0;
  }
  score += 5; // Base score for active account

  // Profile completeness
  if (profile.first_name) score += 2;
  if (profile.date_of_birth) score += 2;
  if (profile.location) score += 2;
  if (profile.height_cm) score += 1;

  // Photos (up to 5 points)
  const photoCount = (profile.photos?.length || 0) + (profile.profile_photo_url ? 1 : 0);
  score += Math.min(photoCount * 1, 5);

  // Additional details (up to 4 points)
  if (profile.education_level) score += 1;
  if (profile.religion) score += 1;
  if (profile.have_children !== null || profile.want_children !== null) score += 1;
  if (profile.smoking) score += 1; // Use smoking instead of employment

  return Math.min(score, maxScore);
}

/**
 * Calculate activity level score (0-10 points)
 */
function calculateActivityScore(lastLogin: string | null, profileUpdatedAt: string | null): number {
  let score = 0;
  const maxScore = 10;

  const now = new Date();
  
  // Recent login (up to 6 points)
  if (lastLogin) {
    const loginDate = new Date(lastLogin);
    const daysSinceLogin = (now.getTime() - loginDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceLogin <= 1) score += 6;
    else if (daysSinceLogin <= 7) score += 4;
    else if (daysSinceLogin <= 30) score += 2;
  }

  // Recent profile update (up to 4 points)
  if (profileUpdatedAt) {
    const updateDate = new Date(profileUpdatedAt);
    const daysSinceUpdate = (now.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceUpdate <= 7) score += 4;
    else if (daysSinceUpdate <= 30) score += 2;
    else if (daysSinceUpdate <= 90) score += 1;
  }

  return Math.min(score, maxScore);
}

/**
 * Calculate interaction history score (0-10 points)
 */
function calculateInteractionScore(
  hasRejected: boolean,
  hasLiked: boolean,
  hasMutualInterest: boolean
): number {
  let score = 10; // Start with full points
  
  // Penalize rejected profiles
  if (hasRejected) {
    return 0; // Exclude rejected profiles entirely
  }
  
  // Slight boost for already liked profiles (they can still appear)
  if (hasLiked) {
    score += 2; // Small boost, but cap at 10
  }
  
  // Boost for mutual interest
  if (hasMutualInterest) {
    score += 3; // Boost, but cap at 10
  }
  
  return Math.min(score, 10);
}

/**
 * Calculate compatibility score for a profile
 */
export function calculateCompatibility(
  profile: ProfileData,
  preferences: UserPreferences | null,
  accountStatus: string,
  lastLogin: string | null,
  profileUpdatedAt: string | null,
  hasRejected: boolean,
  hasLiked: boolean,
  hasMutualInterest: boolean
): CompatibilityScore {
  // If no preferences, use default scoring (less strict)
  const preferenceScore = preferences
    ? calculatePreferenceScore(profile, preferences)
    : 30; // Default score if no preferences set

  const qualityScore = calculateQualityScore(profile, accountStatus);
  const activityScore = calculateActivityScore(lastLogin, profileUpdatedAt);
  const interactionScore = calculateInteractionScore(hasRejected, hasLiked, hasMutualInterest);

  const totalScore = preferenceScore + qualityScore + activityScore + interactionScore;

  return {
    profile,
    score: Math.round(totalScore * 100) / 100, // Round to 2 decimal places
    breakdown: {
      preferences: Math.round(preferenceScore * 100) / 100,
      quality: Math.round(qualityScore * 100) / 100,
      activity: Math.round(activityScore * 100) / 100,
      interactions: Math.round(interactionScore * 100) / 100,
    },
  };
}

/**
 * Generate top picks for a user
 * Returns top 5 profiles sorted by compatibility score
 */
export async function generateTopPicks(
  userId: string,
  limit: number = 5
): Promise<CompatibilityScore[]> {
  try {
    const admin = getSupabaseAdmin();
    
    // Get user preferences
    const { data: preferences } = await admin
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // Get all active user IDs (excluding current user)
    const { data: activeAccounts } = await admin
      .from("accounts")
      .select("id, account_status")
      .eq("account_status", "active")
      .neq("id", userId);

    if (!activeAccounts || activeAccounts.length === 0) {
      return [];
    }

    const activeUserIds = activeAccounts.map(a => a.id);
    const accountMap = new Map(activeAccounts.map(a => [a.id, a]));

    // Get profiles for active users
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("user_id, first_name, last_name, date_of_birth, location, height_cm, photos, profile_photo_url, education_level, religion, have_children, want_children, smoking_habits, ethnicity, updated_at")
      .in("user_id", activeUserIds);

    if (!profiles || profiles.length === 0) {
      return [];
    }

    // Get rejected profiles for this user
    const { data: rejectedActivities } = await admin
      .from("user_activities")
      .select("target_user_id")
      .eq("user_id", userId)
      .eq("activity_type", "rejected");

    const rejectedUserIds = new Set((rejectedActivities || []).map(a => a.target_user_id));

    // Get liked profiles for this user
    const { data: likedActivities } = await admin
      .from("user_activities")
      .select("target_user_id")
      .eq("user_id", userId)
      .in("activity_type", ["like", "wink", "interested"]);

    const likedUserIds = new Set((likedActivities || []).map(a => a.target_user_id));

    // Get mutual interests (profiles that have liked this user)
    const { data: mutualActivities } = await admin
      .from("user_activities")
      .select("user_id")
      .eq("target_user_id", userId)
      .in("activity_type", ["like", "wink", "interested"]);

    const mutualUserIds = new Set((mutualActivities || []).map(a => a.user_id));

    // Calculate compatibility scores
    const scores: CompatibilityScore[] = profiles
      .map(profile => {
        const account = accountMap.get(profile.user_id);
        if (!account) return null;

        // Map profile data to match ProfileData interface
        const profileData: ProfileData = {
          user_id: profile.user_id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          date_of_birth: profile.date_of_birth,
          location: profile.location,
          height_cm: profile.height_cm,
          photos: profile.photos,
          profile_photo_url: profile.profile_photo_url,
          education_level: profile.education_level,
          employment: null, // Not available in user_profiles
          religion: profile.religion,
          have_children: profile.have_children ? "yes" : (profile.have_children === false ? "no" : null),
          want_children: profile.want_children,
          smoking: profile.smoking_habits,
          drinking: null, // Not available in user_profiles
          diet: null, // Not available in user_profiles
          pets: null, // Not available in user_profiles
          ethnicity: profile.ethnicity ? (typeof profile.ethnicity === 'string' ? [profile.ethnicity] : profile.ethnicity) : null,
        };

        return calculateCompatibility(
          profileData,
          preferences as UserPreferences | null,
          account.account_status,
          null, // last_login not available
          profile.updated_at,
          rejectedUserIds.has(profile.user_id),
          likedUserIds.has(profile.user_id),
          mutualUserIds.has(profile.user_id)
        );
      })
      .filter((score): score is CompatibilityScore => score !== null && score.score > 0) // Filter out rejected profiles
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .slice(0, limit); // Get top N

    return scores;
  } catch (error) {
    console.error("Error generating top picks:", error);
    return [];
  }
}
