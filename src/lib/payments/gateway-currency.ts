import type {
  CheckoutCurrency,
  CheckoutPaymentProvider,
} from "@/lib/payments/checkout-intent";

const BASE_GATEWAY_CURRENCY_SUPPORT: Record<
  CheckoutCurrency,
  readonly CheckoutPaymentProvider[]
> = {
  NGN: ["paystack", "flutterwave"],
  GBP: ["flutterwave"],
  USD: ["flutterwave"],
};

export function isPaystackUsdEnabled() {
  return process.env.NEXT_PUBLIC_PAYSTACK_USD_ENABLED === "true";
}

export function getSupportedPaymentProviders(
  currency: CheckoutCurrency,
  options: { paystackUsdEnabled?: boolean } = {}
): CheckoutPaymentProvider[] {
  const providers = [...BASE_GATEWAY_CURRENCY_SUPPORT[currency]];
  const paystackUsdEnabled = options.paystackUsdEnabled ?? isPaystackUsdEnabled();

  if (currency === "USD" && paystackUsdEnabled) {
    return ["paystack", ...providers];
  }

  return providers;
}

export function isPaymentProviderSupported(
  provider: CheckoutPaymentProvider,
  currency: CheckoutCurrency,
  options: { paystackUsdEnabled?: boolean } = {}
) {
  return getSupportedPaymentProviders(currency, options).includes(provider);
}

export function getRecommendedPaymentProvider(
  currency: CheckoutCurrency,
  options: { paystackUsdEnabled?: boolean } = {}
): CheckoutPaymentProvider {
  const supportedProviders = getSupportedPaymentProviders(currency, options);
  return currency === "NGN" && supportedProviders.includes("paystack")
    ? "paystack"
    : supportedProviders[0];
}

export function getUnsupportedProviderMessage(
  provider: CheckoutPaymentProvider,
  currency: CheckoutCurrency
) {
  const providerName = provider === "paystack" ? "Paystack" : "Flutterwave";
  const supportedProvider = getRecommendedPaymentProvider(currency);
  const supportedProviderName =
    supportedProvider === "paystack" ? "Paystack" : "Flutterwave";

  return `${providerName} is not available for ${currency} payments. Please use ${supportedProviderName}.`;
}
