"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Landmark,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import Sidebar from "@/components/dashboard/Sidebar";
import { useToast } from "@/components/ToastProvider";
import { getCurrentUserSafe } from "@/lib/auth-helpers";
import {
  DEFAULT_SUBSCRIPTION_PRICING,
  type TierPricing,
} from "@/lib/subscription/config";
import {
  type CheckoutCurrency,
  type CheckoutIntent,
  type CheckoutPaymentProvider,
  buildCheckoutUrl,
  parseCheckoutIntent,
} from "@/lib/payments/checkout-intent";
import {
  getPaymentMinimumAmountCents,
  getRecommendedPaymentProvider,
  getSupportedPaymentProviders,
  isPaymentAmountSupported,
} from "@/lib/payments/gateway-currency";

type CheckoutDisplay = {
  title: string;
  description: string;
  amountCents: number;
  returnPath: string;
  payload: Record<string, string | number>;
};

const SUBSCRIPTION_CURRENCIES: CheckoutCurrency[] = ["NGN", "USD"];

function CardBrandMarks({ currency }: { currency: CheckoutCurrency }) {
  return (
    <div
      className="flex min-w-0 items-center gap-1.5"
      aria-label={`Supported card brands: Visa, Mastercard, American Express${
        currency === "NGN" ? ", and Verve" : ""
      }`}
    >
      <span
        title="Visa"
        className="flex h-5 min-w-9 items-center justify-center rounded border border-gray-200 bg-white px-1 text-[9px] font-black italic tracking-tight text-[#1434CB]"
      >
        VISA
      </span>
      <span
        title="Mastercard"
        className="relative flex h-5 w-8 items-center justify-center rounded border border-gray-200 bg-white"
      >
        <span className="absolute left-[7px] h-3 w-3 rounded-full bg-[#EB001B]" />
        <span className="absolute right-[7px] h-3 w-3 rounded-full bg-[#F79E1B] opacity-90" />
      </span>
      <span
        title="American Express"
        className="flex h-5 min-w-8 items-center justify-center rounded bg-[#2E77BC] px-1 text-[7px] font-black leading-none text-white"
      >
        AMEX
      </span>
      {currency === "NGN" && (
        <span
          title="Verve"
          className="flex h-5 min-w-9 items-center justify-center rounded border border-gray-200 bg-white px-1 text-[8px] font-black italic text-[#009B4D]"
        >
          Verve
        </span>
      )}
    </div>
  );
}

function ProviderPaymentMethods({
  provider,
  currency,
}: {
  provider: CheckoutPaymentProvider;
  currency: CheckoutCurrency;
}) {
  return (
    <div className="mt-2 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
      <CardBrandMarks currency={currency} />
      {currency === "NGN" && (
        <>
          <span
            title="Bank transfer"
            aria-label="Bank transfer"
            className="flex h-5 min-w-7 items-center justify-center rounded border border-gray-200 bg-white text-gray-600"
          >
            <Landmark className="h-3 w-3" />
          </span>
          <span
            title="USSD"
            aria-label="USSD"
            className="flex h-5 min-w-9 items-center justify-center gap-0.5 rounded border border-gray-200 bg-white px-1 text-[7px] font-bold text-gray-600"
          >
            <Smartphone className="h-2.5 w-2.5" />
            USSD
          </span>
        </>
      )}
      <span className="sr-only">
        {provider === "paystack" ? "Available through Paystack" : "Available through Flutterwave"}
      </span>
    </div>
  );
}

function getProviderCard(
  provider: CheckoutPaymentProvider,
  currency: CheckoutCurrency
) {
  if (provider === "paystack") {
    return {
      id: provider,
      title: "Paystack",
      description:
        currency === "NGN"
          ? "Fast local checkout for Nigerian payments."
          : "International card checkout billed securely in USD.",
    };
  }

  return {
    id: provider,
    title: "Flutterwave",
    description:
      currency === "NGN"
        ? "Flexible local checkout with multiple payment options."
        : "International card and account checkout in USD.",
  };
}

