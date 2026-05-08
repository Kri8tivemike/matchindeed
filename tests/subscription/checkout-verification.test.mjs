import test from "node:test";
import assert from "node:assert/strict";
import { resolveSubscriptionActivationResult } from "../../src/lib/subscription/checkout-verification.ts";

test("successful verification only resolves once the expected tier is active", () => {
  const result = resolveSubscriptionActivationResult(
    {
      success: true,
      tier: "standard",
      message: "Subscription processed successfully.",
    },
    {
      activeTier: "basic",
      hasActiveMembership: true,
    }
  );

  assert.equal(result.success, false);
  assert.equal(result.retryable, true);
  assert.equal(
    result.message,
    "Payment confirmed. We're finalizing your subscription and updating your account now."
  );
});

test("successful verification resolves when the expected tier is active", () => {
  const result = resolveSubscriptionActivationResult(
    {
      success: true,
      tier: "premium",
      message: "Subscription processed successfully.",
    },
    {
      activeTier: "premium",
      hasActiveMembership: true,
    }
  );

  assert.equal(result.success, true);
  assert.equal(result.retryable, false);
  assert.equal(result.message, "Subscription processed successfully.");
});

test("retryable verification keeps the flow in processing state", () => {
  const result = resolveSubscriptionActivationResult(
    {
      success: false,
      retryable: true,
      message: "Subscription activation is already in progress.",
    },
    {
      activeTier: null,
      hasActiveMembership: false,
    }
  );

  assert.equal(result.success, false);
  assert.equal(result.retryable, true);
  assert.equal(result.message, "Subscription activation is already in progress.");
});
