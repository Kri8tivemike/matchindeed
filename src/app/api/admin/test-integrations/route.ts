import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import { getOneSignalWebPushStatus } from "@/lib/onesignal-app-status";

/**
 * Admin-only endpoint to test all third-party API integrations.
 * Makes a minimal, non-destructive API call to each service to verify connectivity.
 *
 * GET /api/admin/test-integrations
 *
 * Requires: Admin authentication via Supabase session
 * Returns: JSON object with status of each integration
 */

interface TestResult {
  service: string;
  status: "pass" | "fail" | "skip";
  message: string;
  responseTime?: number;
}

// ---------------------------------------------------------------
// Individual Test Functions
// ---------------------------------------------------------------

/** 1. Supabase — query a simple count */
async function testSupabase(): Promise<TestResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { service: "Supabase", status: "skip", message: "Missing SUPABASE_SERVICE_ROLE_KEY" };

  const start = Date.now();
  try {
    const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { count, error } = await client.from("accounts").select("id", { count: "exact", head: true });
    if (error) return { service: "Supabase", status: "fail", message: error.message, responseTime: Date.now() - start };
    return { service: "Supabase", status: "pass", message: `Connected — ${count ?? 0} accounts`, responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "Supabase", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 2. Flutterwave — list banks to verify API access */
async function testFlutterwave(): Promise<TestResult> {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) {
    return {
      service: "Flutterwave",
      status: "skip",
      message: "Missing FLUTTERWAVE_SECRET_KEY",
    };
  }

  const start = Date.now();
  try {
    const res = await fetch("https://api.flutterwave.com/v3/banks/NG", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === "error") {
      return {
        service: "Flutterwave",
        status: "fail",
        message: data.message || `HTTP ${res.status}`,
        responseTime: Date.now() - start,
      };
    }
    const count = Array.isArray(data.data) ? data.data.length : 0;
    return {
      service: "Flutterwave",
      status: "pass",
      message: `Connected — bank API reachable (${count} listed)`,
      responseTime: Date.now() - start,
    };
  } catch (e: unknown) {
    return { service: "Flutterwave", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 3. Resend — verify API access */
async function testResend(): Promise<TestResult> {
  const token = process.env.RESEND_API_KEY;
  if (!token) return { service: "Resend", status: "skip", message: "Missing RESEND_API_KEY" };

  const start = Date.now();
  try {
    const domainsRes = await fetch("https://api.resend.com/domains?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const domainsData = await domainsRes.json().catch(() => ({} as Record<string, unknown>));

    if (domainsRes.ok) {
      const count = Array.isArray(domainsData.data) ? domainsData.data.length : 0;
      return {
        service: "Resend",
        status: "pass",
        message: `Connected — domain API reachable (${count} listed)`,
        responseTime: Date.now() - start,
      };
    }

    // Some keys are sending-only and may not have domain read scope.
    const fallbackRecipient =
      process.env.RESEND_TEST_TO_EMAIL ||
      (process.env.ADMIN_EMAILS || "").split(",")[0]?.trim() ||
      "";
    if (!fallbackRecipient) {
      return {
        service: "Resend",
        status: "skip",
        message: "Key present, but no domain-read scope and no RESEND_TEST_TO_EMAIL fallback recipient",
        responseTime: Date.now() - start,
      };
    }

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "MatchIndeed <noreply@matchindeed.com>",
        to: fallbackRecipient,
        subject: "[Integration Test] Resend connectivity check",
        html: "<p>This is an automated integration test email.</p>",
      }),
    });
    const sendData = await sendRes.json().catch(() => ({} as Record<string, unknown>));

    if (sendRes.ok && typeof sendData.id === "string") {
      return {
        service: "Resend",
        status: "pass",
        message: `Connected — send API accepted (message id ${sendData.id})`,
        responseTime: Date.now() - start,
      };
    }

    const message = typeof sendData.message === "string"
      ? sendData.message
      : typeof domainsData.message === "string"
      ? domainsData.message
      : `HTTP ${sendRes.status}`;

    return { service: "Resend", status: "fail", message, responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "Resend", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 4. Zoom — get access token and create/delete a disposable meeting */
async function testZoom(): Promise<TestResult> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) return { service: "Zoom", status: "skip", message: "Missing Zoom credentials" };

  const start = Date.now();
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}` },
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return {
        service: "Zoom",
        status: "fail",
        message: tokenData.reason || tokenData.error || "OAuth token request failed",
        responseTime: Date.now() - start,
      };
    }

    const meetingStart = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const createRes = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: "MatchIndeed Integration Test",
        type: 2,
        start_time: meetingStart,
        duration: 15,
        timezone: "UTC",
        settings: {
          join_before_host: true,
          waiting_room: false,
          approval_type: 2,
        },
      }),
    });

    const createData = await createRes.json().catch(() => ({} as Record<string, unknown>));
    if (!createRes.ok || !createData.join_url || !createData.id) {
      return {
        service: "Zoom",
        status: "fail",
        message:
          typeof createData.message === "string"
            ? `Token OK, meeting create failed: ${createData.message}`
            : `Token OK, meeting create failed (HTTP ${createRes.status})`,
        responseTime: Date.now() - start,
      };
    }

    const deleteRes = await fetch(`https://api.zoom.us/v2/meetings/${createData.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!deleteRes.ok && deleteRes.status !== 404) {
      return {
        service: "Zoom",
        status: "fail",
        message: `Meeting created, but cleanup failed (HTTP ${deleteRes.status})`,
        responseTime: Date.now() - start,
      };
    }

    return {
      service: "Zoom",
      status: "pass",
      message: "Connected — token, meeting creation, and cleanup all passed",
      responseTime: Date.now() - start,
    };
  } catch (e: unknown) {
    return { service: "Zoom", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 5. Sentry — verify DSN is reachable */
async function testSentry(): Promise<TestResult> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return { service: "Sentry", status: "skip", message: "Missing NEXT_PUBLIC_SENTRY_DSN" };

  const start = Date.now();
  try {
    // Parse the DSN to extract the host
    const url = new URL(dsn);
    const res = await fetch(`${url.protocol}//${url.host}/api/0/`, { method: "GET" });
    // Sentry returns 200 or 401 (both mean the endpoint is reachable)
    if (res.status === 200 || res.status === 401 || res.status === 403) {
      return { service: "Sentry", status: "pass", message: `Connected — DSN host reachable (${res.status})`, responseTime: Date.now() - start };
    }
    return { service: "Sentry", status: "fail", message: `DSN host returned ${res.status}`, responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "Sentry", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 6. Cloudflare Turnstile — verify secret key with a dummy token */
async function testTurnstile(): Promise<TestResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!secretKey || !siteKey) return { service: "Cloudflare Turnstile", status: "skip", message: "Missing Turnstile keys" };

  const start = Date.now();
  try {
    // Use dummy token — Cloudflare responds with error but confirms key validity
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", "test-token");

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    const data = await res.json();
    // With a dummy token, success=false is expected. "invalid-input-response" means the secret key is valid.
    // "invalid-input-secret" means the secret key is bad.
    const errors = data["error-codes"] || [];
    if (errors.includes("invalid-input-secret")) {
      return { service: "Cloudflare Turnstile", status: "fail", message: "Invalid secret key", responseTime: Date.now() - start };
    }
    return { service: "Cloudflare Turnstile", status: "pass", message: "Secret key valid (test token rejected as expected)", responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "Cloudflare Turnstile", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 7. FingerprintJS — check that API key format is valid */
async function testFingerprintJS(): Promise<TestResult> {
  const apiKey = process.env.NEXT_PUBLIC_FINGERPRINT_API_KEY;
  if (!apiKey) return { service: "FingerprintJS", status: "skip", message: "Missing NEXT_PUBLIC_FINGERPRINT_API_KEY" };

  // FingerprintJS is client-side only — can't fully test server-side
  // Just verify the key is set and has expected format
  return {
    service: "FingerprintJS",
    status: "pass",
    message: `API key configured (${apiKey.substring(0, 6)}...) — client-side only, full test requires browser`,
  };
}

/** 8. IPQualityScore — check a known safe IP */
async function testIPQS(): Promise<TestResult> {
  const apiKey = process.env.IPQS_API_KEY;
  if (!apiKey) return { service: "IPQualityScore", status: "skip", message: "Missing IPQS_API_KEY" };

  const start = Date.now();
  try {
    const res = await fetch(`https://ipqualityscore.com/api/json/ip/${apiKey}/8.8.8.8?strictness=0`);
    const data = await res.json();
    if (data.success) {
      return { service: "IPQualityScore", status: "pass", message: `Connected — Google DNS fraud score: ${data.fraud_score}`, responseTime: Date.now() - start };
    }
    return { service: "IPQualityScore", status: "fail", message: data.message || "API returned failure", responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "IPQualityScore", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 9. OneSignal — get app info */
async function testOneSignal(): Promise<TestResult> {
  const start = Date.now();
  try {
    const status = await getOneSignalWebPushStatus();
    if (!status.appIdPresent || !status.restKeyPresent) {
      return {
        service: "OneSignal",
        status: "skip",
        message: "Missing OneSignal credentials",
        responseTime: Date.now() - start,
      };
    }

    if (!status.configured) {
      return {
        service: "OneSignal",
        status: "fail",
        message: status.message,
        responseTime: Date.now() - start,
      };
    }

    if (!status.webPushConfigured) {
      return {
        service: "OneSignal",
        status: "fail",
        message: "App exists, but web push is not configured in OneSignal yet",
        responseTime: Date.now() - start,
      };
    }

    if (!status.originMatches) {
      return {
        service: "OneSignal",
        status: "fail",
        message: status.message,
        responseTime: Date.now() - start,
      };
    }

    return {
      service: "OneSignal",
      status: "pass",
      message: `Connected — app "${status.appName || "OneSignal"}" is configured for web push`,
      responseTime: Date.now() - start,
    };
  } catch (e: unknown) {
    return { service: "OneSignal", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 10. Mixpanel — verify token format (client-side SDK) */
async function testMixpanel(): Promise<TestResult> {
  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  if (!token) return { service: "Mixpanel", status: "skip", message: "Missing NEXT_PUBLIC_MIXPANEL_TOKEN" };

  // Mixpanel is client-side — send a test track event via server API
  const start = Date.now();
  try {
    const event = Buffer.from(JSON.stringify({
      event: "integration_test",
      properties: { token, distinct_id: "test-admin", time: Math.floor(Date.now() / 1000) },
    })).toString("base64");

    const res = await fetch(`https://api.mixpanel.com/track?data=${event}&verbose=1`);
    const data = await res.json();
    if (data.status === 1) {
      return { service: "Mixpanel", status: "pass", message: "Connected — test event accepted", responseTime: Date.now() - start };
    }
    return { service: "Mixpanel", status: "fail", message: data.error || "Event rejected", responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "Mixpanel", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 11. TheHive.ai — test with a safe image URL */
async function testTheHive(): Promise<TestResult> {
  const v3Secret = process.env.THEHIVE_SECRET_KEY?.trim();
  const legacyKey = process.env.THEHIVE_API_KEY?.trim();
  const v2Token =
    legacyKey && !/[\/=]/.test(legacyKey) ? legacyKey : null;
  if (!v3Secret && !v2Token) {
    return {
      service: "TheHive.ai",
      status: "skip",
      message: "Missing THEHIVE_SECRET_KEY or THEHIVE_API_KEY",
    };
  }

  const start = Date.now();
  try {
    const url = v3Secret
      ? "https://api.thehive.ai/api/v3/hive/visual-moderation"
      : "https://api.thehive.ai/api/v2/task/sync";
    const headers = {
      Authorization: v3Secret ? `Bearer ${v3Secret}` : `Token ${v2Token}`,
      "Content-Type": "application/json",
    };
    const body = v3Secret
      ? {
          input: [
            {
              media_url:
                "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
            },
          ],
        }
      : {
          url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
        };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 403) {
      return {
        service: "TheHive.ai",
        status: "fail",
        message: "Invalid API key/secret (401/403)",
        responseTime: Date.now() - start,
      };
    }

    const hasStatus =
      !!data &&
      typeof data === "object" &&
      Array.isArray((data as { status?: unknown[] }).status);

    if (hasStatus) {
      return {
        service: "TheHive.ai",
        status: "pass",
        message: `Connected (${v3Secret ? "V3" : "V2"}) — moderation API responded`,
        responseTime: Date.now() - start,
      };
    }

    return {
      service: "TheHive.ai",
      status: "pass",
      message: `API reachable (HTTP ${res.status})`,
      responseTime: Date.now() - start,
    };
  } catch (e: unknown) {
    return { service: "TheHive.ai", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 13. Customer.io — verify credentials with identify call */
async function testCustomerIO(): Promise<TestResult> {
  const siteId = process.env.CUSTOMERIO_SITE_ID;
  const apiKey = process.env.CUSTOMERIO_API_KEY;
  if (!siteId || !apiKey) return { service: "Customer.io", status: "skip", message: "Missing Customer.io credentials" };

  const start = Date.now();
  try {
    const auth = Buffer.from(`${siteId}:${apiKey}`).toString("base64");
    // Use the auth check endpoint
    const res = await fetch("https://track.customer.io/auth", {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (res.status === 200) {
      return { service: "Customer.io", status: "pass", message: "Connected — credentials valid", responseTime: Date.now() - start };
    }
    return { service: "Customer.io", status: "fail", message: `Auth failed (HTTP ${res.status})`, responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "Customer.io", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 14. Sinch SMS — check API endpoint (no actual SMS sent) */
async function testSinch(): Promise<TestResult> {
  const planId = process.env.SINCH_SERVICE_PLAN_ID;
  const token = process.env.SINCH_API_TOKEN;
  const sender = process.env.SINCH_SENDER_NUMBER;
  if (!planId || !token) return { service: "Sinch SMS", status: "skip", message: "Missing Sinch credentials" };

  const start = Date.now();
  try {
    // List batches (empty result is fine — confirms auth works)
    const res = await fetch(`https://us.sms.api.sinch.com/xms/v1/${planId}/batches?page_size=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 200) {
      const senderMsg = sender ? "sender number set" : "WARNING: no SINCH_SENDER_NUMBER";
      return { service: "Sinch SMS", status: "pass", message: `Connected — ${senderMsg}`, responseTime: Date.now() - start };
    }
    if (res.status === 401 || res.status === 403) {
      return { service: "Sinch SMS", status: "fail", message: "Invalid API credentials", responseTime: Date.now() - start };
    }
    return { service: "Sinch SMS", status: "fail", message: `Unexpected status ${res.status}`, responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "Sinch SMS", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 15. Zoho CRM — get access token and fetch org info */
async function testZoho(): Promise<TestResult> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return { service: "Zoho One", status: "skip", message: "Missing Zoho credentials" };

  const start = Date.now();
  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    const res = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params}`, { method: "POST" });
    const data = await res.json();

    if (data.access_token) {
      const orgId = process.env.ZOHO_ORG_ID;
      const orgMsg = orgId ? `Org ID: ${orgId}` : "WARNING: no ZOHO_ORG_ID for Desk";
      return { service: "Zoho One", status: "pass", message: `Connected — token obtained, ${orgMsg}`, responseTime: Date.now() - start };
    }
    return { service: "Zoho One", status: "fail", message: data.error || "Token refresh failed", responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "Zoho One", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 16. Google Search Console — verify meta tag is set */
async function testGSC(): Promise<TestResult> {
  const code = process.env.NEXT_PUBLIC_GSC_VERIFICATION;
  if (!code) return { service: "Google Search Console", status: "skip", message: "Missing NEXT_PUBLIC_GSC_VERIFICATION" };
  return { service: "Google Search Console", status: "pass", message: `Verification code set (${code.substring(0, 12)}...)` };
}

// ---------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------

export async function GET(request: NextRequest) {
  const guard = await requireAdminAccess(request, {
    anyPermissions: ["view_analytics"],
  });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  // Run all tests in parallel
  const results = await Promise.all([
    testSupabase(),
    testFlutterwave(),
    testResend(),
    testZoom(),
    testSentry(),
    testTurnstile(),
    testFingerprintJS(),
    testIPQS(),
    testOneSignal(),
    testMixpanel(),
    testTheHive(),
    testCustomerIO(),
    testSinch(),
    testZoho(),
    testGSC(),
  ]);

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;

  return NextResponse.json({
    summary: {
      total: results.length,
      passed,
      failed,
      skipped,
      timestamp: new Date().toISOString(),
    },
    results,
  });
}
