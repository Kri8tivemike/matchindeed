"use client";

/**
 * SubscriptionPage — MatchIndeed
 *
 * Enhanced plan comparison & upgrade page with:
 * - Standard dashboard layout (no overlay)
 * - 4-column plan comparison cards with visual hierarchy
 * - Wallet-pay confirmation modal (replaces confirm())
 * - Global toast notifications
 * - Stripe checkout + admin pricing integration preserved
 */

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Crown,
  Star,
  Zap,
  X,
  Loader2,
  Wallet,
  ArrowRight,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import { supabase } from "@/lib/supabase";
import { getCurrentUserSafe } from "@/lib/auth-helpers";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type Currency = "NGN" | "USD" | "GBP";
type Pricing = { ngn: number; usd: number; gbp: number };

type SubscriptionTier = {
  id: string;
  name: string;
  pricing: Pricing;
  priceId: string;
  credits: number;
  calendarDays: number;
  customDates: number;
  features: string[];
  popular?: boolean;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  vipExtraCredits?: number;
  vipExtraChargePerCredit?: Pricing;
};

// ---------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------
const baseSubscriptionTiers: SubscriptionTier[] = [
  {
    id: "basic",
    name: "Basic",
    pricing: { ngn: 10000, usd: 7, gbp: 5.5 },
    priceId: "",
    credits: 5,
    calendarDays: 5,
    customDates: 0,
    icon: <Zap className="h-5 w-5" />,
    gradient: "from-blue-500 to-blue-600",
    iconBg: "bg-blue-100 text-blue-600",
    features: [
      "5 day calendar slot for outgoing meetings",
      "Free incoming requests from Standard, Premium & VIP",
      "No preferred location setting",
      "Group meeting time set by MatchIndeed",
      "No credit roll over",
      "Buy extra credits anytime",
    ],
  },
  {
    id: "standard",
    name: "Standard",
    pricing: { ngn: 31500, usd: 20, gbp: 16 },
    priceId: process.env.NEXT_PUBLIC_STRIPE_STANDARD_PRICE_ID || "",
    credits: 15,
    calendarDays: 15,
    customDates: 5,
    icon: <Star className="h-5 w-5" />,
    gradient: "from-purple-500 to-purple-600",
    iconBg: "bg-purple-100 text-purple-600",
    popular: true,
    features: [
      "15 day calendar slots",
      "Unlimited incoming requests",
      "5 private custom slots",
      "Preferred location setting",
      "Invite to private & group meetings",
      "No credit roll over",
      "Buy extra credits anytime",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    pricing: { ngn: 63000, usd: 43, gbp: 34 },
    priceId: process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID || "",
    credits: 30,
    calendarDays: 30,
    customDates: 30,
    icon: <Crown className="h-5 w-5" />,
    gradient: "from-amber-500 to-orange-500",
    iconBg: "bg-amber-100 text-amber-600",
    features: [
      "30 day calendar slots",
      "Unlimited incoming requests",
      "30 custom date slots",
      "+10 VIP contact credits/month",
      "Private 1-on-1 meetings",
      "Control group & private settings",
      "Preferred location setting",
      "Buy extra credits anytime",
    ],
    vipExtraCredits: 10,
    vipExtraChargePerCredit: { ngn: 5000, usd: 3.45, gbp: 2.75 },
  },
  {
    id: "vip",
    name: "VIP",
    pricing: { ngn: 1500000, usd: 1000, gbp: 800 },
    priceId: "",
    credits: 0,
    calendarDays: 0,
    customDates: 0,
    icon: <Crown className="h-5 w-5" />,
    gradient: "from-pink-500 to-rose-600",
    iconBg: "bg-pink-100 text-pink-600",
    features: [
      "Unlimited everything",
      "Full control over scheduling",
      "Custom meeting conditions",
      "Video recording & saved access",
      "Priority support",
      "Dedicated account manager",
    ],
  },
];

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
/** Detect user currency based on IP. Uses /api/geo; client-side fallback for Tailscale. */
async function detectCurrency(): Promise<Currency> {
  try {
    const res = await fetch("/api/geo");
    const data = await res.json();
    let c = (data.currency || "usd").toLowerCase();
    if (c === "usd" && !data.country_code) {
      try {
        const fb = await fetch("https://reallyfreegeoip.org/json/");
        if (fb.ok) {
          const d = await fb.json();
          const cc = d.country_code || d.countryCode;
          if (cc === "NG") return "NGN";
          if (cc === "GB" || cc === "UK") return "GBP";
        }
      } catch {
        /* ignore */
      }
    }
    if (c === "ngn") return "NGN";
    if (c === "gbp") return "GBP";
    return "USD";
  } catch {
    return "USD";
  }
}

function formatPrice(price: number, currency: Currency): string {
  if (currency === "NGN")
    return `₦${price.toLocaleString("en-NG")}`;
  if (currency === "GBP")
    return `£${price.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getPrice(tier: SubscriptionTier, currency: Currency): number {
  if (currency === "NGN") return tier.pricing.ngn;
  if (currency === "GBP") return tier.pricing.gbp;
  return tier.pricing.usd;
}

// ---------------------------------------------------------------
// Inner component (uses useSearchParams)
// ---------------------------------------------------------------
function SubscriptionContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [currentTier, setCurrentTier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [subscriptionTiers, setSubscriptionTiers] = useState(baseSubscriptionTiers);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  // Wallet-pay confirmation modal
  const [walletPayModal, setWalletPayModal] = useState<{
    isOpen: boolean;
    tier: SubscriptionTier | null;
    amountCents: number;
  }>({ isOpen: false, tier: null, amountCents: 0 });

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  useEffect(() => {
    detectCurrency().then(setCurrency).catch(() => setCurrency("USD"));

    // Admin pricing override
    fetch("/api/subscription-pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tiers) {
          setSubscriptionTiers(
            baseSubscriptionTiers.map((t) => {
              const adm = data.tiers.find((a: SubscriptionTier) => a.id === t.id);
              return adm ? { ...t, pricing: adm.pricing } : t;
            })
          );
        }
      })
      .catch(() => {});
  }, []);

  const fetchCurrentTier = async () => {
    try {
      const user = await getCurrentUserSafe();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: account } = await supabase
        .from("accounts")
        .select("tier")
        .eq("id", user.id)
        .single();
      if (account) setCurrentTier(account.tier || "basic");
    } catch {
      // Not logged in — fine
    } finally {
      setLoading(false);
    }
  };

  const fetchWalletBalance = async () => {
    try {
      const user = await getCurrentUserSafe();
      if (!user) return;
      const { data } = await supabase
        .from("wallets")
        .select("balance_cents")
        .eq("user_id", user.id)
        .single();
      setWalletBalance(data?.balance_cents || 0);
    } catch {
      // Non-critical
    }
  };

  useEffect(() => {
    fetchCurrentTier();
    fetchWalletBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stripe redirect handling
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (searchParams.get("success") === "true" && sessionId) {
      toast.success("Payment successful! Activating your subscription...");
      verifyAndProcessSubscription(sessionId);
      fetchCurrentTier();
      const t = setTimeout(() => {
        window.location.href = "/dashboard/profile/my-account";
      }, 3000);
      return () => clearTimeout(t);
    }
    if (searchParams.get("canceled") === "true") {
      toast.warning("Payment was canceled. You can try again anytime.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const verifyAndProcessSubscription = async (sessionId: string) => {
    try {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch("/api/verify-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && !data.alreadyProcessed) {
          await fetchCurrentTier();
        }
      }
    } catch {
      // Webhook will eventually handle it
    }
  };

  // ---------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------
  const handleSubscribe = async (tier: SubscriptionTier, useWallet = false) => {
    if (tier.id === "vip") {
      window.location.href = "mailto:support@matchindeed.com?subject=VIP Subscription Inquiry";
      return;
    }

    try {
      setProcessing(tier.id);
      const user = await getCurrentUserSafe();
      if (!user) {
        toast.error("Please log in to subscribe.");
        setProcessing(null);
        return;
      }

      const price = getPrice(tier, currency);
      const amountCents = Math.round(price * 100);

      // If user chose wallet pay
      if (useWallet) {
        const res = await fetch("/api/use-wallet-balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "subscription", amountCents, tier: tier.id }),
        });
        if (res.ok) {
          toast.success(`Subscribed to ${tier.name} plan from wallet!`);
          fetchCurrentTier();
          setTimeout(() => {
            window.location.href = "/dashboard/profile/my-account";
          }, 2000);
          return;
        }
        if (res.status !== 402) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          toast.error(err.error || "Wallet payment failed.");
          return;
        }
        // 402 = insufficient, fall through to Stripe
      }

      // Check if wallet can cover it (show modal instead of confirm())
      if (!useWallet) {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("balance_cents")
          .eq("user_id", user.id)
          .single();
        const wb = wallet?.balance_cents || 0;
        if (wb >= amountCents) {
          setWalletPayModal({ isOpen: true, tier, amountCents });
          setProcessing(null);
          return;
        }
      }

      // Stripe checkout
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: tier.priceId || undefined,
          tier: tier.id,
          userId: user.id,
          currency,
          amount: price,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Checkout failed");
      }
      const { url, sessionId } = await res.json();
      if (url) window.location.href = url;
      else if (sessionId) window.location.href = `https://checkout.stripe.com/c/pay/${sessionId}`;
      else throw new Error("No checkout URL");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start checkout.";
      toast.error(msg);
    } finally {
      setProcessing(null);
    }
  };

  // ---------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="mt-3 text-sm text-gray-500">Loading plans...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/dashboard">
            <Image src="/matchindeed.svg" alt="MatchIndeed" width={130} height={34} style={{ width: "auto", height: "auto" }} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 flex-shrink-0">
          <Sidebar active="subscription" />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 space-y-6">
          {/* Page header */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                <Sparkles className="h-7 w-7 text-[#1f419a]" />
                Subscription Plans
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Choose the plan that fits your dating journey
              </p>
            </div>
            <div className="flex items-center gap-3">
              {currentTier && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-semibold text-[#1f419a]">
                  <Check className="h-3 w-3" />
                  Current: {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
                </span>
              )}
              <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-medium text-gray-500">
                {currency === "NGN" ? "₦ NGN" : currency === "GBP" ? "£ GBP" : "$ USD"}
              </span>
            </div>
          </div>

          {/* ---- Plan cards ---- */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {subscriptionTiers.map((tier) => {
              const isCurrent = currentTier === tier.id;
              const isProc = processing === tier.id;
              const price = getPrice(tier, currency);
              const priceCents = Math.round(price * 100);
              const canWallet = walletBalance !== null && walletBalance >= priceCents;

              return (
                <div
                  key={tier.id}
                  className={`relative flex flex-col overflow-hidden rounded-xl border-2 bg-white transition-all ${
                    tier.popular
                      ? "border-[#1f419a] shadow-lg shadow-[#1f419a]/10"
                      : isCurrent
                        ? "border-[#1f419a]/50"
                        : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {/* Popular badge */}
                  {tier.popular && (
                    <div className="bg-[#1f419a] py-1 text-center text-[10px] font-bold uppercase tracking-widest text-white">
                      Most Popular
                    </div>
                  )}

                  {/* Current badge */}
                  {isCurrent && !tier.popular && (
                    <div className="bg-green-500 py-1 text-center text-[10px] font-bold uppercase tracking-widest text-white">
                      Current Plan
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-5">
                    {/* Icon + name */}
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${tier.iconBg}`}
                      >
                        {tier.icon}
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{tier.name}</h3>
                    </div>

                    {/* Price */}
                    <div className="mt-4">
                      {tier.id === "vip" ? (
                        <p className="text-2xl font-bold text-gray-900">Custom</p>
                      ) : (
                        <>
                          <p className="text-2xl font-bold text-gray-900">
                            {formatPrice(price, currency)}
                          </p>
                          <p className="text-xs text-gray-400">per month</p>
                        </>
                      )}
                    </div>

                    {/* Key stats */}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {tier.credits > 0 && (
                        <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-center">
                          <p className="text-lg font-bold text-gray-900">{tier.credits}</p>
                          <p className="text-[10px] text-gray-400">Credits</p>
                        </div>
                      )}
                      {tier.credits === 0 && tier.id === "vip" && (
                        <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-center">
                          <p className="text-sm font-bold text-gray-900">∞</p>
                          <p className="text-[10px] text-gray-400">Credits</p>
                        </div>
                      )}
                      {tier.calendarDays > 0 && (
                        <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-center">
                          <p className="text-lg font-bold text-gray-900">{tier.calendarDays}</p>
                          <p className="text-[10px] text-gray-400">Cal Days</p>
                        </div>
                      )}
                      {tier.calendarDays === 0 && tier.id === "vip" && (
                        <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-center">
                          <p className="text-sm font-bold text-gray-900">∞</p>
                          <p className="text-[10px] text-gray-400">Cal Days</p>
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="mt-4 flex-1 space-y-1.5">
                      {tier.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-500">
                          <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-[#1f419a]" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    {/* VIP extra */}
                    {tier.vipExtraCredits && tier.vipExtraChargePerCredit && (
                      <div className="mt-3 rounded-lg bg-amber-50 p-2">
                        <p className="text-[10px] font-semibold text-amber-700">
                          +{tier.vipExtraCredits} VIP contact credits @{" "}
                          {formatPrice(
                            currency === "NGN"
                              ? tier.vipExtraChargePerCredit.ngn
                              : currency === "GBP"
                                ? tier.vipExtraChargePerCredit.gbp
                                : tier.vipExtraChargePerCredit.usd,
                            currency
                          )}
                          /credit
                        </p>
                      </div>
                    )}

                    {/* Wallet hint */}
                    {canWallet && !isCurrent && tier.id !== "vip" && (
                      <div className="mt-2 rounded-lg bg-green-50 p-1.5 text-center">
                        <p className="text-[10px] text-green-700">
                          Wallet balance covers this plan
                        </p>
                      </div>
                    )}

                    {/* Subscribe button */}
                    <button
                      onClick={() => handleSubscribe(tier)}
                      disabled={isCurrent || !!isProc}
                      className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                        isCurrent
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : tier.popular
                            ? "bg-gradient-to-r from-[#1f419a] to-[#2a44a3] text-white shadow-md hover:shadow-lg"
                            : "bg-gray-900 text-white hover:bg-gray-800"
                      }`}
                    >
                      {isProc ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : isCurrent ? (
                        "Current Plan"
                      ) : tier.id === "vip" ? (
                        <>
                          Contact Us <ExternalLink className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          Subscribe <ArrowRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ---- Help banner ---- */}
          <div className="overflow-hidden rounded-xl bg-gradient-to-r from-[#1f419a] to-[#4463cf] p-5 text-white">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold">Need help choosing?</h3>
                <p className="mt-0.5 text-sm text-white/80">
                  Our team can help you find the perfect plan.
                </p>
              </div>
              <a
                href="mailto:support@matchindeed.com"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-[#1f419a] transition-colors hover:bg-gray-50"
              >
                Contact Support
              </a>
            </div>
          </div>
        </main>
      </div>

      {/* ---- Wallet pay confirmation modal ---- */}
      {walletPayModal.isOpen && walletPayModal.tier && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
                  <Wallet className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Pay from Wallet?</h3>
                  <p className="text-xs text-gray-500">
                    You have sufficient wallet balance.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Wallet Balance</span>
                  <span className="font-semibold text-gray-900">
                    {formatPrice((walletBalance || 0) / 100, currency)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-gray-500">{walletPayModal.tier.name} Plan</span>
                  <span className="font-semibold text-[#1f419a]">
                    -{formatPrice(getPrice(walletPayModal.tier, currency), currency)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 text-center">
                The subscription amount will be deducted from your wallet.
              </p>
            </div>

            <div className="flex gap-3 border-t border-gray-100 p-4">
              <button
                onClick={() => {
                  setWalletPayModal({ isOpen: false, tier: null, amountCents: 0 });
                  // Fall through to Stripe
                  if (walletPayModal.tier) {
                    handleSubscribe(walletPayModal.tier, false);
                  }
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Use Card Instead
              </button>
              <button
                onClick={() => {
                  const t = walletPayModal.tier;
                  setWalletPayModal({ isOpen: false, tier: null, amountCents: 0 });
                  if (t) handleSubscribe(t, true);
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-green-600"
              >
                <Wallet className="h-4 w-4" />
                Pay from Wallet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Page wrapper
// ---------------------------------------------------------------
export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
        </div>
      }
    >
      <SubscriptionContent />
    </Suspense>
  );
}
