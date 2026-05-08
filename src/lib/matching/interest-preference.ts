export const LOOKING_FOR_OPTIONS = [
  "I'm a man seeking a woman",
  "I'm a woman seeking a man",
  "I'm a man seeking a man",
  "I'm a woman seeking a woman",
] as const;

export type LookingForOption = (typeof LOOKING_FOR_OPTIONS)[number];
export type BinaryGender = "male" | "female";

const LOOKING_FOR_TO_GENDERS: Record<
  LookingForOption,
  { requester: BinaryGender; target: BinaryGender }
> = {
  "I'm a man seeking a woman": { requester: "male", target: "female" },
  "I'm a woman seeking a man": { requester: "female", target: "male" },
  "I'm a man seeking a man": { requester: "male", target: "male" },
  "I'm a woman seeking a woman": { requester: "female", target: "female" },
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBinaryGender(
  value: string | null | undefined
): BinaryGender | null {
  const normalized = normalizeText(value || "");
  if (!normalized) return null;

  if (normalized === "male" || normalized === "man") {
    return "male";
  }
  if (normalized === "female" || normalized === "woman") {
    return "female";
  }
  return null;
}

export function normalizeLookingForOption(
  value: string | null | undefined
): LookingForOption | null {
  const normalized = normalizeText(value || "");
  if (!normalized) return null;

  const aliasMap: Record<string, LookingForOption> = {
    "i'm a man seeking a woman": "I'm a man seeking a woman",
    "im a man seeking a woman": "I'm a man seeking a woman",
    "man seeking woman": "I'm a man seeking a woman",
    "man-woman": "I'm a man seeking a woman",
    man_seeking_woman: "I'm a man seeking a woman",
    "i'm a woman seeking a man": "I'm a woman seeking a man",
    "im a woman seeking a man": "I'm a woman seeking a man",
    "woman seeking man": "I'm a woman seeking a man",
    "woman-man": "I'm a woman seeking a man",
    woman_seeking_man: "I'm a woman seeking a man",
    "i'm a man seeking a man": "I'm a man seeking a man",
    "im a man seeking a man": "I'm a man seeking a man",
    "man seeking man": "I'm a man seeking a man",
    "man-man": "I'm a man seeking a man",
    man_seeking_man: "I'm a man seeking a man",
    "i'm a woman seeking a woman": "I'm a woman seeking a woman",
    "im a woman seeking a woman": "I'm a woman seeking a woman",
    "woman seeking woman": "I'm a woman seeking a woman",
    "woman-woman": "I'm a woman seeking a woman",
    woman_seeking_woman: "I'm a woman seeking a woman",
  };

  return aliasMap[normalized] || null;
}

export function getTargetGenderFromLookingFor(
  lookingFor: string | null | undefined
): BinaryGender | null {
  const normalized = normalizeLookingForOption(lookingFor);
  if (!normalized) return null;
  return LOOKING_FOR_TO_GENDERS[normalized].target;
}

export function getLookingForFromGenders(params: {
  requesterGender: string | null | undefined;
  targetGender: string | null | undefined;
}): LookingForOption | null {
  const requester = normalizeBinaryGender(params.requesterGender);
  const target = normalizeBinaryGender(params.targetGender);
  if (!requester || !target) return null;

  return (
    LOOKING_FOR_OPTIONS.find((option) => {
      const mapping = LOOKING_FOR_TO_GENDERS[option];
      return mapping.requester === requester && mapping.target === target;
    }) || null
  );
}

export function normalizePartnerGenderPreference(
  value: string | null | undefined
): BinaryGender | null {
  const binary = normalizeBinaryGender(value);
  if (binary) {
    return binary;
  }

  return getTargetGenderFromLookingFor(value);
}

export function matchesPartnerGenderPreference(
  candidateGender: string | null | undefined,
  partnerGenderPreference: string | null | undefined
): boolean {
  const expectedGender = normalizePartnerGenderPreference(partnerGenderPreference);
  if (!expectedGender) return true;

  const candidate = normalizeBinaryGender(candidateGender);
  return candidate === expectedGender;
}

export function resolvePartnerGenderPreference(params: {
  partnerGenderPreference: string | null | undefined;
  legacyPartnerExperience?: string | null | undefined;
  requesterGender?: string | null | undefined;
}): BinaryGender | null {
  const explicitPreference =
    normalizePartnerGenderPreference(params.partnerGenderPreference) ||
    normalizePartnerGenderPreference(params.legacyPartnerExperience);

  if (explicitPreference) {
    return explicitPreference;
  }

  const requester = normalizeBinaryGender(params.requesterGender);
  if (requester === "male") return "female";
  if (requester === "female") return "male";
  return null;
}
