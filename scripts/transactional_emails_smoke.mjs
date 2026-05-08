#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const apiKey = process.env.RESEND_API_KEY || "";
const resendBaseUrl = process.env.RESEND_API_BASE_URL || "https://api.resend.com";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com";
const defaultFrom = process.env.EMAIL_FROM || "MatchIndeed <noreply@matchindeed.com>";
const dryRun = process.env.TX_EMAIL_DRY_RUN === "1";

function extractEmail(value) {
  if (!value) return null;
  const angleMatch = value.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim();
  if (value.includes("@") && !value.includes(" ")) return value.trim();
  return null;
}

function resolveRecipient() {
  const explicit = process.env.TRANSACTIONAL_EMAIL_TEST_TO || process.env.RESEND_TEST_TO_EMAIL;
  if (explicit) return explicit.trim();

  const admin = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0];
  if (admin) return admin;

  return extractEmail(defaultFrom) || "noreply@matchindeed.com";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendResendEmail({ from, to, subject, html }) {
  const response = await fetch(`${resendBaseUrl}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.message || `HTTP ${response.status}`,
      response: payload,
    };
  }

  return {
    ok: true,
    messageId: payload?.id || null,
    response: payload,
  };
}

async function sendWithRetry(payload, retries = 4) {
  let attempt = 0;
  let lastResult = null;

  while (attempt <= retries) {
    const result = await sendResendEmail(payload);
    if (result.ok) {
      return result;
    }

    lastResult = result;
    if (result.status === 429 || `${result.error}`.toLowerCase().includes("too many requests")) {
      const backoffMs = 700 * (attempt + 1);
      await delay(backoffMs);
      attempt += 1;
      continue;
    }

    return result;
  }

  return lastResult || { ok: false, status: 500, error: "Unknown resend failure" };
}

function buildCases(url) {
  const genericHtml = (title, message) => `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>${title}</h2>
      <p>${message}</p>
      <p><a href="${url}/dashboard">Open Dashboard</a></p>
    </div>
  `.trim();

  return [
    { id: "meeting_request", subject: "New Video Dating Meeting Request from QA Requester", html: genericHtml("Meeting Request", "QA transactional smoke test.") },
    { id: "meeting_accepted", subject: "Meeting Accepted! Your video date is confirmed", html: genericHtml("Meeting Accepted", "QA transactional smoke test.") },
    { id: "meeting_cancelled", subject: "Video Dating Meeting Cancelled", html: genericHtml("Meeting Cancelled", "QA transactional smoke test.") },
    { id: "meeting_reminder", subject: "Reminder: Your video date is in 30 minutes", html: genericHtml("Meeting Reminder", "QA transactional smoke test.") },
    { id: "meeting_completed", subject: "Your video date has ended — submit your response", html: genericHtml("Meeting Complete", "QA transactional smoke test.") },
    { id: "cancellation_charge", subject: "Cancellation Charge Applied — Meeting #TX-SMOKE-001", html: genericHtml("Cancellation Charge", "QA transactional smoke test.") },
    { id: "investigation_notice", subject: "Investigation Notice — Meeting Review in Progress", html: genericHtml("Investigation Notice", "QA transactional smoke test.") },
    { id: "investigation_resolved", subject: "Investigation Complete — Meeting #TX-SMOKE-001", html: genericHtml("Investigation Complete", "QA transactional smoke test.") },
    { id: "match_found", subject: "It's a Match! You and QA Partner said Yes!", html: genericHtml("Match Found", "QA transactional smoke test.") },
    { id: "response_submitted", subject: "Your partner submitted their meeting response", html: genericHtml("Response Submitted", "QA transactional smoke test.") },
    { id: "credit_refund", subject: "Credit Refund — 10 credits returned", html: genericHtml("Credit Refund", "QA transactional smoke test.") },
    { id: "welcome", subject: "Welcome to MatchIndeed! Let's find your match", html: genericHtml("Welcome", "QA transactional smoke test.") },
    { id: "account_warning", subject: "Account Notice — Action Required", html: genericHtml("Account Warning", "QA transactional smoke test.") },

    { id: "match_pending_agreement", subject: "Mutual YES confirmed - sign your agreement", html: genericHtml("Mutual YES Confirmed", "QA transactional smoke test.") },
    { id: "agreement_signed_copy", subject: "Relationship Agreement Signed - MatchIndeed", html: genericHtml("Relationship Agreement Signed", "QA transactional smoke test.") },

    { id: "reactivation_request_received", subject: "Reactivation Request Received", html: genericHtml("Reactivation Request Received", "QA transactional smoke test.") },
    { id: "reactivation_partner_notified", subject: "Your Match Requested Reactivation", html: genericHtml("Your Match Requested Reactivation", "QA transactional smoke test.") },
    { id: "reactivation_partner_response_received", subject: "Partner response received for your reactivation request", html: genericHtml("Partner Response Received", "QA transactional smoke test.") },
    { id: "reactivation_auto_approved_user", subject: "Your Profile Reactivation Has Been Approved! 🎉", html: genericHtml("Reactivation Approved", "QA transactional smoke test.") },
    { id: "reactivation_auto_approved_partner", subject: "Your Match Has Been Reactivated", html: genericHtml("Match Reactivated", "QA transactional smoke test.") },
    { id: "reactivation_manual_approved_user", subject: "Your Reactivation Request Was Approved", html: genericHtml("Reactivation Approved", "QA transactional smoke test.") },
    { id: "reactivation_manual_approved_partner", subject: "Match Reactivation Approved", html: genericHtml("Match Reactivation Approved", "QA transactional smoke test.") },
    { id: "reactivation_denied_user", subject: "Reactivation Request Decision", html: genericHtml("Reactivation Decision", "QA transactional smoke test.") },
  ];
}

async function run() {
  const recipient = resolveRecipient();
  const cases = buildCases(appUrl);
  const results = [];

  if (!dryRun && !apiKey) {
    console.log(
      JSON.stringify(
        {
          recipient,
          dryRun,
          summary: {
            total: cases.length,
            passed: 0,
            failed: cases.length,
            skipped: 0,
            timestamp: new Date().toISOString(),
          },
          error: "Missing RESEND_API_KEY",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  for (const testCase of cases) {
    if (dryRun) {
      results.push({
        id: testCase.id,
        status: "skip",
        message: "Dry run enabled",
      });
      continue;
    }

    const sendResult = await sendWithRetry({
      from: defaultFrom,
      to: recipient,
      subject: `[TX-SMOKE:${testCase.id}] ${testCase.subject}`,
      html: testCase.html,
    });

    if (sendResult.ok) {
      results.push({
        id: testCase.id,
        status: "pass",
        messageId: sendResult.messageId,
      });
    } else {
      results.push({
        id: testCase.id,
        status: "fail",
        error: sendResult.error,
      });
    }

    await delay(550);
  }

  const summary = {
    total: results.length,
    passed: results.filter((item) => item.status === "pass").length,
    failed: results.filter((item) => item.status === "fail").length,
    skipped: results.filter((item) => item.status === "skip").length,
    timestamp: new Date().toISOString(),
  };

  console.log(
    JSON.stringify(
      {
        recipient,
        from: defaultFrom,
        dryRun,
        summary,
        results,
      },
      null,
      2
    )
  );

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(JSON.stringify({ error: String(error) }, null, 2));
  process.exit(1);
});
