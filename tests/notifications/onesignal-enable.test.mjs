import test from "node:test";
import assert from "node:assert/strict";

import {
  describePushEnableTimeout,
  getPushEnableButtonLabel,
  waitForOneSignalSubscriptionReady,
} from "@/lib/onesignal-enable";

test("shows waiting label while the browser prompt is pending", () => {
  assert.equal(
    getPushEnableButtonLabel(true, "waiting_permission"),
    "Waiting for browser..."
  );
});

test("shows default label when push enable is idle", () => {
  assert.equal(getPushEnableButtonLabel(false, "idle"), "Enable browser push");
});

test("describes a still-open browser prompt", () => {
  assert.equal(
    describePushEnableTimeout({
      permission: "default",
      promptShown: true,
    }),
    "The browser notification prompt is still waiting for a response. Check the prompt or your browser's site controls, then try again."
  );
});

test("describes a browser suppressing the native popup after the MatchIndeed prompt", () => {
  assert.equal(
    describePushEnableTimeout({
      permission: "default",
      promptShown: false,
      prePromptAccepted: true,
    }),
    "Your browser did not open the notification popup after you selected Enable Notifications. Check the address bar or browser site settings, then try again."
  );
});

test("describes a blocked browser permission state", () => {
  assert.equal(
    describePushEnableTimeout({
      permission: "denied",
      promptShown: false,
    }),
    "Browser push is blocked for MatchIndeed. Allow notifications in your browser's site settings, then try again."
  );
});

test("waits for a usable OneSignal subscription token", async () => {
  let changeListener = null;
  const subscription = {
    id: null,
    token: null,
    optedIn: false,
    addEventListener(event, listener) {
      assert.equal(event, "change");
      changeListener = listener;
    },
    removeEventListener() {},
  };

  const readyPromise = waitForOneSignalSubscriptionReady({
    subscription,
    timeoutMs: 100,
  });

  changeListener?.({
    current: {
      id: "sub_123",
      token: "token_abc",
      optedIn: true,
    },
  });

  const ready = await readyPromise;
  assert.deepEqual(ready, {
    id: "sub_123",
    token: "token_abc",
  });
});

test("returns immediately for an existing valid subscription", async () => {
  const ready = await waitForOneSignalSubscriptionReady({
    subscription: {
      id: "sub_existing",
      token: "token_existing",
      optedIn: true,
      addEventListener() {},
      removeEventListener() {},
    },
    timeoutMs: 100,
  });

  assert.deepEqual(ready, {
    id: "sub_existing",
    token: "token_existing",
  });
});
