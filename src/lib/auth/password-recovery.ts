export type PasswordRecoveryCredentials =
  | { kind: "pkce"; code: string }
  | { kind: "implicit"; accessToken: string; refreshToken: string }
  | { kind: "invalid" };

/** Parse both Supabase PKCE and implicit password-recovery redirects. */
export function parsePasswordRecoveryUrl(
  rawUrl: string
): PasswordRecoveryCredentials {
  try {
    const url = new URL(rawUrl);
    const code = url.searchParams.get("code");
    if (code) {
      return { kind: "pkce", code };
    }

    const hashParams = new URLSearchParams(url.hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const type = hashParams.get("type");

    if (type === "recovery" && accessToken && refreshToken) {
      return { kind: "implicit", accessToken, refreshToken };
    }
  } catch {
    // Invalid URLs are handled by the recovery page as expired links.
  }

  return { kind: "invalid" };
}
