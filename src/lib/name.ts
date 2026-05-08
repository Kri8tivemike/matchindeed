const FIRST_NAME_REGEX = /^(?=.{2,50}$)[\p{L}][\p{L}\p{M}' -]*$/u;
const DISALLOWED_NAME_CHARS_REGEX = /[^\p{L}\p{M}' -]/gu;

export function normalizeFirstName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeFirstNameInput(value: string) {
  return value
    .replace(DISALLOWED_NAME_CHARS_REGEX, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 50);
}

export function isValidFirstName(value: string) {
  return FIRST_NAME_REGEX.test(normalizeFirstName(value));
}

export function isLikelyValidDisplayName(value: string | null | undefined) {
  if (!value) return false;
  const normalized = normalizeFirstName(value);
  if (!normalized) return false;
  if (isValidFirstName(normalized)) return true;
  return normalized.length >= 2 && !/^\d+$/.test(normalized);
}

export function getSafeDisplayName(
  preferredName: string | null | undefined,
  fallbackName: string | null | undefined,
  defaultValue = "User"
) {
  if (isLikelyValidDisplayName(preferredName)) {
    return normalizeFirstName(preferredName as string);
  }
  if (isLikelyValidDisplayName(fallbackName)) {
    return normalizeFirstName(fallbackName as string);
  }
  return defaultValue;
}
