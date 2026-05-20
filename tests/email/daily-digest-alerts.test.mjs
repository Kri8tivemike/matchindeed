import test from "node:test";
import assert from "node:assert/strict";
import { generateEmail } from "../../src/lib/email-templates.ts";

test("daily profile views digest includes the count and views CTA", () => {
  const { subject, html } = generateEmail("daily_profile_views", {
    recipientName: "Maya",
    count: 3,
    dashboardUrl: "https://matchindeed.com/dashboard/likes?tab=views",
  });

  assert.match(subject, /3 people viewed your profile today/);
  assert.match(html, /Your profile received <strong>3<\/strong>/);
  assert.match(html, /See Your Views/);
});

test("daily new likes digest includes the count and likes CTA", () => {
  const { subject, html } = generateEmail("daily_new_likes", {
    recipientName: "Maya",
    count: 2,
    dashboardUrl: "https://matchindeed.com/dashboard/likes?tab=received",
  });

  assert.equal(subject, "You received 2 new likes today");
  assert.match(html, /You received <strong>2<\/strong>/);
  assert.match(html, /See Your Likes/);
});

test("daily recommendations digest includes the count and recommendations CTA", () => {
  const { subject, html } = generateEmail("daily_recommendations", {
    recipientName: "Maya",
    count: 5,
    dashboardUrl: "https://matchindeed.com/dashboard/discover",
  });

  assert.equal(subject, "New Recommendations Just for You");
  assert.match(html, /We found <strong>5<\/strong>/);
  assert.match(html, /See Your Recommendations/);
});
