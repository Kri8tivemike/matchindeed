export type CanonicalRelationshipStatus =
  | "never_married"
  | "separated"
  | "widowed"
  | "married_non_monogamous"
  | "divorced"
  | "i_will_tell_you_later";

export type RelationshipStatusOption = {
  value: CanonicalRelationshipStatus;
  label: string;
};

export const PROFILE_RELATIONSHIP_STATUS_OPTIONS: RelationshipStatusOption[] = [
  { value: "never_married", label: "Never married" },
  { value: "separated", label: "Separated" },
  { value: "widowed", label: "Widowed" },
  { value: "married_non_monogamous", label: "Married (non-monogamous)" },
  { value: "divorced", label: "Divorced" },
  { value: "i_will_tell_you_later", label: "I will tell you later" },
];

export const FILTER_RELATIONSHIP_STATUS_OPTIONS: Array<{
  value: CanonicalRelationshipStatus | "";
  label: string;
}> = [
  { value: "", label: "Any" },
  { value: "never_married", label: "Never married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
  { value: "separated", label: "Separated" },
];

const RELATIONSHIP_STATUS_LABELS: Record<CanonicalRelationshipStatus, string> = {
  never_married: "Never married",
  separated: "Separated",
  widowed: "Widowed",
  married_non_monogamous: "Married (non-monogamous)",
  divorced: "Divorced",
  i_will_tell_you_later: "I will tell you later",
};

const RELATIONSHIP_STATUS_ALIASES: Record<string, CanonicalRelationshipStatus> = {
  never_married: "never_married",
  single: "never_married",
  separated: "separated",
  widowed: "widowed",
  married_non_monogamous: "married_non_monogamous",
  divorced: "divorced",
  i_will_tell_you_later: "i_will_tell_you_later",
  iwilltellyoulater: "i_will_tell_you_later",
  prefer_not_to_say: "i_will_tell_you_later",
  rather_not_say: "i_will_tell_you_later",
  id_rather_not_say: "i_will_tell_you_later",
};

function normalizeRelationshipStatusKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeRelationshipStatus(value: string | null | undefined): CanonicalRelationshipStatus | "" {
  if (!value) return "";
  const normalized = normalizeRelationshipStatusKey(value);
  return RELATIONSHIP_STATUS_ALIASES[normalized] || "";
}

export function relationshipStatusToDbValue(value: string | null | undefined): CanonicalRelationshipStatus | null {
  return normalizeRelationshipStatus(value) || null;
}

export function formatRelationshipStatusLabel(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = normalizeRelationshipStatus(value);
  if (normalized) {
    return RELATIONSHIP_STATUS_LABELS[normalized];
  }
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function relationshipStatusMatches(
  profileStatus: string | null | undefined,
  expectedStatus: string | null | undefined
): boolean {
  const normalizedProfile = normalizeRelationshipStatus(profileStatus);
  const normalizedExpected = normalizeRelationshipStatus(expectedStatus);
  return Boolean(normalizedProfile && normalizedExpected && normalizedProfile === normalizedExpected);
}

