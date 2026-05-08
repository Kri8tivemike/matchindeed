import test from "node:test";
import assert from "node:assert/strict";

import {
  getRealtimeBackoffRemainingMs,
  isRealtimeFailureStatus,
  noteRealtimeFailure,
  noteRealtimeSubscribed,
  shouldUseRealtime,
} from "@/lib/realtime-fallback";

test("recognizes realtime failure statuses that should back off", () => {
  assert.equal(isRealtimeFailureStatus("CHANNEL_ERROR"), true);
  assert.equal(isRealtimeFailureStatus("TIMED_OUT"), true);
  assert.equal(isRealtimeFailureStatus("CLOSED"), true);
  assert.equal(isRealtimeFailureStatus("SUBSCRIBED"), false);
});

test("realtime backoff disables subscriptions until cleared", () => {
  installBrowserMocks();

  assert.equal(shouldUseRealtime(), true);
  assert.equal(noteRealtimeFailure("CHANNEL_ERROR"), true);
  assert.equal(shouldUseRealtime(), false);
  assert.equal(getRealtimeBackoffRemainingMs() > 0, true);

  noteRealtimeSubscribed();
  assert.equal(shouldUseRealtime(), true);
  assert.equal(getRealtimeBackoffRemainingMs(), 0);
});

test("ignores non-failure statuses when setting backoff", () => {
  installBrowserMocks();

  assert.equal(noteRealtimeFailure("SUBSCRIBED"), false);
  assert.equal(shouldUseRealtime(), true);
});

function createStorage() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function installBrowserMocks() {
  global.window = {
    sessionStorage: createStorage(),
  };

  Object.defineProperty(global, "document", {
    configurable: true,
    value: { hidden: false },
  });

  Object.defineProperty(global, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
}
