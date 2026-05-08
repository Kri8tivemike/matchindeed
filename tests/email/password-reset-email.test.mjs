import test from "node:test";
import assert from "node:assert/strict";

import { generateEmail } from "../../src/lib/email-templates.ts";

test("password reset email uses the branded MatchIndeed reset CTA", () => {
  const { subject, html } = generateEmail("password_reset", {
    recipientName: "Michael",
    resetUrl:
      "https://szmkvcifwopbnatsdcmw.supabase.co/auth/v1/verify?token=abc&type=recovery&redirect_to=https://matchindeed.com/reset-password",
  });

  assert.equal(subject, "Reset your MatchIndeed password");
  assert.match(html, /Reset Password/);
  assert.match(html, /type=recovery/);
  assert.match(html, /matchindeed\.com\/reset-password/);
  assert.doesNotMatch(html, /Go to Discover/);
});
