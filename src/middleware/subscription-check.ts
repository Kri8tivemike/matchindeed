import {
  canAccessMatches,
  canAccessMeetings,
  type AccessResult,
} from "@/lib/subscription/permissions";

type ValidationResult = {
  allowed: boolean;
  message?: string;
};

function normalize(result: AccessResult): ValidationResult {
  return {
    allowed: result.allowed,
    message: result.message,
  };
}

export async function validateMeetingsAccess(
  userId: string
): Promise<ValidationResult> {
  const result = await canAccessMeetings(userId);
  return normalize(result);
}

export async function validateMatchesAccess(
  userId: string
): Promise<ValidationResult> {
  const result = await canAccessMatches(userId);
  return normalize(result);
}
