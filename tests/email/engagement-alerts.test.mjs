import test from "node:test";
import assert from "node:assert/strict";
import { generateEmail } from "../../src/lib/email-templates.ts";

test("activity received email points members to likes", () => {
  const { subject, html } = generateEmail("activity_received", {
    recipientName: "Maya",
    actorName: "Daniel",
    actionLabel: "liked your profile",
    dashboardUrl: "https://matchindeed.com/dashboard/likes?tab=received",
  });

  assert.match(subject, /Daniel liked your profile/);
  assert.match(html, /See Your Likes/);
  assert.match(html, /dashboard\/likes\?tab=received/);
});

test("new message email points members to the chat", () => {
  const { subject, html } = generateEmail("new_message", {
    recipientName: "Maya",
    senderName: "Daniel",
    preview: "Hello there",
    dashboardUrl: "https://matchindeed.com/dashboard/messages/match-123",
  });

  assert.equal(subject, "New message from Daniel");
  assert.match(html, /Hello there/);
  assert.match(html, /Open Chat/);
  assert.match(html, /dashboard\/messages\/match-123/);
});
