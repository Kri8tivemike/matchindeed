/**
 * Cloudflare Turnstile Server-Side Verification
 *
 * Verifies a Turnstile token from the client against Cloudflare's API.
 * Call this in API routes before processing form submissions.
 *
 * Environment variable required:
 *   TURNSTILE_SECRET_KEY — from Cloudflare dashboard → Turnstile → your widget
 *
 * Usage:
 *   const { success } = await verifyTurnstileToken(token);
 *   if (!success) return NextResponse.json({ error: "Bot detected" }, { status: 403 });
 */

interface TurnstileVerifyResponse {
  success: boolean;
  /** ISO timestamp of the challenge */
  challenge_ts?: string;
  /** Hostname of the site the challenge was solved on */
  hostname?: string;
  /** Error codes if verification failed */
  "error-codes"?: string[];
}

/**
 * Verify a Turnstile token server-side.
 *
 * @param token - The cf-turnstile-response token from the client widget
 * @param remoteIp - Optional client IP for additional verification
 * @returns { success: boolean, errors?: string[] }
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<{ success: boolean; errors?: string[] }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // If no secret key configured, allow request through (dev mode)
  if (!secretKey) {
    console.warn("[Turnstile] No TURNSTILE_SECRET_KEY set — skipping verification");
    return { success: true };
  }

  if (!token) {
    return { success: false, errors: ["missing-input-response"] };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (remoteIp) formData.append("remoteip", remoteIp);

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      }
    );

    const result: TurnstileVerifyResponse = await response.json();

    return {
      success: result.success,
      errors: result["error-codes"],
    };
  } catch (error) {
    console.error("[Turnstile] Verification request failed:", error);
    // Fail open in case Cloudflare API is down — don't block legitimate users
    return { success: true };
  }
}
