import assert from "node:assert/strict";
import test from "node:test";

import {
  getRecommendedPaymentProvider,
  getSupportedPaymentProviders,
  getUnsupportedProviderMessage,
  isPaymentProviderSupported,
} from "../../src/lib/payments/gateway-currency.ts";

test("NGN supports Paystack and Flutterwave with Paystack recommended", () => {
  assert.deepEqual(getSupportedPaymentProviders("NGN"), ["paystack", "flutterwave"]);
  assert.equal(getRecommendedPaymentProvider("NGN"), "paystack");
  assert.equal(isPaymentProviderSupported("paystack", "NGN"), true);
  assert.equal(isPaymentProviderSupported("flutterwave", "NGN"), true);
});

test("GBP supports Flutterwave only", () => {
  assert.deepEqual(getSupportedPaymentProviders("GBP"), ["flutterwave"]);
  assert.equal(isPaymentProviderSupported("paystack", "GBP"), false);
  assert.equal(
    getUnsupportedProviderMessage("paystack", "GBP"),
    "Paystack is not available for GBP payments. Please use Flutterwave."
  );
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
