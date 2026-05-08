export type PasswordRule = {
  id: "minLength" | "uppercase" | "lowercase" | "number";
  label: string;
  met: boolean;
};

export type PasswordValidation = {
  isValid: boolean;
  score: number;
  level: "weak" | "fair" | "good" | "strong";
  colorClass: string;
  rules: PasswordRule[];
};

export function evaluatePassword(password: string): PasswordValidation {
  const rules: PasswordRule[] = [
    { id: "minLength", label: "At least 8 characters", met: password.length >= 8 },
    { id: "uppercase", label: "At least 1 uppercase letter", met: /[A-Z]/.test(password) },
    { id: "lowercase", label: "At least 1 lowercase letter", met: /[a-z]/.test(password) },
    { id: "number", label: "At least 1 number", met: /\d/.test(password) },
  ];

  const score = rules.filter((rule) => rule.met).length;
  const isValid = rules.every((rule) => rule.met);

  let level: PasswordValidation["level"] = "weak";
  let colorClass = "bg-red-500";

  if (score === 4) {
    level = "strong";
    colorClass = "bg-green-500";
  } else if (score === 3) {
    level = "good";
    colorClass = "bg-blue-500";
  } else if (score === 2) {
    level = "fair";
    colorClass = "bg-amber-500";
  }

  return {
    isValid,
    score,
    level,
    colorClass,
    rules,
  };
}

export function getPasswordValidationError(password: string): string | null {
  const result = evaluatePassword(password);
  if (result.isValid) return null;

  const firstMissing = result.rules.find((rule) => !rule.met);
  return firstMissing ? `${firstMissing.label}.` : "Password does not meet requirements.";
}
