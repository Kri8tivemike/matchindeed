#!/usr/bin/env node
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const recipient = process.env.TRANSACTIONAL_EMAIL_TEST_TO;
if (!recipient) throw new Error("Set TRANSACTIONAL_EMAIL_TEST_TO to a controlled test inbox");

const { EMAIL_TEMPLATES, generateEmail } = await import("../src/lib/email-templates.ts");
const { deliverEmail } = await import("../src/lib/email/transport.ts");
const reactivation = await import("../src/lib/email/reactivation-templates.ts");

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com";
const from = process.env.EMAIL_FROM || "MatchIndeed <noreply@matchindeed.com>";
const fixture = {
  recipientName: "Michael (Template Test)", requesterName: "Test Requester",
  senderName: "Test Sender", actorName: "Test Member", partnerName: "Test Partner",
  meetingDate: "September 8, 2026", meetingTime: "3:00 PM",
  meetingTimeZone: "Africa/Lagos", meetingType: "Video Call", timeUntil: "in 30 minutes",
  confirmationUrl: `${appUrl}/auth/confirm?token=template-test`,
  resetUrl: `${appUrl}/reset-password?token=template-test`, dashboardUrl: `${appUrl}/dashboard`,
  responseUrl: `${appUrl}/dashboard/meetings/test/response`,
  reactivateUrl: `${appUrl}/dashboard/profile/my-account`, cancelledBy: "Test User",
  cancellationReason: "Template test", meetingRef: "TEST-001", creditAmount: 10,
  walletAmount: "20 credits", reason: "Template test", warningMessage: "Template test notice",
  details: "This email is a test. No action has been taken.", count: 2, location: "Lagos",
  preview: "This is a template test message", triggerLabel: "liked your profile",
  requestedAt: "September 5, 2026", awaitingAdminApproval: false,
  freePlanRestored: false, refundIssued: true, chargeApplied: false,
  adminNotes: "Template test notes", yourResponsePending: true,
};

const samples = EMAIL_TEMPLATES.map(template => {
  const rendered = generateEmail(template, fixture);
  return { id: template, subject: rendered.subject, html: rendered.html };
});
samples.push(
  { id: "reactivation_request_received", subject: "Profile Reactivation Request Received", html: reactivation.reactivationRequestReceivedTemplate(fixture.recipientName, fixture.partnerName, fixture.reason) },
  { id: "reactivation_partner_notification", subject: "Reactivation Request Notification", html: reactivation.reactivationPartnerNotificationTemplate(fixture.recipientName, fixture.partnerName, fixture.reason, `${appUrl}/dashboard`, "September 12, 2026") },
  { id: "reactivation_approved", subject: "Profile Reactivation Approved", html: reactivation.reactivationApprovedTemplate(fixture.recipientName, fixture.partnerName, fixture.adminNotes) },
  { id: "reactivation_denied", subject: "Profile Reactivation Request Update", html: reactivation.reactivationDeniedTemplate(fixture.recipientName, fixture.adminNotes) },
  { id: "reactivation_partner_approved", subject: "Match Reactivation Confirmed", html: reactivation.reactivationApprovedPartnerNotificationTemplate(fixture.recipientName, fixture.partnerName) },
);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const results = [];
for (const sample of samples) {
  const result = await deliverEmail({
    from, to: recipient, subject: `[MATCHINDEED TEMPLATE TEST] ${sample.id}: ${sample.subject}`,
    html: `<div style="background:#fff4cc;padding:10px;text-align:center;font-family:Arial">Template test only — no account action occurred.</div>${sample.html}`,
  }, { idempotencyKey: `template-test/${runId}/${sample.id}` });
  results.push({ id: sample.id, ...result });
  await new Promise(resolve => setTimeout(resolve, 600));
}

await new Promise(resolve => setTimeout(resolve, 8_000));
for (const result of results) {
  if (!result.messageId) continue;
  const response = await fetch(`${process.env.RESEND_API_BASE_URL || "https://api.resend.com"}/emails/${result.messageId}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  const delivery = await response.json().catch(() => ({}));
  result.lastEvent = delivery.last_event || null;
}

const summary = {
  recipient, total: results.length,
  accepted: results.filter(result => result.success).length,
  failed: results.filter(result => !result.success).length,
  events: Object.groupBy(results, result => result.lastEvent || (result.success ? "accepted" : "failed")),
};
console.log(JSON.stringify({ summary, results }, null, 2));
if (summary.failed) process.exitCode = 1;
