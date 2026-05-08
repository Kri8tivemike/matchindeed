import test from "node:test";
import assert from "node:assert/strict";

import { generateEmail } from "../../src/lib/email-templates.ts";

test("meeting approved email tells users admin approved the meeting", () => {
  const { subject, html } = generateEmail("meeting_approved", {
    recipientName: "Ifeaje",
    partnerName: "kunlelr2",
    meetingDate: "16 April 2026",
    meetingTime: "3:30 PM",
    meetingTimeZone: "Africa/Lagos",
    dashboardUrl: "https://matchindeed.com/dashboard/meetings",
  });

  assert.equal(subject, "Your video date has been approved by MatchIndeed");
  assert.match(
    html,
    /MatchIndeed admin has approved your video meeting with <strong>kunlelr2<\/strong>\./
  );
  assert.match(html, /<span class="badge badge-green">Approved by Admin<\/span>/);
  assert.match(html, /Your meeting link is now ready in your appointments\./);
  assert.match(html, /https:\/\/matchindeed\.com\/dashboard\/meetings/);
});
