/**
 * Profile Completeness Calculator
 *
 * Calculates a percentage-based profile completeness score
 * by checking which fields the user has filled in.
 * Each field is weighted based on its importance for matching.
 *
 * Used by the completeness widget on the profile and discover pages
 * to encourage users to fully complete their profiles.
 */

export type ProfileField = {
  /** Database column name */
  key: string;
  /** Display name shown to the user */
  label: string;
  /** Weight (importance) — higher means more impact on score */
  weight: number;
  /** Category grouping */
  category: "essential" | "appearance" | "lifestyle" | "personality" | "photos";
};

/**
 * All profile fields tracked for completeness.
 * Total weight: 100 (each field's weight represents its % contribution).
 */
export const PROFILE_FIELDS: ProfileField[] = [
  // Essential (40 points total)
  { key: "first_name", label: "First Name", weight: 5, category: "essential" },
  { key: "date_of_birth", label: "Birthday", weight: 5, category: "essential" },
  { key: "gender", label: "Gender", weight: 5, category: "essential" },
  { key: "location", label: "Location", weight: 10, category: "essential" },
  { key: "about_yourself", label: "About Yourself", weight: 10, category: "essential" },
  { key: "photos", label: "Photos", weight: 5, category: "photos" },

  // Appearance (15 points total)
  { key: "height_cm", label: "Height", weight: 5, category: "appearance" },
  { key: "ethnicity", label: "Ethnicity", weight: 5, category: "appearance" },
  { key: "religion", label: "Religion", weight: 5, category: "appearance" },

  // Lifestyle (30 points total)
  { key: "education_level", label: "Education", weight: 5, category: "lifestyle" },
  { key: "languages", label: "Languages", weight: 5, category: "lifestyle" },
  { key: "relationship_status", label: "Relationship Status", weight: 3, category: "lifestyle" },
  { key: "have_children", label: "Has Children", weight: 3, category: "lifestyle" },
  { key: "want_children", label: "Wants Children", weight: 3, category: "lifestyle" },
  { key: "smoking_habits", label: "Smoking Habits", weight: 3, category: "lifestyle" },
  { key: "willing_to_relocate", label: "Relocation Plan", weight: 3, category: "lifestyle" },
  { key: "ready_for_marriage", label: "Marriage Ready", weight: 2, category: "lifestyle" },
  { key: "relationship_type", label: "Relationship Type", weight: 3, category: "lifestyle" },

  // Personality (15 points total)
  { key: "career_stability", label: "Career Stability", weight: 3, category: "personality" },
  { key: "long_term_goals", label: "Long-term Goals", weight: 3, category: "personality" },
  { key: "emotional_connection", label: "Emotional Connection", weight: 3, category: "personality" },
  { key: "love_languages", label: "Love Languages", weight: 3, category: "personality" },
  { key: "personality_type", label: "Personality Type", weight: 3, category: "personality" },
];

/** Total possible weight (should be 100) */
export const TOTAL_WEIGHT = PROFILE_FIELDS.reduce((sum, f) => sum + f.weight, 0);

/**
 * Check if a field has a valid (non-empty) value
 */
function isFieldFilled(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return true; // booleans are always "filled"
  if (typeof value === "number") return true;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

export type CompletenessResult = {
  /** Overall score 0–100 */
  percentage: number;
  /** Number of fields filled */
  filledCount: number;
  /** Total number of tracked fields */
  totalCount: number;
  /** Fields that are missing */
  missingFields: ProfileField[];
  /** Fields that are filled */
  filledFields: ProfileField[];
  /** Score breakdown by category */
  categories: Record<string, { filled: number; total: number; percentage: number }>;
  /** Human-readable label for the tier */
  tier: "incomplete" | "basic" | "good" | "great" | "complete";
  /** Tier display label */
  tierLabel: string;
  /** Tier color class (Tailwind) */
  tierColor: string;
};

/**
 * Calculate profile completeness from a profile data object.
 *
 * @param profileData — object with profile field values (from user_profiles)
 * @returns CompletenessResult with score and missing fields
 */
export function calculateCompleteness(profileData: Record<string, any>): CompletenessResult {
  let earnedWeight = 0;
  const missingFields: ProfileField[] = [];
  const filledFields: ProfileField[] = [];

  // Category accumulators
  const categories: Record<string, { filled: number; total: number }> = {};

  for (const field of PROFILE_FIELDS) {
    // Initialize category if needed
    if (!categories[field.category]) {
      categories[field.category] = { filled: 0, total: 0 };
    }
    categories[field.category].total += field.weight;

    const value = profileData[field.key];
    if (isFieldFilled(value)) {
      earnedWeight += field.weight;
      filledFields.push(field);
      categories[field.category].filled += field.weight;
    } else {
      missingFields.push(field);
    }
  }

  const percentage = Math.round((earnedWeight / TOTAL_WEIGHT) * 100);

  // Determine tier
  let tier: CompletenessResult["tier"];
  let tierLabel: string;
  let tierColor: string;

  if (percentage >= 100) {
    tier = "complete";
    tierLabel = "Complete Profile";
    tierColor = "text-emerald-600";
  } else if (percentage >= 75) {
    tier = "great";
    tierLabel = "Great Profile";
    tierColor = "text-blue-600";
  } else if (percentage >= 50) {
    tier = "good";
    tierLabel = "Good Start";
    tierColor = "text-amber-600";
  } else if (percentage >= 25) {
    tier = "basic";
    tierLabel = "Getting There";
    tierColor = "text-orange-600";
  } else {
    tier = "incomplete";
    tierLabel = "Just Started";
    tierColor = "text-red-600";
  }

  // Build category percentages
  const categoryResults: Record<string, { filled: number; total: number; percentage: number }> = {};
  for (const [cat, data] of Object.entries(categories)) {
    categoryResults[cat] = {
      ...data,
      percentage: data.total > 0 ? Math.round((data.filled / data.total) * 100) : 0,
    };
  }

  return {
    percentage,
    filledCount: filledFields.length,
    totalCount: PROFILE_FIELDS.length,
    missingFields,
    filledFields,
    categories: categoryResults,
    tier,
    tierLabel,
    tierColor,
  };
}

/**
 * Get the top N most impactful missing fields (sorted by weight desc).
 * These are the fields the user should fill next to boost their score fastest.
 */
export function getTopMissingFields(result: CompletenessResult, count = 3): ProfileField[] {
  return result.missingFields
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count);
}
