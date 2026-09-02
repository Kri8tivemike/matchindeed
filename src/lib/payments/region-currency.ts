export type RegionalCheckoutCurrency = "NGN" | "USD";

type RequestHeaders = Pick<Headers, "get">;

/** Nigeria pays in NGN; every international market pays in USD. */
export function getCheckoutCurrencyForCountryCode(
  countryCode?: string | null
): RegionalCheckoutCurrency {
  return countryCode?.trim().toUpperCase() === "NG" ? "NGN" : "USD";
}

export function getApiCurrencyForCountryCode(
  countryCode?: string | null
): "ngn" | "usd" {
  return getCheckoutCurrencyForCountryCode(countryCode) === "NGN" ? "ngn" : "usd";
}

/** Use trusted proxy geo headers to keep checkout currency aligned with the visitor's region. */
export function getCheckoutCurrencyForRequestHeaders(
  headers: RequestHeaders
): RegionalCheckoutCurrency {
  const countryCode =
    headers.get("cf-ipcountry") || headers.get("x-vercel-ip-country");
  return getCheckoutCurrencyForCountryCode(countryCode);
}
