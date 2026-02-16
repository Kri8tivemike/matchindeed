/**
 * Match Percentage Calculator
 *
 * Compares a user's partner preferences (from user_preferences table)
 * against another user's profile (from user_profiles table) to produce
 * a compatibility score (0–100%).
 *
 * Each preference dimension has a weight; only dimensions where the
 * user has expressed a preference are scored, so users who haven't
 * set preferences still see reasonable results.
 */

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export type PartnerPreferences = {
  partner_location?: string | null;
  partner_age_range?: string | null;
  partner_height_min_cm?: number | null;
  partner_height_max_cm?: number | null;
  partner_ethnicity?: string[] | null;
  partner_religion?: string[] | null;
  partner_education?: string[] | null;
  partner_employment?: string | null;
  partner_have_children?: string | null;
  partner_want_children?: string | null;
  partner_smoking?: string | null;
  partner_drinking?: string | null;
  partner_diet?: string | null;
  partner_pets?: string | null;
};

export type CandidateProfile = {
  location?: string | null;
  date_of_birth?: string | null;
  height_cm?: number | null;
  ethnicity?: string | null;
  religion?: string | null;
  education_level?: string | null;
  have_children?: boolean | null;
  want_children?: string | null;
  smoking_habits?: string | null;
};

export type MatchResult = {
  /** Overall compatibility 0–100 */
  percentage: number;
  /** Breakdown of which criteria matched */
  matches: MatchDimension[];
  /** Human-friendly label */
  label: string;
  /** Tailwind color class for the badge */
  color: string;
  /** Tailwind bg color class for the badge */
  bgColor: string;
};

type MatchDimension = {
  name: string;
  matched: boolean;
  weight: number;
};

// ---------------------------------------------------------------
// Weights — higher = more influence on score
// ---------------------------------------------------------------
const WEIGHTS: Record<string, number> = {
  location: 20,
  age: 15,
  height: 10,
  ethnicity: 10,
  religion: 10,
  education: 8,
  children_have: 7,
  children_want: 7,
  smoking: 5,
  employment: 4,
  drinking: 2,
  diet: 2,
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Parse "20 - 29" style range into [min, max] */
function parseAgeRange(range: string): [number, number] | null {
  const m = range.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2])];
}

