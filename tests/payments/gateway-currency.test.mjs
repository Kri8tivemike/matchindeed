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

test("USD uses the approved Paystack international checkout", () => {
  assert.deepEqual(getSupportedPaymentProviders("USD"), ["paystack"]);
  assert.equal(isPaymentProviderSupported("paystack", "USD"), true);
  assert.equal(isPaymentProviderSupported("flutterwave", "USD"), false);
  assert.equal(getRecommendedPaymentProvider("USD"), "paystack");
});

test("Paystack enforces its documented USD minimum", () => {
  assert.equal(getPaymentMinimumAmountCents("paystack", "USD"), 200);
  assert.equal(isPaymentAmountSupported("paystack", "USD", 199), false);
  assert.equal(isPaymentAmountSupported("paystack", "USD", 200), true);
});

test("NGN retains the MatchIndeed minimum for both providers", () => {
  assert.equal(getPaymentMinimumAmountCents("paystack", "NGN"), 5000);
  assert.equal(getPaymentMinimumAmountCents("flutterwave", "NGN"), 5000);
});
