import assert from "node:assert/strict";
import test from "node:test";

import {
  getApiCurrencyForCountryCode,
  getCheckoutCurrencyForCountryCode,
  getCheckoutCurrencyForRequestHeaders,
} from "../../src/lib/payments/region-currency.ts";

test("Nigeria uses NGN", () => {
  assert.equal(getCheckoutCurrencyForCountryCode("NG"), "NGN");
  assert.equal(getCheckoutCurrencyForCountryCode("ng"), "NGN");
  assert.equal(getApiCurrencyForCountryCode("NG"), "ngn");
});

test("checkout request headers retain the regional currency policy", () => {
  assert.equal(
    getCheckoutCurrencyForRequestHeaders(new Headers({ "cf-ipcountry": "NG" })),
    "NGN"
  );
  assert.equal(
    getCheckoutCurrencyForRequestHeaders(new Headers({ "cf-ipcountry": "GB" })),
    "USD"
  );
  assert.equal(getCheckoutCurrencyForRequestHeaders(new Headers()), "USD");
});

test("international countries use USD", () => {
  for (const countryCode of ["GB", "US", "CA", "GH", "ZA", null, undefined]) {
    assert.equal(getCheckoutCurrencyForCountryCode(countryCode), "USD");
    assert.equal(getApiCurrencyForCountryCode(countryCode), "usd");
  }
});
