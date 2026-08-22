import assert from "node:assert/strict";
import test from "node:test";

import {
  getApiCurrencyForCountryCode,
  getCheckoutCurrencyForCountryCode,
} from "../../src/lib/payments/region-currency.ts";

test("Nigeria uses NGN", () => {
  assert.equal(getCheckoutCurrencyForCountryCode("NG"), "NGN");
  assert.equal(getCheckoutCurrencyForCountryCode("ng"), "NGN");
  assert.equal(getApiCurrencyForCountryCode("NG"), "ngn");
});

test("international countries use USD", () => {
  for (const countryCode of ["GB", "US", "CA", "GH", "ZA", null, undefined]) {
    assert.equal(getCheckoutCurrencyForCountryCode(countryCode), "USD");
    assert.equal(getApiCurrencyForCountryCode(countryCode), "usd");
  }
});
