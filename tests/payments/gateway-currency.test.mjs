import assert from "node:assert/strict";
import test from "node:test";

import {
  getPaymentMinimumAmountCents,
  getRecommendedPaymentProvider,
  getSupportedPaymentProviders,
  isPaymentAmountSupported,
  isPaymentProviderSupported,
} from "../../src/lib/payments/gateway-currency.ts";

test("NGN supports Paystack and Flutterwave with Paystack recommended", () => {
  assert.deepEqual(getSupportedPaymentProviders("NGN"), ["paystack", "flutterwave"]);
  assert.equal(getRecommendedPaymentProvider("NGN"), "paystack");
  assert.equal(isPaymentProviderSupported("paystack", "NGN"), true);
  assert.equal(isPaymentProviderSupported("flutterwave", "NGN"), true);
});

test("USD supports Flutterwave only by default", () => {
  assert.deepEqual(
    getSupportedPaymentProviders("USD", { paystackUsdEnabled: false }),
    ["flutterwave"]
  );
  assert.equal(
    isPaymentProviderSupported("paystack", "USD", { paystackUsdEnabled: false }),
    false
  );
});

test("USD can explicitly enable Paystack", () => {
  assert.deepEqual(
    getSupportedPaymentProviders("USD", { paystackUsdEnabled: true }),
    ["paystack", "flutterwave"]
  );
  assert.equal(
    isPaymentProviderSupported("paystack", "USD", { paystackUsdEnabled: true }),
    true
  );
  assert.equal(
    getRecommendedPaymentProvider("USD", { paystackUsdEnabled: true }),
    "flutterwave"
  );
});

test("Paystack enforces its documented USD minimum", () => {
  assert.equal(getPaymentMinimumAmountCents("paystack", "USD"), 200);
  assert.equal(isPaymentAmountSupported("paystack", "USD", 199), false);
  assert.equal(isPaymentAmountSupported("paystack", "USD", 200), true);
  assert.equal(isPaymentAmountSupported("flutterwave", "USD", 50), true);
});

test("NGN retains the MatchIndeed minimum for both providers", () => {
  assert.equal(getPaymentMinimumAmountCents("paystack", "NGN"), 5000);
  assert.equal(getPaymentMinimumAmountCents("flutterwave", "NGN"), 5000);
});
