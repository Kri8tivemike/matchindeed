import test from "node:test";
import assert from "node:assert/strict";
import { EMAIL_TEMPLATES, generateEmail } from "../../src/lib/email-templates.ts";

const data = {
  recipientName: "Test User",
  confirmationUrl: "https://matchindeed.com/auth/confirm?token=test",
  resetUrl: "https://matchindeed.com/reset-password?token=test",
  dashboardUrl: "https://matchindeed.com/dashboard",
  responseUrl: "https://matchindeed.com/dashboard/meetings/test/response",
  reactivateUrl: "https://matchindeed.com/dashboard/profile/my-account",
  requesterName: "Test Requester",
  senderName: "Test Sender",
  actorName: "Test Member",
  partnerName: "Test Partner",
  meetingDate: "September 8, 2026",
  meetingTime: "3:00 PM",
  meetingTimeZone: "Africa/Lagos",
  meetingType: "Video Call",
  timeUntil: "in 30 minutes",
  cancelledBy: "Test User",
  cancellationReason: "Test reason",
  meetingRef: "TEST-001",
  creditAmount: 10,
  walletAmount: "20 credits",
  reason: "Test reason",
  warningMessage: "Test account notice",
  details: "Test details",
  count: 2,
  location: "Lagos",
  preview: "Hello from a test message",
  triggerLabel: "liked your profile",
  requestedAt: "September 5, 2026",
  awaitingAdminApproval: false,
  freePlanRestored: false,
  refundIssued: true,
  chargeApplied: false,
  adminNotes: "Test notes",
  yourResponsePending: true,
};

test("every registered email template renders a complete production-safe document", () => {
  assert.equal(EMAIL_TEMPLATES.length, 36);
  for (const template of EMAIL_TEMPLATES) {
    const { subject, html } = generateEmail(template, data);
    assert.ok(subject.trim(), `${template}: missing subject`);
    assert.match(html, /<!DOCTYPE html>/, `${template}: missing document wrapper`);
    assert.match(html, /MatchIndeed/, `${template}: missing branding`);
    assert.doesNotMatch(html, /(?:href|src)=["']#["']/, `${template}: placeholder link`);
    assert.doesNotMatch(html, /localhost|\bundefined\b|\bnull\b/, `${template}: invalid content`);
    for (const [, url] of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
      assert.ok(url.startsWith("https://") || url.startsWith("mailto:"), `${template}: unsafe URL ${url}`);
    }
  }
});

test("plain user content is escaped in every template", () => {
  const malicious = "<img src=x onerror=alert(1)> & Test";
  for (const template of EMAIL_TEMPLATES) {
    const { html } = generateEmail(template, { ...data, recipientName: malicious, partnerName: malicious });
    assert.doesNotMatch(html, /<img src=x/, `${template}: unescaped user content`);
    assert.match(html, /&lt;img/, `${template}: escaped name missing`);
  }
});

test("security email templates reject missing or unsafe action links", () => {
  assert.throws(() => generateEmail("signup_confirmation", { recipientName: "Test" }), /required/);
  assert.throws(() => generateEmail("password_reset", { recipientName: "Test" }), /required/);
  assert.throws(() => generateEmail("password_reset", {
    recipientName: "Test", resetUrl: "javascript:alert(1)",
  }), /HTTPS/);
});
