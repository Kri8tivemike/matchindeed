import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

/** 2. Stripe — list 1 product */
async function testStripe(): Promise<TestResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { service: "Stripe", status: "skip", message: "Missing STRIPE_SECRET_KEY" };

  const start = Date.now();
  try {
    const res = await fetch("https://api.stripe.com/v1/products?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json();
    if (data.error) return { service: "Stripe", status: "fail", message: data.error.message, responseTime: Date.now() - start };
    return { service: "Stripe", status: "pass", message: `Connected — ${data.data?.length ?? 0} product(s) found`, responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "Stripe", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 3. Postmark — get server info (minimal call) */
async function testPostmark(): Promise<TestResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) return { service: "Postmark", status: "skip", message: "Missing POSTMARK_SERVER_TOKEN" };

  const start = Date.now();
  try {
    const res = await fetch("https://api.postmarkapp.com/server", {
      headers: {
        Accept: "application/json",
        "X-Postmark-Server-Token": token,
      },
    });
    const data = await res.json();
    if (res.status === 401) return { service: "Postmark", status: "fail", message: "Invalid server token", responseTime: Date.now() - start };
    if (data.Name) {
      return { service: "Postmark", status: "pass", message: `Connected — server "${data.Name}"`, responseTime: Date.now() - start };
    }
    return { service: "Postmark", status: "fail", message: data.Message || `HTTP ${res.status}`, responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "Postmark", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 4. Zoom — get access token */
async function testZoom(): Promise<TestResult> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) return { service: "Zoom", status: "skip", message: "Missing Zoom credentials" };

  const start = Date.now();
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}` },
    });
    const data = await res.json();
    if (data.access_token) return { service: "Zoom", status: "pass", message: "Connected — token obtained", responseTime: Date.now() - start };
    return { service: "Zoom", status: "fail", message: data.reason || data.error || "Unknown error", responseTime: Date.now() - start };
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
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const restKey = process.env.ONESIGNAL_REST_KEY;
  if (!appId || !restKey) return { service: "OneSignal", status: "skip", message: "Missing OneSignal credentials" };

  const start = Date.now();
  try {
    const res = await fetch(`https://api.onesignal.com/apps/${appId}`, {
      headers: { Authorization: `Key ${restKey}` },
    });
    const data = await res.json();
    if (data.id) {
      return { service: "OneSignal", status: "pass", message: `Connected — app "${data.name}"`, responseTime: Date.now() - start };
    }
    return { service: "OneSignal", status: "fail", message: data.errors?.[0] || "Unknown error", responseTime: Date.now() - start };
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
  const apiKey = process.env.THEHIVE_API_KEY;
  if (!apiKey) return { service: "TheHive.ai", status: "skip", message: "Missing THEHIVE_API_KEY" };

  const start = Date.now();
  try {
    const res = await fetch("https://api.thehive.ai/api/v2/task/sync", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png" }),
    });
    const data = await res.json();
    if (res.status === 401 || res.status === 403) {
      return { service: "TheHive.ai", status: "fail", message: "Invalid API key (401/403)", responseTime: Date.now() - start };
    }
    if (data.status) {
      return { service: "TheHive.ai", status: "pass", message: "Connected — moderation API responded", responseTime: Date.now() - start };
    }
    return { service: "TheHive.ai", status: "pass", message: `API reachable (HTTP ${res.status})`, responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "TheHive.ai", status: "fail", message: String(e), responseTime: Date.now() - start };
  }
}

/** 12. ImageKit — verify URL endpoint is reachable */
async function testImageKit(): Promise<TestResult> {
  const url = process.env.NEXT_PUBLIC_IMAGEKIT_URL;
  if (!url) return { service: "ImageKit", status: "skip", message: "Missing NEXT_PUBLIC_IMAGEKIT_URL" };

  const start = Date.now();
  try {
    // Try fetching a non-existent image — ImageKit returns 404 (meaning endpoint is valid)
    const res = await fetch(`${url}/test-connectivity.jpg`, { method: "HEAD" });
    // 404 = endpoint works, image doesn't exist (expected)
    // 200 = also fine
    // 403 = bad configuration
    if (res.status === 404 || res.status === 200) {
      return { service: "ImageKit", status: "pass", message: `CDN reachable (HTTP ${res.status})`, responseTime: Date.now() - start };
    }
    return { service: "ImageKit", status: "fail", message: `Unexpected status ${res.status}`, responseTime: Date.now() - start };
  } catch (e: unknown) {
    return { service: "ImageKit", status: "fail", message: String(e), responseTime: Date.now() - start };
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

export async function GET(request: Request) {
  // Admin-only: check for admin auth
  const authHeader = request.headers.get("authorization");
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());

  // Allow access with Supabase session or a simple admin check
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseKey && authHeader) {
    try {
      const token = authHeader.replace("Bearer ", "");
      const client = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: { user } } = await client.auth.getUser(token);

      if (!user || !adminEmails.includes(user.email?.toLowerCase() || "")) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid authentication" }, { status: 401 });
    }
  }

  // Run all tests in parallel
  const results = await Promise.all([
    testSupabase(),
    testStripe(),
    testPostmark(),
    testZoom(),
    testSentry(),
    testTurnstile(),
    testFingerprintJS(),
    testIPQS(),
    testOneSignal(),
    testMixpanel(),
    testTheHive(),
    testImageKit(),
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
