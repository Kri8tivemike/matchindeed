import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCheckoutUrl,
  parseCheckoutIntent,
} from "../../src/lib/payments/checkout-intent.ts";

test("subscription checkout can switch between international currencies", () => {
  for (const currency of ["USD", "GBP"]) {
    const url = buildCheckoutUrl({
      type: "subscription",
      tier: "basic",
      currency,
    });
    const parsed = parseCheckoutIntent(
      new URL(url, "https://matchindeed.com").searchParams
    );

    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.intent.currency, currency);
      assert.equal(parsed.intent.tier, "basic");
    }
  }
});

test("wallet and credit checkout amounts stay bound to their currency", () => {
  const walletUrl = buildCheckoutUrl({
    type: "wallet_topup",
    amountCents: 2500,
    currency: "USD",
  });
  const parsed = parseCheckoutIntent(
    new URL(walletUrl, "https://matchindeed.com").searchParams
  );

  assert.deepEqual(parsed, {
    ok: true,
    intent: {
      type: "wallet_topup",
      amountCents: 2500,
      currency: "USD",
    },
  });
});
