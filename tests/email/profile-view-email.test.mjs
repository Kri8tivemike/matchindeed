import test from "node:test";
import assert from "node:assert/strict";

import { generateEmail } from "../../src/lib/email-templates.ts";

test("profile view email directs members to the views tab", () => {
  const { subject, html } = generateEmail("profile_view", {
    recipientName: "Taoma",
    partnerName: "Rukewe",
    dashboardUrl: "https://matchindeed.com/dashboard/likes?tab=views",
  });

  assert.equal(subject, "Rukewe viewed your profile");
  assert.match(html, /See all views/);
  assert.match(html, /dashboard\/likes\?tab=views/);
  assert.doesNotMatch(html, /Go to Discover/);
});
