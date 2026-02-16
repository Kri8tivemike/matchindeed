/**
 * IPQualityScore (IPQS) Integration
 *
 * Detects VPNs, proxies, disposable emails, and high-risk IPs at signup.
 * Complements FingerprintJS by adding IP/email reputation scoring.
 *
 * Environment variable required:
 *   IPQS_API_KEY — from https://www.ipqualityscore.com/
 *
 * Usage:
 *   const ipResult = await checkIpQuality(clientIp);
 *   const emailResult = await checkEmailQuality(email);
 */

// ---------------------------------------------------------------
// IP Quality Check
// ---------------------------------------------------------------
interface IpQualityResult {
  success: boolean;
  fraud_score: number;
  is_proxy: boolean;
  is_vpn: boolean;
  is_tor: boolean;
  is_bot: boolean;
  recent_abuse: boolean;
  country_code: string;
  city: string;
  ISP: string;
  /** true if the IP is considered high-risk (score >= 75) */
  high_risk: boolean;
}

/**
 * Check IP reputation and quality.
 * Returns a fraud score (0-100) and risk flags.
 */
export async function checkIpQuality(
  ipAddress: string
): Promise<IpQualityResult | null> {
  const apiKey = process.env.IPQS_API_KEY;

  if (!apiKey) {
    console.warn("[IPQS] No IPQS_API_KEY set — skipping IP check");
    return null;
  }

  try {
    const params = new URLSearchParams({
      strictness: "1",
      allow_public_access_points: "true",
      lighter_penalties: "false",
    });

    const response = await fetch(
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${ipAddress}?${params}`,
      { method: "GET" }
    );

    const data = await response.json();

    if (!data.success) {
      console.error("[IPQS] IP check failed:", data.message);
      return null;
    }

    return {
      success: true,
      fraud_score: data.fraud_score || 0,
      is_proxy: data.proxy || false,
      is_vpn: data.vpn || false,
      is_tor: data.tor || false,
      is_bot: data.bot_status || false,
      recent_abuse: data.recent_abuse || false,
      country_code: data.country_code || "",
      city: data.city || "",
      ISP: data.ISP || "",
      high_risk: (data.fraud_score || 0) >= 75,
    };
  } catch (error) {
    console.error("[IPQS] IP check request failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------
// Email Quality Check
// ---------------------------------------------------------------
interface EmailQualityResult {
  success: boolean;
  valid: boolean;
  disposable: boolean;
  fraud_score: number;
  honeypot: boolean;
  spam_trap: boolean;
  recent_abuse: boolean;
  suspect: boolean;
  /** true if the email is considered risky */
  high_risk: boolean;
}

/**
 * Check email reputation and quality.
 * Detects disposable emails, spam traps, and known fraud addresses.
 */
export async function checkEmailQuality(
  email: string
): Promise<EmailQualityResult | null> {
  const apiKey = process.env.IPQS_API_KEY;

  if (!apiKey) {
    console.warn("[IPQS] No IPQS_API_KEY set — skipping email check");
    return null;
  }

  try {
    const params = new URLSearchParams({
      fast: "false",
      abuse_strictness: "1",
    });

    const response = await fetch(
      `https://ipqualityscore.com/api/json/email/${apiKey}/${encodeURIComponent(email)}?${params}`,
      { method: "GET" }
    );

    const data = await response.json();

    if (!data.success) {
      console.error("[IPQS] Email check failed:", data.message);
      return null;
    }

    return {
      success: true,
      valid: data.valid || false,
      disposable: data.disposable || false,
      fraud_score: data.fraud_score || 0,
      honeypot: data.honeypot || false,
      spam_trap: data.spam_trap_score === "high",
      recent_abuse: data.recent_abuse || false,
      suspect: data.suspect || false,
      high_risk: data.disposable || data.honeypot || (data.fraud_score || 0) >= 75,
    };
  } catch (error) {
    console.error("[IPQS] Email check request failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------
// Combined Signup Fraud Check
// ---------------------------------------------------------------
export interface SignupFraudResult {
  allowed: boolean;
  reason?: string;
  ipScore?: number;
  emailScore?: number;
  flags: string[];
}

/**
 * Run combined IP + email fraud checks during signup.
 * Returns whether the signup should be allowed and any risk flags.
 */
export async function checkSignupFraud(
  ipAddress: string,
  email: string
): Promise<SignupFraudResult> {
  const flags: string[] = [];

  // Check IP quality
  const ipResult = await checkIpQuality(ipAddress);
  if (ipResult) {
    if (ipResult.is_tor) flags.push("tor_exit_node");
    if (ipResult.is_bot) flags.push("bot_detected");
    if (ipResult.recent_abuse) flags.push("ip_recent_abuse");
    if (ipResult.high_risk) flags.push("ip_high_risk");

    // Block: Tor exit nodes and detected bots
    if (ipResult.is_tor || ipResult.is_bot) {
      return {
        allowed: false,
        reason: "Suspicious network detected. Please try from a different connection.",
        ipScore: ipResult.fraud_score,
        flags,
      };
    }
  }

  // Check email quality
  const emailResult = await checkEmailQuality(email);
  if (emailResult) {
    if (emailResult.disposable) flags.push("disposable_email");
    if (emailResult.honeypot) flags.push("honeypot_email");
    if (emailResult.spam_trap) flags.push("spam_trap_email");
    if (emailResult.recent_abuse) flags.push("email_recent_abuse");

    // Block: Disposable emails and honeypots
    if (emailResult.disposable) {
      return {
        allowed: false,
        reason: "Disposable email addresses are not allowed. Please use a real email.",
        emailScore: emailResult.fraud_score,
        flags,
      };
    }

    if (emailResult.honeypot) {
      return {
        allowed: false,
        reason: "This email address cannot be used for registration.",
        emailScore: emailResult.fraud_score,
        flags,
      };
    }
  }

  return {
    allowed: true,
    ipScore: ipResult?.fraud_score,
    emailScore: emailResult?.fraud_score,
    flags,
  };
}
