import test from "node:test";
import assert from "node:assert/strict";

import { summarizeOneSignalWebPushStatus } from "../../src/lib/onesignal-app-status.ts";

test("detects missing web push setup on an existing app", () => {
  const status = summarizeOneSignalWebPushStatus(
    {
      id: "app-1",
      name: "matchindeed",
      site_name: "MatchIndeed",
      chrome_web_key: null,
      chrome_web_origin: null,
      site_url: null,
      safari_site_origin: null,
      channels: { push: { enabled: false } },
    },
    "https://matchindeed.com"
  );

  assert.equal(status.configured, true);
  assert.equal(status.webPushConfigured, false);
  assert.equal(status.originMatches, false);
  assert.match(status.message, /website push has not been fully configured/i);
});

test("detects origin mismatch for configured web push apps", () => {
  const status = summarizeOneSignalWebPushStatus(
    {
      id: "app-1",
      name: "matchindeed",
      site_name: "MatchIndeed",
      chrome_web_key: "key",
      chrome_web_origin: "https://staging.matchindeed.com",
      channels: { push: { enabled: true } },
    },
    "https://matchindeed.com"
  );

  assert.equal(status.webPushConfigured, true);
  assert.equal(status.originMatches, false);
  assert.equal(status.configuredOrigin, "https://staging.matchindeed.com");
  assert.equal(status.expectedOrigin, "https://matchindeed.com");
});

test("marks fully configured apps as ready", () => {
  const status = summarizeOneSignalWebPushStatus(
    {
      id: "app-1",
      name: "matchindeed",
      site_name: "MatchIndeed",
      chrome_web_key: "key",
      chrome_web_origin: "https://matchindeed.com",
      channels: { push: { enabled: true } },
    },
    "https://matchindeed.com"
  );

  assert.equal(status.webPushConfigured, true);
  assert.equal(status.originMatches, true);
  assert.match(status.message, /configured for this site/i);
});

test("treats missing browser push keys as not fully configured", () => {
  const status = summarizeOneSignalWebPushStatus(
    {
      id: "app-1",
      name: "matchindeed",
      site_name: "MatchIndeed",
      chrome_web_key: null,
      chrome_web_origin: "https://matchindeed.com",
      channels: { push: { enabled: true } },
    },
    "https://matchindeed.com"
  );

  assert.equal(status.webPushConfigured, false);
  assert.equal(status.pushChannelEnabled, true);
});
