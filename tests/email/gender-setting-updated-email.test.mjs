import test from "node:test";
import assert from "node:assert/strict";

import { generateEmail } from "../../src/lib/email-templates.ts";

test("gender setting updated email uses required subject and safety copy", () => {
  const { subject, html } = generateEmail("gender_setting_updated", {
    recipientName: "Ada",
  });

  assert.equal(subject, "Your Gender Setting Has Been Updated");
  assert.match(html, /Hi Ada,/);
  assert.match(html, /Your gender setting has been updated\./);
  assert.match(
    html,
    /For your safety, your account has been re-verified and your match preferences have been refreshed\./
  );
});
