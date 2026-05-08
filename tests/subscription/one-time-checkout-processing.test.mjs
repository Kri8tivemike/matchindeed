import test from "node:test";
import assert from "node:assert/strict";
import { extractOneTimeCheckoutPayload } from "../../src/lib/payments/checkout-processing.ts";

test("extracts wallet top-up checkout payload from Stripe metadata", () => {
  const payload = extractOneTimeCheckoutPayload({
    amount_total: 2500,
    client_reference_id: "user-123",
    metadata: {
      type: "wallet_topup",
      userId: "user-123",
      amountCents: "2500",
      currency: "GBP",
    },
  });

  assert.deepEqual(payload, {
    paymentType: "wallet_topup",
    userId: "user-123",
    amountCents: 2500,
    currency: "gbp",
  });
});

test("extracts credit purchase payload and falls back to session amount_total", () => {
  const payload = extractOneTimeCheckoutPayload({
    amount_total: 1800,
    client_reference_id: "user-456",
    metadata: {
      type: "credit_purchase",
      userId: "user-456",
      credits: "3",
    },
  });

  assert.deepEqual(payload, {
    paymentType: "credit_purchase",
    userId: "user-456",
    amountCents: 1800,
    credits: 3,
    currency: "usd",
  });
});

test("returns null for unsupported checkout types", () => {
  const payload = extractOneTimeCheckoutPayload({
    amount_total: 799,
    client_reference_id: "user-789",
    metadata: {
      type: "subscription",
      userId: "user-789",
    },
  });

  assert.equal(payload, null);
});

test("throws when supported checkout metadata is missing user information", () => {
  assert.throws(
    () =>
      extractOneTimeCheckoutPayload({
        amount_total: 1200,
        client_reference_id: null,
        metadata: {
          type: "wallet_topup",
          amountCents: "1200",
        },
      }),
    /Missing Stripe checkout user metadata/
  );
});
