import test from "node:test";
import assert from "node:assert/strict";

import { generateEmail } from "../../src/lib/email-templates.ts";

test("meeting cancelled email uses free-plan restore wording when starter access returns", () => {
  const { subject, html } = generateEmail("meeting_cancelled", {
    recipientName: "Ifeaje",
    meetingDate: "16 April 2026",
    cancelledBy: "kunlelr2",
    freePlanRestored: true,
    dashboardUrl: "https://matchindeed.com/dashboard/meetings",
  });

  assert.equal(subject, "Video Dating Meeting Cancelled");
  assert.match(
    html,
    /Your video-dating meeting set for <strong>16 April 2026<\/strong> was cancelled by <strong>kunlelr2<\/strong>\./
  );
  assert.match(
    html,
    /Your Free Plan credit has been restored and is ready to use anytime\./
  );
  assert.match(html, /MatchIndeed Support/);
  assert.doesNotMatch(html, /Your credits have been refunded to your account\./);
});
