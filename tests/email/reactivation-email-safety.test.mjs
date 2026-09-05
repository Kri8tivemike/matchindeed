import test from "node:test";
import assert from "node:assert/strict";
import {
  reactivationApprovedTemplate,
  reactivationDeniedTemplate,
  reactivationPartnerNotificationTemplate,
  reactivationRequestReceivedTemplate,
} from "../../src/lib/email/reactivation-templates.ts";

test("reactivation templates escape all user and administrator content", () => {
  const unsafe = "<img src=x onerror=alert(1)> & test";
  const documents = [
    reactivationRequestReceivedTemplate(unsafe, unsafe, unsafe),
    reactivationPartnerNotificationTemplate(unsafe, unsafe, unsafe, "https://matchindeed.com/dashboard", unsafe),
    reactivationApprovedTemplate(unsafe, unsafe, unsafe),
    reactivationDeniedTemplate(unsafe, unsafe),
  ];
  for (const html of documents) {
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img/);
  }
});

test("reactivation response links must be safe web URLs", () => {
  assert.throws(() => reactivationPartnerNotificationTemplate(
    "Test", "Test", "Test", "javascript:alert(1)", "Tomorrow",
  ), /HTTPS/);
});