function formatMoney(amountCents: number, currency: CheckoutCurrency) {
  const amount = amountCents / 100;
  if (currency === "NGN") {
    return `₦${amount.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function tierName(tier: string) {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function subscriptionAmountCents(
  intent: Extract<CheckoutIntent, { type: "subscription" }>,
  subscriptionPricing: Record<string, TierPricing>
) {
  const pricing = subscriptionPricing[intent.tier] || DEFAULT_SUBSCRIPTION_PRICING[intent.tier];
  const key = intent.currency.toLowerCase() as keyof typeof pricing;
  return Math.round(pricing[key] * 100);
}

function getCheckoutDisplay(
  intent: CheckoutIntent,
  subscriptionPricing: Record<string, TierPricing>
): CheckoutDisplay {
  if (intent.type === "subscription") {
    const amountCents = subscriptionAmountCents(intent, subscriptionPricing);
    return {
      title: `${tierName(intent.tier)} Plan`,
      description: "Monthly subscription",
      amountCents,
      returnPath: "/dashboard/profile/subscription",
      payload: {
        tier: intent.tier,
        currency: intent.currency,
      },
    };
  }

  if (intent.type === "wallet_topup") {
    return {
      title: "Wallet Top-up",
      description: "Add funds to your MatchIndeed wallet",
      amountCents: intent.amountCents,
      returnPath: "/dashboard/wallet?open=topup",
      payload: {
        type: intent.type,
        currency: intent.currency,
        amount: intent.amountCents / 100,
        amountCents: intent.amountCents,
      },
    };
  }

  return {
    title: `${intent.credits} Credits`,
    description: "Extra MatchIndeed credits",
    amountCents: intent.amountCents,
    returnPath: "/dashboard/wallet?open=credits",
    payload: {
      type: intent.type,
      currency: intent.currency,
      amount: intent.amountCents / 100,
      amountCents: intent.amountCents,
      credits: intent.credits,
    },
  };
}

function redirectToHostedCheckout(url: string | null | undefined) {
  if (!url) {
    throw new Error("Unable to start payment checkout right now. Please try again.");
  }

  const isFramed = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  if (isFramed) {
    try {
      if (window.top) {
        window.top.location.href = url;
        return;
      }
    } catch {
      // Fall through to popup/window navigation.
    }

    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) return;
  }

  window.location.assign(url);
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [provider, setProvider] = useState<CheckoutPaymentProvider>("paystack");
  const [processing, setProcessing] = useState(false);
  const [subscriptionPricing, setSubscriptionPricing] = useState(DEFAULT_SUBSCRIPTION_PRICING);

  const parsedIntent = useMemo(
    () => parseCheckoutIntent(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const display = parsedIntent.ok
    ? getCheckoutDisplay(parsedIntent.intent, subscriptionPricing)
    : null;
  const checkoutCurrency = parsedIntent.ok ? parsedIntent.intent.currency : null;
  const currencyProviders = useMemo(
    () => (checkoutCurrency ? getSupportedPaymentProviders(checkoutCurrency) : []),
    [checkoutCurrency]
  );
  const supportedProviders = useMemo(
    () =>
      checkoutCurrency && display
        ? currencyProviders.filter((providerId) =>
            isPaymentAmountSupported(providerId, checkoutCurrency, display.amountCents)
          )
        : [],
    [checkoutCurrency, currencyProviders, display]
  );
  const selectedProvider =
    checkoutCurrency && supportedProviders.includes(provider)
      ? provider
      : checkoutCurrency
        ? getRecommendedPaymentProvider(checkoutCurrency)
        : undefined;

  useEffect(() => {
    if (!checkoutCurrency) return;
    setProvider(getRecommendedPaymentProvider(checkoutCurrency));
  }, [checkoutCurrency]);

  useEffect(() => {
    fetch("/api/subscription-pricing")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.tiers) return;
        setSubscriptionPricing((current) => {
          const next = { ...current };
          for (const tier of data.tiers) {
            if (
              typeof tier?.id === "string" &&
              tier.id in next &&
              tier.pricing
            ) {
              next[tier.id as keyof typeof next] = tier.pricing;
            }
          }
          return next;
        });
      })
      .catch(() => {});
  }, []);

  const changeSubscriptionCurrency = (currency: CheckoutCurrency) => {
    if (!parsedIntent.ok || parsedIntent.intent.type !== "subscription") return;
    if (parsedIntent.intent.currency === currency) return;

    router.replace(
      buildCheckoutUrl({
        ...parsedIntent.intent,
        currency,
      })
    );
  };

  const startCheckout = async () => {
    if (!parsedIntent.ok || !display) return;

    try {
      setProcessing(true);
      const user = await getCurrentUserSafe();
      if (!user) {
        toast.error("Please log in to continue payment.");
        window.location.href = `/login?next=${encodeURIComponent(
          buildCheckoutUrl(parsedIntent.intent)
        )}`;
        return;
      }

      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...display.payload,
          userId: user.id,
          provider: selectedProvider,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Checkout failed");
      }

      await redirectToHostedCheckout(data.url);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to start checkout.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/dashboard">
            <Image
              src="/matchindeed-logo-black-font.png"
              alt="MatchIndeed"
              width={110}
              height={28}
              style={{ width: "auto", height: "auto" }}
            />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-5 px-4 py-5">
        <aside className="hidden w-56 flex-shrink-0 md:block">
          <Sidebar active="subscription" />
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4">
            <Link
              href={display?.returnPath || "/dashboard/profile/subscription"}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f419a] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">Complete Payment</h1>
            <p className="mt-1 text-sm text-gray-500">
              Review your order, choose a secure checkout provider, and continue.
            </p>
          </div>

          {!parsedIntent.ok ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-base font-bold text-amber-900">Payment details needed</h2>
              <p className="mt-2 text-sm text-amber-800">{parsedIntent.message}</p>
              <Link
                href={parsedIntent.returnPath}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Return and choose again
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="space-y-3">
                {parsedIntent.intent.type === "subscription" && (
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div>
                        <h2 className="text-base font-bold text-gray-900">Payment Currency</h2>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Nigeria uses NGN; international payments use USD.
                        </p>
                      </div>
                    <div
                      className="grid w-full grid-cols-2 rounded-lg border border-gray-200 bg-gray-50 p-1 sm:w-52"
                      role="radiogroup"
                      aria-label="Payment currency"
                    >
                      {SUBSCRIPTION_CURRENCIES.map((currency) => {
                        const selected = currency === checkoutCurrency;
                        return (
                          <button
                            key={currency}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => changeSubscriptionCurrency(currency)}
                            className={`min-h-9 rounded-md px-3 text-xs font-bold transition-colors ${
                              selected
                                ? "bg-white text-[#1f419a] shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                            }`}
                          >
                            {currency}
                          </button>
                        );
                      })}
                    </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <h2 className="text-base font-bold text-gray-900">Payment Method</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Choose how you want to complete this transaction.
                  </p>

                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {supportedProviders.map((providerId) => {
                      const card = getProviderCard(
                        providerId,
                        parsedIntent.intent.currency
                      );
                      const selected = selectedProvider === card.id;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => setProvider(card.id)}
                          className={`relative rounded-lg border p-3.5 text-left transition-all ${
                            selected
                              ? "border-[#2448ad] bg-[#f1f4ff] shadow-sm ring-1 ring-[#2448ad]/10"
                              : "border-gray-200 bg-white hover:border-[#1f419a]/40 hover:bg-gray-50/50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-[#1f419a] shadow-sm">
                                <CreditCard className="h-4 w-4" />
                              </div>
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <h3 className="text-sm font-bold text-gray-900">{card.title}</h3>
                                {checkoutCurrency === "NGN" && card.id === "paystack" && (
                                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-700">
                                    Recommended
                                  </span>
                                )}
                              </div>
                            </div>
                            <CheckCircle2
                              className={`h-4 w-4 flex-shrink-0 ${
                                selected ? "text-[#1f419a]" : "text-gray-300"
                              }`}
                            />
                          </div>
                          <ProviderPaymentMethods
                            provider={card.id}
                            currency={parsedIntent.intent.currency}
                          />
                          <p className="mt-2 text-xs leading-4 text-gray-500">
                            {card.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {checkoutCurrency && (
                    <p className="mt-2.5 text-[11px] leading-4 text-gray-500">
                      {checkoutCurrency === "NGN"
                        ? "Paystack is recommended for Nigerian Naira payments. Flutterwave is also available."
                        : supportedProviders.includes("paystack")
                            ? "Customers in the US, Canada, the UK, and other supported countries can pay in USD with an eligible international card. Their bank may convert the charge from their card currency."
                            : "Flutterwave is currently used for USD and international checkout."}
                    </p>
                  )}
                  {checkoutCurrency === "USD" &&
                    currencyProviders.includes("paystack") &&
                    display &&
                    !isPaymentAmountSupported("paystack", "USD", display.amountCents) && (
                      <p className="mt-2 text-xs leading-5 text-amber-700">
                        Paystack is unavailable for this order because its minimum USD
                        payment is {`$${(
                          getPaymentMinimumAmountCents("paystack", "USD") / 100
                        ).toFixed(2)}`}.
                      </p>
                    )}
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-900">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0" />
                    <p>
                      You will be redirected to the selected hosted checkout provider to
                      complete payment securely.
                    </p>
                  </div>
                </div>
              </section>

              <aside className="space-y-3">
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <h2 className="text-base font-bold text-gray-900">Order Summary</h2>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-900">{display?.title}</p>
                        <p className="text-sm text-gray-500">{display?.description}</p>
                      </div>
                      <Wallet className="h-5 w-5 flex-shrink-0 text-[#1f419a]" />
                    </div>
                    <div className="border-t border-gray-100 pt-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Currency</span>
                        <span className="font-semibold text-gray-900">
                          {parsedIntent.intent.currency}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm text-gray-500">Total</span>
                        <span className="text-lg font-bold text-gray-900">
                          {display && formatMoney(display.amountCents, parsedIntent.intent.currency)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={startCheckout}
                    disabled={processing}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#2448ad] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1f419a] disabled:opacity-60"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Starting checkout...
                      </>
                    ) : (
                      <>
                        Continue to Payment
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <LockKeyhole className="mt-0.5 h-5 w-5 text-gray-500" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Secure checkout</p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        MatchIndeed does not store your card details. Need help?
                        Contact support before completing payment.
                      </p>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
