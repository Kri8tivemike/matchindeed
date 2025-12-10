"use client";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, EyeOff, Mail, Compass, Heart, Search as SearchIcon, MessageCircle, Check, Crown, Star, Zap, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { supabase } from "@/lib/supabase";
// Stripe is now handled server-side, no need for client-side Stripe.js

type Currency = "NGN" | "USD" | "GBP";

type Pricing = {
  ngn: number;
  usd: number;
  gbp: number;
};

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
  color: string;
  // Premium tier specific
  vipExtraCredits?: number;
  vipExtraChargePerCredit?: Pricing;
};

// Base pricing configuration (can be overridden by admin via API)
const baseSubscriptionTiers: SubscriptionTier[] = [
  {
    id: "basic",
    name: "Basic",
    pricing: {
      ngn: 10000, // 10,000 Naira monthly
      usd: 7, // $7 monthly
      gbp: 5.5, // Approx £5.5 monthly
    },
    priceId: "",
    credits: 5,
    calendarDays: 5,
    customDates: 0,
    icon: <Zap className="h-6 w-6" />,
    color: "from-blue-500 to-blue-600",
    features: [
      "5 credits per month",
      "5 day calendar slot for outgoing meeting (basic account holders only)",
      "Free incoming request from standard, premium and VIP account holders",
      "Only 5 days calendar slot allowed for outgoing per month",
      "NO preferred location setting when accepting invitations",
      "Group meeting time and date determined by Matchindeed",
      "No credit roll over",
      "Can buy more credits if subscription finished (still charged monthly)",
      "Limited access if credits finished (no calendar schedule)",
    ],
  },
  {
    id: "standard",
    name: "Standard",
    pricing: {
      ngn: 31500, // 31,500 Naira monthly
      usd: 20, // $20 monthly
      gbp: 16, // Approx £16 monthly
    },
    priceId: process.env.NEXT_PUBLIC_STRIPE_STANDARD_PRICE_ID || "",
    credits: 15,
    calendarDays: 15,
    customDates: 5,
    icon: <Star className="h-6 w-6" />,
    color: "from-purple-500 to-purple-600",
    popular: true,
    features: [
      "15 credits per month",
      "15 day calendar slot for outgoing meeting (standard and basic account holders only)",
      "Unlimited incoming request from standard, basic, premium and VIP",
      "5 Private Custom slot",
      "Request to Premium and VIP - NO",
      "Preferred location setting for calendar date setup",
      "NO meeting cancellation/reschedule",
      "No multi-booking day calendar",
      "Invitation allowed for private meeting (Standard and basic account holders)",
      "Invitation allowed for Group meeting (Standard and basic)",
      "No credit roll over",
      "Can buy more credits if subscription finished (still charged monthly)",
      "Limited access if credits finished (no calendar schedule)",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    pricing: {
      ngn: 63000, // 63,000 Naira monthly
      usd: 43, // $43 monthly
      gbp: 34, // Approx £34 monthly
    },
    priceId: process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID || "",
    credits: 30,
    calendarDays: 30,
    customDates: 30,
    icon: <Crown className="h-6 w-6" />,
    color: "from-yellow-500 to-orange-500",
    features: [
      "30 credits per month",
      "30 day calendar slot for outgoing meeting (basic, standard and premium account holders only)",
      "Unlimited incoming request from standard, basic, premium and VIP",
      "For Extra credit to contact VIP: 10 credits per month",
      "VIP Extra Charge: 5,000 Naira / $3.45 / £2.75 per credit",
      "No credit roll over",
      "No multi-booking day calendar",
      "No refund",
      "Private meeting (one to one)",
      "Can determine on profile page if accepting group dating meeting",
      "Can determine on profile page if accepting private dating meeting (from basic, standard or premium)",
      "Preferred location setting when accepting invitations",
      "Outgoing video request to VIP: extra charge (10 times per month)",
      "Can buy more credits if subscription finished (still charged monthly)",
    ],
    vipExtraCredits: 10,
    vipExtraChargePerCredit: {
      ngn: 5000,
      usd: 3.45,
      gbp: 2.75,
    },
  },
  {
    id: "vip",
    name: "VIP",
    pricing: {
      ngn: 1500000, // 1,500,000 Naira monthly
      usd: 1000, // $1,000 monthly
      gbp: 800, // Approx £800 monthly
    },
    priceId: "",
    credits: 0, // Unlimited
    calendarDays: 0, // Unlimited
    customDates: 0, // Unlimited
    icon: <Crown className="h-6 w-6" />,
    color: "from-pink-500 to-red-500",
    features: [
      "Unlimited Services",
      "Full and Total Control",
      "Total control over your desired time",
      "Custom video dating meeting scheduling",
      "Define your appointment attribution conditions",
      "Video recording and saved access",
      "Priority support",
      "Contact us for custom pricing",
    ],
  },
];

/**
 * Detects user's currency based on IP location
 * Returns NGN for Nigeria, GBP for UK, USD for others
 */
async function detectCurrency(): Promise<Currency> {
  try {
    // Use a free IP geolocation service
    const response = await fetch("https://ipapi.co/json/");
    const data = await response.json();
    
    const countryCode = data.country_code?.toUpperCase();
    
    if (countryCode === "NG") {
      return "NGN";
    } else if (countryCode === "GB") {
      return "GBP";
    } else {
      return "USD";
    }
  } catch (error) {
    console.error("Error detecting currency:", error);
    // Default to USD if detection fails
    return "USD";
  }
}

/**
 * Formats price based on currency
 */
function formatPrice(price: number, currency: Currency): string {
  if (currency === "NGN") {
    return `₦${price.toLocaleString("en-NG")}`;
  } else if (currency === "GBP") {
    return `£${price.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/**
 * Gets the price for a tier based on currency
 */
function getPrice(tier: SubscriptionTier, currency: Currency): number {
  if (currency === "NGN") return tier.pricing.ngn;
  if (currency === "GBP") return tier.pricing.gbp;
  return tier.pricing.usd;
}

function SubscriptionContent() {
  const searchParams = useSearchParams();
  const [currentTier, setCurrentTier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [subscriptionTiers, setSubscriptionTiers] = useState<SubscriptionTier[]>(baseSubscriptionTiers);

  // Detect currency on mount
  useEffect(() => {
    detectCurrency().then(setCurrency);
    
    // Fetch admin-configured pricing if available
    fetch("/api/subscription-pricing")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.tiers) {
          // Merge admin pricing with base tiers
          const updatedTiers = baseSubscriptionTiers.map((tier) => {
            const adminTier = data.tiers.find((t: SubscriptionTier) => t.id === tier.id);
            if (adminTier) {
              return { ...tier, pricing: adminTier.pricing };
            }
            return tier;
          });
          setSubscriptionTiers(updatedTiers);
        }
      })
      .catch((error) => {
        console.error("Error fetching admin pricing:", error);
        // Use base pricing if API fails
      });
  }, []);

  const fetchCurrentTier = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: account } = await supabase
        .from("accounts")
        .select("tier")
        .eq("id", user.id)
        .single();

      if (account) {
        setCurrentTier(account.tier || "basic");
      }
    } catch (error) {
      console.error("Error fetching tier:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentTier();
  }, []);

  useEffect(() => {
    // Check for success/cancel query params
    if (searchParams.get("success") === "true") {
      setSuccess(true);
      // Refresh tier after successful payment
      fetchCurrentTier();
    }
    if (searchParams.get("canceled") === "true") {
      setCanceled(true);
    }
  }, [searchParams]);

  const handleSubscribe = async (tier: SubscriptionTier) => {
    if (tier.id === "vip") {
      // Redirect to contact form or email
      window.location.href = "mailto:support@matchindeed.com?subject=VIP Subscription Inquiry";
      return;
    }

    try {
      setProcessing(tier.id);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Create checkout session with currency information
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          priceId: tier.priceId || undefined,
          tier: tier.id,
          userId: user.id,
          currency: currency,
          amount: getPrice(tier, currency),
        }),
      });

      const { sessionId, url, error } = await response.json();

      if (error) {
        throw new Error(error);
      }

      // Redirect to Stripe Checkout using the session URL
      if (url) {
        window.location.href = url;
      } else if (sessionId) {
        // Fallback: construct URL manually if not provided
        window.location.href = `https://checkout.stripe.com/c/pay/${sessionId}`;
      } else {
        throw new Error("No checkout URL available");
      }
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      alert(error.message || "Failed to start checkout. Please try again.");
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <div className="text-gray-600">Loading subscription plans...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative h-full w-full overflow-y-auto bg-gradient-to-b from-[#eaf0ff] to-[#f7f9ff]">
        {/* Close button */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/50 bg-white/90 backdrop-blur-md px-6 py-4">
          <div className="flex items-center gap-3">
            <Image src="/matchindeed.svg" alt="Matchindeed" width={140} height={36} />
          </div>
          <Link
            href="/dashboard/profile/my-account"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-gray-600 hover:bg-white hover:text-gray-900 transition-colors"
          >
            <X className="h-6 w-6" />
          </Link>
        </div>

        <main className="mx-auto max-w-7xl px-6 py-8">
          <section className="space-y-6">
          {success && (
            <div className="rounded-2xl bg-green-50 border-2 border-green-200 p-6">
              <div className="flex items-center gap-3">
                <Check className="h-6 w-6 text-green-600" />
                <div>
                  <h3 className="font-semibold text-green-900">Payment Successful!</h3>
                  <p className="text-sm text-green-700">Your subscription has been activated. Redirecting...</p>
                </div>
              </div>
            </div>
          )}

          {canceled && (
            <div className="rounded-2xl bg-yellow-50 border-2 border-yellow-200 p-6">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-full bg-yellow-600 flex items-center justify-center">
                  <span className="text-white text-xs">!</span>
                </div>
                <div>
                  <h3 className="font-semibold text-yellow-900">Payment Canceled</h3>
                  <p className="text-sm text-yellow-700">Your payment was canceled. You can try again anytime.</p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-3xl bg-white p-6 shadow ring-1 ring-black/5">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900">Choose Your Subscription Plan</h1>
              <p className="mt-2 text-gray-600">Select the plan that best fits your dating journey</p>
              {currentTier && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#eef2ff] px-4 py-2 text-sm text-[#1f419a]">
                  <span>Current plan: <strong className="capitalize">{currentTier}</strong></span>
                </div>
              )}
              <div className="mt-2 text-xs text-gray-500">
                Prices displayed in {currency === "NGN" ? "Naira (₦)" : currency === "GBP" ? "British Pounds (£)" : "US Dollars ($)"}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {subscriptionTiers.map((tier) => {
                const isCurrent = currentTier === tier.id;
                const isProcessing = processing === tier.id;
                const price = getPrice(tier, currency);
                const formattedPrice = formatPrice(price, currency);

                return (
                  <div
                    key={tier.id}
                    className={`relative rounded-2xl border-2 p-6 transition-all ${
                      tier.popular
                        ? "border-[#1f419a] bg-gradient-to-br from-[#eef2ff] to-white shadow-lg scale-105"
                        : isCurrent
                        ? "border-[#1f419a] bg-[#eef2ff]"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    {tier.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#1f419a] px-3 py-1 text-xs font-semibold text-white">
                        Most Popular
                      </div>
                    )}

                    <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r ${tier.color} text-white`}>
                      {tier.icon}
                    </div>

                    <h3 className="text-xl font-bold text-gray-900">{tier.name}</h3>

                    <div className="my-4">
                      {tier.id === "vip" ? (
                        <div className="text-2xl font-bold text-gray-900">Custom</div>
                      ) : (
                        <>
                          <div className="text-2xl font-bold text-gray-900">{formattedPrice}</div>
                          <div className="text-sm text-gray-600">per month</div>
                        </>
                      )}
                    </div>

                    <div className="mb-4 space-y-2 text-sm text-gray-600">
                      {tier.credits > 0 && (
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-[#1f419a]" />
                          <span>{tier.credits} credits/month</span>
                        </div>
                      )}
                      {tier.calendarDays > 0 && (
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-[#1f419a]" />
                          <span>{tier.calendarDays} calendar days</span>
                        </div>
                      )}
                      {tier.customDates > 0 && (
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-[#1f419a]" />
                          <span>{tier.customDates} custom dates</span>
                        </div>
                      )}
                    </div>

                    <ul className="mb-6 space-y-2 text-xs text-gray-600 max-h-64 overflow-y-auto">
                      {tier.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="h-3 w-3 mt-0.5 text-[#1f419a] flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleSubscribe(tier)}
                      disabled={isCurrent || isProcessing}
                      className={`w-full rounded-full px-4 py-3 text-sm font-semibold transition-colors ${
                        isCurrent
                          ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                          : tier.popular
                          ? "bg-[#1f419a] text-white hover:bg-[#17357b]"
                          : "bg-gray-900 text-white hover:bg-gray-800"
                      }`}
                    >
                      {isProcessing
                        ? "Processing..."
                        : isCurrent
                        ? "Current Plan"
                        : tier.id === "vip"
                        ? "Contact Us"
                        : "Subscribe Now"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 rounded-2xl bg-gradient-to-r from-[#1f419a] to-[#4463cf] p-6 text-white">
              <h3 className="text-xl font-bold mb-2">Need help choosing?</h3>
              <p className="text-white/90 mb-4">Our team is here to help you find the perfect plan for your dating journey.</p>
              <a
                href="mailto:support@matchindeed.com"
                className="inline-flex items-center gap-2 rounded-full bg-white text-[#1f419a] px-6 py-2 font-semibold hover:bg-gray-50"
              >
                Contact Support
              </a>
            </div>
          </div>
        </section>
        </main>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <div className="text-gray-600">Loading subscription plans...</div>
        </div>
      </div>
    }>
      <SubscriptionContent />
    </Suspense>
  );
}
