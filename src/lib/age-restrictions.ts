/**
 * Age Restrictions — MatchIndeed Platform
 *
 * Business rule from Clients-request.md:
 * "Age 18 to 23 not allowed for match"
 *
 * Users aged 18–23 (inclusive) are excluded from the matching pool:
 * - They do not appear in Discover, Search, or Top Picks
 * - Other users cannot see or match with them
 */

/** Minimum age for matching (users must be 24+ to appear in results) */
export const MIN_MATCHING_AGE = 24;

/** Maximum age in the restricted range (18–23) */
export const MAX_RESTRICTED_AGE = 23;

/** Minimum age in the restricted range */
export const MIN_RESTRICTED_AGE = 18;

/**
 * Calculate age from date of birth.
 * @returns Age in years, or null if dob is invalid/missing
 */
export function calculateAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

/**
 * Check if a user's age falls in the restricted 18–23 range.
 * Users in this range are excluded from discover/search/top-picks.
 *
 * @param dateOfBirth - User's date of birth (ISO string or null)
 * @returns true if age is 18–23 (excluded from matching), false otherwise
 */
export function isAgeRestrictedForMatching(dateOfBirth: string | null): boolean {
  const age = calculateAge(dateOfBirth);
  if (age === null) return false; // No DOB = allow (let other filters handle)
  return age >= MIN_RESTRICTED_AGE && age <= MAX_RESTRICTED_AGE;
}
