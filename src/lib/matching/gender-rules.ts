export type GenderValue = "male" | "female" | "other" | "prefer_not_to_say" | "" | null;

export type GenderEligibilityResult = {
  allowed: boolean;
  code: string;
  message: string;
};

function normalizeGender(gender: string | null | undefined): GenderValue {
  const normalized = (gender || "").trim().toLowerCase();

  if (["male", "female", "other", "prefer_not_to_say"].includes(normalized)) {
    return normalized as GenderValue;
  }

  return "";
}

export function evaluateGenderEligibility(params: {
  requesterGender: string | null | undefined;
  targetGender: string | null | undefined;
}): GenderEligibilityResult {
  const requesterGender = normalizeGender(params.requesterGender);
  const targetGender = normalizeGender(params.targetGender);

  if (requesterGender === "male" && targetGender === "male") {
    return {
      allowed: false,
      code: "gender_restriction",
      message:
        "This service currently does not support male-to-male matching requests.",
    };
  }

  return {
    allowed: true,
    code: "ok",
    message: "Eligible",
  };
}