/** Calculate age from date_of_birth (ISO string) */
function calculateAge(dob: string): number | null {
  try {
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
}

/** Case-insensitive partial match for locations */
function locationMatches(preferred: string, candidate: string): boolean {
  const p = preferred.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();
  return c.includes(p) || p.includes(c);
}

/** Check if a value is "doesnt_matter" or equivalent (should match anything) */
function isOpenPreference(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.toLowerCase();
  return v === "doesnt_matter" || v === "any" || v === "no preference" || v === "open";
}

// ---------------------------------------------------------------
// Main Calculator
// ---------------------------------------------------------------

/**
 * Calculate match percentage between user's preferences and a candidate profile.
 *
 * Only scores dimensions where the user has set a preference.
 * If no preferences are set at all, returns a neutral 50%.
 */
export function calculateMatchPercentage(
  prefs: PartnerPreferences | null,
  candidate: CandidateProfile
): MatchResult {
  // No preferences set — return neutral
  if (!prefs) {
    return {
      percentage: 50,
      matches: [],
      label: "New",
      color: "text-gray-600",
      bgColor: "bg-gray-100",
    };
  }

  const dimensions: MatchDimension[] = [];
  let totalWeight = 0;
  let earnedWeight = 0;

  // --- Location ---
  if (prefs.partner_location && candidate.location) {
    totalWeight += WEIGHTS.location;
    const matched = locationMatches(prefs.partner_location, candidate.location);
    if (matched) earnedWeight += WEIGHTS.location;
    dimensions.push({ name: "Location", matched, weight: WEIGHTS.location });
  }

  // --- Age ---
  if (prefs.partner_age_range && candidate.date_of_birth) {
    const range = parseAgeRange(prefs.partner_age_range);
    const age = calculateAge(candidate.date_of_birth);
    if (range && age !== null) {
      totalWeight += WEIGHTS.age;
      const matched = age >= range[0] && age <= range[1];
      if (matched) earnedWeight += WEIGHTS.age;
      dimensions.push({ name: "Age", matched, weight: WEIGHTS.age });
    }
  }

  // --- Height ---
  if (prefs.partner_height_min_cm && prefs.partner_height_max_cm && candidate.height_cm) {
    totalWeight += WEIGHTS.height;
    const matched =
      candidate.height_cm >= prefs.partner_height_min_cm &&
      candidate.height_cm <= prefs.partner_height_max_cm;
    if (matched) earnedWeight += WEIGHTS.height;
    dimensions.push({ name: "Height", matched, weight: WEIGHTS.height });
  }

  // --- Ethnicity ---
  if (prefs.partner_ethnicity && prefs.partner_ethnicity.length > 0 && candidate.ethnicity) {
    // Skip if preference is "I'd rather not say" only
    const meaningful = prefs.partner_ethnicity.filter(
      (e) => e.toLowerCase() !== "i'd rather not say"
    );
    if (meaningful.length > 0) {
      totalWeight += WEIGHTS.ethnicity;
      const matched = meaningful.some(
        (e) => candidate.ethnicity!.toLowerCase().includes(e.toLowerCase())
      );
      if (matched) earnedWeight += WEIGHTS.ethnicity;
      dimensions.push({ name: "Ethnicity", matched, weight: WEIGHTS.ethnicity });
    }
  }

  // --- Religion ---
  if (prefs.partner_religion && prefs.partner_religion.length > 0 && candidate.religion) {
    totalWeight += WEIGHTS.religion;
    const matched = prefs.partner_religion.some(
      (r) => candidate.religion!.toLowerCase().includes(r.toLowerCase())
    );
    if (matched) earnedWeight += WEIGHTS.religion;
    dimensions.push({ name: "Religion", matched, weight: WEIGHTS.religion });
  }

  // --- Education ---
  if (prefs.partner_education && prefs.partner_education.length > 0 && candidate.education_level) {
    totalWeight += WEIGHTS.education;
    const matched = prefs.partner_education.some(
      (e) => candidate.education_level!.toLowerCase().includes(e.toLowerCase())
    );
    if (matched) earnedWeight += WEIGHTS.education;
    dimensions.push({ name: "Education", matched, weight: WEIGHTS.education });
  }

  // --- Has Children ---
  if (!isOpenPreference(prefs.partner_have_children) && candidate.have_children !== null && candidate.have_children !== undefined) {
    totalWeight += WEIGHTS.children_have;
    const prefVal = prefs.partner_have_children === "yes";
    const matched = prefVal === candidate.have_children;
    if (matched) earnedWeight += WEIGHTS.children_have;
    dimensions.push({ name: "Has Children", matched, weight: WEIGHTS.children_have });
  }

  // --- Wants Children ---
  if (!isOpenPreference(prefs.partner_want_children) && candidate.want_children) {
    totalWeight += WEIGHTS.children_want;
    const matched = prefs.partner_want_children === candidate.want_children;
    if (matched) earnedWeight += WEIGHTS.children_want;
    dimensions.push({ name: "Wants Children", matched, weight: WEIGHTS.children_want });
  }

  // --- Smoking ---
  if (!isOpenPreference(prefs.partner_smoking) && candidate.smoking_habits) {
    totalWeight += WEIGHTS.smoking;
    const prefNoSmoke = prefs.partner_smoking === "no";
    const candidateSmokes =
      candidate.smoking_habits.toLowerCase().includes("never") ||
      candidate.smoking_habits.toLowerCase().includes("no");
    const matched = prefNoSmoke ? candidateSmokes : !candidateSmokes;
    if (matched) earnedWeight += WEIGHTS.smoking;
    dimensions.push({ name: "Smoking", matched, weight: WEIGHTS.smoking });
  }

  // If no dimensions could be scored, return neutral
  if (totalWeight === 0) {
    return {
      percentage: 50,
      matches: dimensions,
      label: "New",
      color: "text-gray-600",
      bgColor: "bg-gray-100",
    };
  }

  const percentage = Math.round((earnedWeight / totalWeight) * 100);

  // Determine label & color
  let label: string;
  let color: string;
  let bgColor: string;

  if (percentage >= 85) {
    label = "Excellent Match";
    color = "text-emerald-700";
    bgColor = "bg-emerald-50 border-emerald-200";
  } else if (percentage >= 70) {
    label = "Great Match";
    color = "text-blue-700";
    bgColor = "bg-blue-50 border-blue-200";
  } else if (percentage >= 50) {
    label = "Good Match";
    color = "text-amber-700";
    bgColor = "bg-amber-50 border-amber-200";
  } else if (percentage >= 30) {
    label = "Fair Match";
    color = "text-orange-700";
    bgColor = "bg-orange-50 border-orange-200";
  } else {
    label = "Low Match";
    color = "text-gray-600";
    bgColor = "bg-gray-50 border-gray-200";
  }

  return { percentage, matches: dimensions, label, color, bgColor };
}
