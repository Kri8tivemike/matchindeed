export type RegionalCheckoutCurrency = "NGN" | "USD";

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
