const LOCATION_ALPHA_REGEX = /[\p{L}]/u;

export function normalizeLocation(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function isLikelyGoogleSuggestedLocation(value: string) {
  const normalized = normalizeLocation(value);
  if (!normalized) return false;
  if (normalized.length < 5 || normalized.length > 120) return false;
  if (!LOCATION_ALPHA_REGEX.test(normalized)) return false;

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return false;
  return parts.every((part) => part.length >= 2 && LOCATION_ALPHA_REGEX.test(part));
}

export function toCityCountryLabel(value: string | null | undefined) {
  if (!value) return null;
  const normalized = normalizeLocation(value);
  if (!normalized || !LOCATION_ALPHA_REGEX.test(normalized)) return null;

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]}, ${parts[parts.length - 1]}`;
  }

  return normalized.length >= 3 ? normalized : null;
}

export function toStateCountryLabel(value: string | null | undefined) {
  if (!value) return null;
  const normalized = normalizeLocation(value);
  if (!normalized || !LOCATION_ALPHA_REGEX.test(normalized)) return null;

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  }

  return null;
}
