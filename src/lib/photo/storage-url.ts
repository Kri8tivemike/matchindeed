const PROFILE_IMAGES_PUBLIC_PATH =
  "/storage/v1/object/public/profile-images/";

type CanonicalOriginOptions = {
  supabaseUrl?: string | null;
  serviceRoleKey?: string | null;
  canonicalUrl?: string | null;
};

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function extractSupabaseProjectRef(
  serviceRoleKey: string | null | undefined
): string | null {
  if (!serviceRoleKey) return null;

  try {
    const payload = serviceRoleKey.split(".")[1];
    if (!payload) return null;

    const normalizedPayload = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const decoded = JSON.parse(
      Buffer.from(normalizedPayload, "base64").toString("utf8")
    ) as { ref?: unknown };

    return typeof decoded.ref === "string" && decoded.ref.trim()
      ? decoded.ref.trim()
      : null;
  } catch {
    return null;
  }
}

export function resolveCanonicalSupabaseOrigin({
  supabaseUrl,
  serviceRoleKey,
  canonicalUrl,
}: CanonicalOriginOptions): string | null {
  const configuredCanonicalOrigin = normalizeOrigin(canonicalUrl);
  if (configuredCanonicalOrigin) return configuredCanonicalOrigin;

  const projectRef = extractSupabaseProjectRef(serviceRoleKey);
  if (projectRef) return `https://${projectRef}.supabase.co`;

  const configuredOrigin = normalizeOrigin(supabaseUrl);
  if (configuredOrigin?.endsWith(".supabase.co")) return configuredOrigin;

  return null;
}

export function extractProfileImageStoragePath(photoUrl: string): string | null {
  try {
    const url = new URL(photoUrl);
    const markerIndex = url.pathname.indexOf(PROFILE_IMAGES_PUBLIC_PATH);
    if (markerIndex === -1) return null;

    const storagePath = decodeURIComponent(
      url.pathname.slice(markerIndex + PROFILE_IMAGES_PUBLIC_PATH.length)
    ).trim();

    return storagePath || null;
  } catch {
    return null;
  }
}

export function isOwnedProfileImageUrl(photoUrl: string, userId: string) {
  const storagePath = extractProfileImageStoragePath(photoUrl);
  return Boolean(storagePath?.startsWith(`${userId}/`));
}

export function canonicalizeProfileImageUrl(
  photoUrl: string,
  canonicalOrigin: string | null
): string | null {
  const storagePath = extractProfileImageStoragePath(photoUrl);
  if (!storagePath) return null;

  if (!canonicalOrigin) return photoUrl;

  const encodedPath = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${canonicalOrigin}${PROFILE_IMAGES_PUBLIC_PATH}${encodedPath}`;
}
