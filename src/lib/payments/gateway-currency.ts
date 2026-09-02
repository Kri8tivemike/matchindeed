import type {
  CheckoutCurrency,
  CheckoutPaymentProvider,
} from "@/lib/payments/checkout-intent";

const BASE_GATEWAY_CURRENCY_SUPPORT: Record<
  CheckoutCurrency,
  readonly CheckoutPaymentProvider[]
> = {
  NGN: ["paystack", "flutterwave"],
  USD: ["paystack"],
};

const BASE_MINIMUM_AMOUNT_CENTS: Record<CheckoutCurrency, number> = {
  NGN: 5000,
  USD: 50,
};

const PROVIDER_MINIMUM_AMOUNT_CENTS: Partial<
  Record<CheckoutPaymentProvider, Partial<Record<CheckoutCurrency, number>>>
> = {
  paystack: {
    NGN: 5000,
    USD: 200,
  },
};

export function getSupportedPaymentProviders(
  currency: CheckoutCurrency
): CheckoutPaymentProvider[] {
  return [...BASE_GATEWAY_CURRENCY_SUPPORT[currency]];
}

export function isPaymentProviderSupported(
  provider: CheckoutPaymentProvider,
  currency: CheckoutCurrency
) {
  return getSupportedPaymentProviders(currency).includes(provider);
}

export function getPaymentMinimumAmountCents(
  provider: CheckoutPaymentProvider,
  currency: CheckoutCurrency
) {
  return (
    PROVIDER_MINIMUM_AMOUNT_CENTS[provider]?.[currency] ??
    BASE_MINIMUM_AMOUNT_CENTS[currency]
  );
}

export function isPaymentAmountSupported(
  provider: CheckoutPaymentProvider,
  currency: CheckoutCurrency,
  amountCents: number
) {
  return amountCents >= getPaymentMinimumAmountCents(provider, currency);
}

export function getRecommendedPaymentProvider(
  currency: CheckoutCurrency
): CheckoutPaymentProvider {
  return getSupportedPaymentProviders(currency)[0];
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
