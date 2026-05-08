#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

function getMissingEnv(keys) {
  return keys.filter((key) => !process.env[key] || process.env[key].trim() === "");
}

function buildSkip(service, message) {
  return { service, status: "skip", message };
}

function buildFail(service, message) {
  return { service, status: "fail", message };
}

function buildPass(service, message) {
  return { service, status: "pass", message };
}

function isDryRun() {
  return process.env.PHASE9_INTEGRATION_DRY_RUN === "1";
}

async function timed(service, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    return {
      ...result,
      service,
      responseTimeMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...buildFail(service, String(error)),
      responseTimeMs: Date.now() - startedAt,
    };
  }
}

async function testSupabase() {
  return timed("Supabase", async () => {
    const missing = getMissingEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    if (missing.length > 0) {
      return buildSkip("Supabase", `Missing env: ${missing.join(", ")}`);
    }
    if (isDryRun()) {
      return buildSkip("Supabase", "Dry run enabled");
    }

    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { count, error } = await client.from("accounts").select("id", { count: "exact", head: true });
    if (error) {
      return buildFail("Supabase", error.message);
    }

    return buildPass("Supabase", `Connected (accounts=${count ?? 0})`);
  });
}

async function testStripe() {
  return timed("Stripe", async () => {
    const missing = getMissingEnv(["STRIPE_SECRET_KEY"]);
    if (missing.length > 0) {
      return buildSkip("Stripe", `Missing env: ${missing.join(", ")}`);
    }
    if (isDryRun()) {
      return buildSkip("Stripe", "Dry run enabled");
    }

    const response = await fetch("https://api.stripe.com/v1/products?limit=1", {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const payload = await response.json();

    if (!response.ok) {
      return buildFail("Stripe", payload.error?.message || `HTTP ${response.status}`);
    }

    return buildPass("Stripe", `Connected (products=${payload.data?.length ?? 0})`);
  });
}

async function testResend() {
  return timed("Resend", async () => {
    const missing = getMissingEnv(["RESEND_API_KEY"]);
    if (missing.length > 0) {
      return buildSkip("Resend", `Missing env: ${missing.join(", ")}`);
    }
    if (isDryRun()) {
      return buildSkip("Resend", "Dry run enabled");
    }

    const token = process.env.RESEND_API_KEY;
    const domainResponse = await fetch("https://api.resend.com/domains?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const domainPayload = await domainResponse.json().catch(() => ({}));

    if (domainResponse.ok) {
      const count = Array.isArray(domainPayload.data) ? domainPayload.data.length : 0;
      return buildPass("Resend", `Connected (domains=${count})`);
    }

    const fallbackRecipient =
      process.env.RESEND_TEST_TO_EMAIL ||
      (process.env.ADMIN_EMAILS || "").split(",")[0]?.trim() ||
      "";
    if (!fallbackRecipient) {
      return buildSkip("Resend", "No domain-read scope and no RESEND_TEST_TO_EMAIL fallback recipient");
    }

    const sendResponse = await fetch("https://api.resend.com/emails", {
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
    const sendPayload = await sendResponse.json().catch(() => ({}));

    if (sendResponse.ok && typeof sendPayload.id === "string") {
      return buildPass("Resend", `Connected (messageId=${sendPayload.id})`);
    }

    return buildFail(
      "Resend",
      sendPayload.message || domainPayload.message || `HTTP ${sendResponse.status}`
    );
  });
}

async function testZoom() {
  return timed("Zoom", async () => {
    const missing = getMissingEnv(["ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"]);
    if (missing.length > 0) {
      return buildSkip("Zoom", `Missing env: ${missing.join(", ")}`);
    }
    if (isDryRun()) {
      return buildSkip("Zoom", "Dry run enabled");
    }

    const auth = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
    const response = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(
        process.env.ZOOM_ACCOUNT_ID
      )}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );
    const payload = await response.json();

    if (!response.ok || !payload.access_token) {
      return buildFail("Zoom", payload.reason || payload.error || `HTTP ${response.status}`);
    }

    return buildPass("Zoom", "Connected (token issued)");
  });
}

async function testOneSignal() {
  return timed("OneSignal", async () => {
    const missing = getMissingEnv(["NEXT_PUBLIC_ONESIGNAL_APP_ID", "ONESIGNAL_REST_KEY"]);
    if (missing.length > 0) {
      return buildSkip("OneSignal", `Missing env: ${missing.join(", ")}`);
    }
    if (isDryRun()) {
      return buildSkip("OneSignal", "Dry run enabled");
    }

    const response = await fetch(`https://api.onesignal.com/apps/${process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID}`, {
      headers: { Authorization: `Key ${process.env.ONESIGNAL_REST_KEY}` },
    });
    const payload = await response.json();

    if (!response.ok || !payload.id) {
      const message = Array.isArray(payload.errors) ? payload.errors[0] : payload.errors;
      return buildFail("OneSignal", message || `HTTP ${response.status}`);
    }

    return buildPass("OneSignal", `Connected (app=${payload.name || payload.id})`);
  });
}

async function testCustomerIo() {
  return timed("Customer.io", async () => {
    const missing = getMissingEnv(["CUSTOMERIO_SITE_ID", "CUSTOMERIO_API_KEY"]);
    if (missing.length > 0) {
      return buildSkip("Customer.io", `Missing env: ${missing.join(", ")}`);
    }
    if (isDryRun()) {
      return buildSkip("Customer.io", "Dry run enabled");
    }

    const auth = Buffer.from(
      `${process.env.CUSTOMERIO_SITE_ID}:${process.env.CUSTOMERIO_API_KEY}`
    ).toString("base64");

    const customerId = `phase9-smoke-${Date.now()}`;
    const identifyResponse = await fetch(
      `https://track.customer.io/api/v1/customers/${customerId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: `${customerId}@example.com`,
          source: "phase9_integrations_smoke",
        }),
      }
    );
    const identifyPayload = await identifyResponse.json().catch(() => ({}));

    if (!identifyResponse.ok) {
      return buildFail(
        "Customer.io",
        identifyPayload.meta?.error || identifyPayload.error || `Identify HTTP ${identifyResponse.status}`
      );
    }

    const eventResponse = await fetch("https://track.customer.io/api/v1/events", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "phase9_integrations_smoke",
        data: {
          customer_id: customerId,
          source: "phase9_integrations_smoke",
        },
      }),
    });
    const eventPayload = await eventResponse.json().catch(() => ({}));

    if (!eventResponse.ok) {
      return buildFail(
        "Customer.io",
        eventPayload.meta?.error || eventPayload.error || `Track HTTP ${eventResponse.status}`
      );
    }

    return buildPass("Customer.io", "Connected (identify + track succeeded)");
  });
}

async function run() {
  const results = await Promise.all([
    testSupabase(),
    testStripe(),
    testResend(),
    testZoom(),
    testOneSignal(),
    testCustomerIo(),
  ]);

  const summary = {
    total: results.length,
    passed: results.filter((item) => item.status === "pass").length,
    failed: results.filter((item) => item.status === "fail").length,
    skipped: results.filter((item) => item.status === "skip").length,
    timestamp: new Date().toISOString(),
  };

  console.log(JSON.stringify({ summary, results }, null, 2));

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

run();
