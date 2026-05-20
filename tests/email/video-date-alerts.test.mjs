import test from "node:test";
import assert from "node:assert/strict";
import { generateEmail } from "../../src/lib/email-templates.ts";

test("meeting request reminder email directs members to respond", () => {
  const { subject, html } = generateEmail("meeting_request_reminder", {
    recipientName: "Maya",
    requesterName: "Daniel",
    meetingDate: "May 23, 2026",
    meetingTime: "6:00 PM",
    meetingTimeZone: "Africa/Lagos",
    dashboardUrl: "https://matchindeed.com/dashboard/meetings?tab=pending",
  });

  assert.match(subject, /Daniel's video date request is waiting/);
  assert.match(html, /Respond to Request/);
  assert.match(html, /Africa\/Lagos/);
});

test("no active video slot email sends members to calendar", () => {
  const { subject, html } = generateEmail("no_active_video_slot", {
    recipientName: "Maya",
    actorName: "Daniel",
    triggerLabel: "liked your profile",
    dashboardUrl: "https://matchindeed.com/dashboard/calendar",
  });

  assert.equal(subject, "Add a video date slot so matches can book you");
  assert.match(html, /Daniel/);
  assert.match(html, /liked your profile/);
  assert.match(html, /Add Calendar Slot/);
});
