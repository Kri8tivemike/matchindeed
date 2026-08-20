"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Loader2,
  LockKeyhole,
  ShieldCheck,
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

type CheckoutDisplay = {
  title: string;
  description: string;
  amountCents: number;
  returnPath: string;
  payload: Record<string, string | number>;
};

const providerCards: Array<{
  id: CheckoutPaymentProvider;
  title: string;
  description: string;
  badge?: string;
}> = [
  {
    id: "flutterwave",
    title: "Flutterwave",
    description: "Cards, bank transfer, USSD, and local payment options where available.",
    badge: "Recommended",
  },
  {
    id: "paystack",
    title: "Paystack",
    description: "Cards, bank transfer, USSD, and Nigerian payment options in hosted checkout.",
  },
];

function formatMoney(amountCents: number, currency: CheckoutCurrency) {
  const amount = amountCents / 100;
  if (currency === "NGN") {
    return `₦${amount.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (currency === "GBP") {
    return `£${amount.toLocaleString("en-GB", {
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
        amount: amountCents / 100,
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
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [provider, setProvider] = useState<CheckoutPaymentProvider>("flutterwave");
  const [processing, setProcessing] = useState(false);
  const [subscriptionPricing, setSubscriptionPricing] = useState(DEFAULT_SUBSCRIPTION_PRICING);

  const parsedIntent = useMemo(
    () => parseCheckoutIntent(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const display = parsedIntent.ok
    ? getCheckoutDisplay(parsedIntent.intent, subscriptionPricing)
    : null;

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
          provider,
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

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-56 flex-shrink-0 md:block">
          <Sidebar active="subscription" />
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-5">
            <Link
              href={display?.returnPath || "/dashboard/profile/subscription"}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f419a] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <h1 className="mt-3 text-2xl font-bold text-gray-900">Complete Payment</h1>
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
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h2 className="text-lg font-bold text-gray-900">Payment Method</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Choose how you want to complete this transaction.
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {providerCards.map((card) => {
                      const selected = provider === card.id;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => setProvider(card.id)}
                          className={`min-h-[140px] rounded-xl border p-4 text-left transition-colors ${
                            selected
                              ? "border-[#1f419a] bg-[#eef2ff] shadow-sm"
                              : "border-gray-200 bg-white hover:border-[#1f419a]/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#1f419a] shadow-sm">
                              <CreditCard className="h-5 w-5" />
                            </div>
                            {selected && <CheckCircle2 className="h-5 w-5 text-[#1f419a]" />}
                          </div>
                          <div className="mt-4 flex items-center gap-2">
                            <h3 className="text-base font-bold text-gray-900">{card.title}</h3>
                            {card.badge && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                {card.badge}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm leading-5 text-gray-500">
                            {card.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0" />
                    <p>
                      You will be redirected to the selected hosted checkout provider to
                      complete payment securely.
                    </p>
                  </div>
                </div>
              </section>

              <aside className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h2 className="text-lg font-bold text-gray-900">Order Summary</h2>
                  <div className="mt-4 space-y-3">
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
                        <span className="text-xl font-bold text-gray-900">
                          {display && formatMoney(display.amountCents, parsedIntent.intent.currency)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={startCheckout}
                    disabled={processing}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-60"
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

                <div className="rounded-xl border border-gray-200 bg-white p-4">
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
