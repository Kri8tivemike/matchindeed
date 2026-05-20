import test from "node:test";
import assert from "node:assert/strict";
import { generateEmail } from "../../src/lib/email-templates.ts";

test("unread messages re-engagement email points members back to chat", () => {
  const { subject, html } = generateEmail("reengagement_unread_messages", {
    recipientName: "Maya",
    dashboardUrl: "https://matchindeed.com/dashboard/messages/match-123",
  });

  assert.equal(subject, "Someone Is Waiting for Your Reply, Maya");
  assert.match(html, /Open Chat/);
  assert.match(html, /dashboard\/messages\/match-123/);
});

test("inactive new people re-engagement email points members to discover", () => {
  const { subject, html } = generateEmail("reengagement_new_people", {
    recipientName: "Maya",
    dashboardUrl: "https://matchindeed.com/dashboard/discover",
  });

  assert.equal(subject, "New People Want to Match with You");
  assert.match(html, /See New People/);
  assert.match(html, /dashboard\/discover/);
});

test("new matches re-engagement email points members to matches", () => {
  const { subject, html } = generateEmail("reengagement_new_matches", {
    recipientName: "Maya",
    dashboardUrl: "https://matchindeed.com/dashboard/matches",
  });

  assert.equal(subject, "You Have New Matches Waiting");
  assert.match(html, /View Matches/);
  assert.match(html, /dashboard\/matches/);
});
