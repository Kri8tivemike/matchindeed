"use client";

/**
 * WalletPage — MatchIndeed
 *
 * Enhanced wallet & credits management page with:
 * - Standard dashboard layout (header, sidebar)
 * - Wallet balance card with gradient
 * - Credit allocation & usage visualisation
 * - Transaction history with type-based filtering
 * - Top-up and credit-purchase modals
 * - Global toast notifications (no inline banners)
 * - Stripe checkout integration preserved
 */

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Wallet,
  Plus,
  History,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Loader2,
  RefreshCw,
  CreditCard,
  Coins,
  ArrowRight,
  Filter,
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

type WalletData = {
  balance_cents: number;
  credits: { total: number; used: number; rollover: number } | null;
};

type SubscriptionInfo = {
  tier: string;
  status: string | null;
  expires_at: string | null;
  membership_status: string | null;
};

type CreditAllocation = {
  monthly: number;
  vipExtra?: number;
  pricePerCredit: { ngn: number; usd: number; gbp: number };
};

type Transaction = {
  id: string;
  type: string;
  amount_cents: number;
  balance_before_cents: number;
  balance_after_cents: number;
  description: string | null;
  created_at: string;
  reference_id: string | null;
  admin_id: string | null;
};

type TxFilter = "all" | "credit" | "debit";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Detect user currency based on IP (Nigeria → NGN, UK → GBP, else USD). Uses /api/geo; client-side fallback for Tailscale. */
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

/** Format cents → display string */
function formatPrice(cents: number, currency: Currency): string {
  const amount = cents / 100;
  if (currency === "NGN")
    return `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === "GBP")
    return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Currency symbol */
function currencySymbol(c: Currency): string {
  return c === "NGN" ? "₦" : c === "GBP" ? "£" : "$";
}

/** Get credit allocation for a tier */
function getCreditAllocation(tier: string): CreditAllocation {
  switch (tier?.toLowerCase()) {
    case "basic":
      return { monthly: 5, pricePerCredit: { ngn: 2100, usd: 1.45, gbp: 1.15 } };
    case "standard":
      return { monthly: 15, pricePerCredit: { ngn: 2100, usd: 1.45, gbp: 1.15 } };
    case "premium":
      return { monthly: 30, vipExtra: 10, pricePerCredit: { ngn: 2100, usd: 1.45, gbp: 1.15 } };
    case "vip":
      return { monthly: Infinity, pricePerCredit: { ngn: 0, usd: 0, gbp: 0 } };
    default:
      return { monthly: 0, pricePerCredit: { ngn: 2100, usd: 1.45, gbp: 1.15 } };
  }
}

// ---------------------------------------------------------------
// Inner component (uses useSearchParams)
// ---------------------------------------------------------------
function WalletContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [topUpAmount, setTopUpAmount] = useState<number>(0);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showCreditPurchaseModal, setShowCreditPurchaseModal] = useState(false);
  const [creditPurchaseAmount, setCreditPurchaseAmount] = useState<number>(0);
  const [processing, setProcessing] = useState(false);
  const [txFilter, setTxFilter] = useState<TxFilter>("all");

  const processedSessionsRef = useRef<Set<string>>(new Set());

  // Detect currency on mount
  useEffect(() => {
    detectCurrency().then(setCurrency).catch(() => setCurrency("USD"));
  }, []);

  // Check for success/cancel query params from Stripe redirect
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (searchParams.get("success") === "true" && sessionId) {
      toast.success("Payment successful! Updating your wallet...");
      fetchWalletData().then(() => verifyAndProcessPayment(sessionId));
    }
    if (searchParams.get("canceled") === "true") {
      toast.warning("Payment was canceled.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ---------------------------------------------------------------
  // Verify payment after Stripe redirect
  // ---------------------------------------------------------------
  const verifyAndProcessPayment = async (sessionId: string) => {
    try {
      const user = await getCurrentUserSafe();
      if (!user) return;

      // Already processed?
      const { data: existing } = await supabase
        .from("wallet_transactions")
        .select("id")
        .eq("reference_id", sessionId)
        .maybeSingle();
      if (existing) {
        await fetchWalletData();
        return;
      }

      if (processedSessionsRef.current.has(sessionId)) {
        await new Promise((r) => setTimeout(r, 3000));
        const { data: check } = await supabase
          .from("wallet_transactions")
          .select("id")
          .eq("reference_id", sessionId)
          .maybeSingle();
        if (check) {
          await fetchWalletData();
          return;
        }
      }

      processedSessionsRef.current.add(sessionId);
      await new Promise((r) => setTimeout(r, 2000));

      const response = await fetch(`/api/verify-payment?sessionId=${sessionId}`);
      if (!response.ok) return;
      const data = await response.json();

      // Wallet top-up
      if (data.type === "wallet_topup" && data.amountCents > 0 && data.paid) {
        const addRes = await fetch("/api/add-credits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            amountCents: data.amountCents,
            sessionId,
            type: "wallet_topup",
          }),
        });
        if (addRes.ok) {
          const result = await addRes.json();
          if (!result.alreadyProcessed && (result.balanceAdded > 0 || result.success)) {
            toast.success("Wallet topped up successfully!");
          }
          await fetchWalletData();
        } else {
          toast.error("Failed to add wallet balance. Please contact support.");
          processedSessionsRef.current.delete(sessionId);
        }
      }

      // Credit purchase
      if (data.type === "credit_purchase" && data.credits > 0 && data.paid) {
        const addRes = await fetch("/api/add-credits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            credits: data.credits,
            sessionId,
            type: "credit_purchase",
          }),
        });
        if (addRes.ok) {
          const result = await addRes.json();
          if (!result.alreadyProcessed && (result.creditsAdded > 0 || result.success)) {
            toast.success(`${result.creditsAdded || data.credits} credits added!`);
          }
          await fetchWalletData();
        } else {
          toast.error("Failed to add credits. Please contact support.");
          processedSessionsRef.current.delete(sessionId);
        }
      }
    } catch {
      toast.error("Failed to verify payment. Please refresh.");
    } finally {
      const { data: finalCheck } = await supabase
        .from("wallet_transactions")
        .select("id")
        .eq("reference_id", sessionId)
        .maybeSingle();
      if (!finalCheck) processedSessionsRef.current.delete(sessionId);
    }
  };

  // ---------------------------------------------------------------
  // Fetch wallet data
  // ---------------------------------------------------------------
  const fetchWalletData = async () => {
    try {
      setRefreshing(true);
      const user = await getCurrentUserSafe();
      if (!user) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Wallet balance
      let { data: wallet, error: walletError } = await supabase
        .from("wallets")
        .select("balance_cents")
        .eq("user_id", user.id)
        .single();

      if (walletError?.code === "PGRST116") {
        await supabase.from("wallets").insert({ user_id: user.id, balance_cents: 0 });
        const { data: newW } = await supabase
          .from("wallets")
          .select("balance_cents")
          .eq("user_id", user.id)
          .single();
        wallet = newW;
      }

      // Fix negative balance
      if (wallet && wallet.balance_cents < 0) {
        await supabase.from("wallets").update({ balance_cents: 0 }).eq("user_id", user.id);
        wallet.balance_cents = 0;
      }

      // Credits
      let { data: credits, error: creditsError } = await supabase
        .from("credits")
        .select("total, used, rollover")
        .eq("user_id", user.id)
        .single();

      if (creditsError?.code === "PGRST116") {
        await supabase.from("credits").insert({ user_id: user.id, total: 0, used: 0, rollover: 0 });
        const { data: newC } = await supabase
          .from("credits")
          .select("total, used, rollover")
          .eq("user_id", user.id)
          .single();
        credits = newC;
      }

      // Subscription info
      const { data: account } = await supabase.from("accounts").select("tier").eq("id", user.id).single();
      const { data: membership } = await supabase
        .from("memberships")
        .select("tier, status, expires_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setSubscriptionInfo({
        tier: account?.tier || "basic",
        status: membership?.status || null,
        expires_at: membership?.expires_at || null,
        membership_status: membership?.status || null,
      });

      setWalletData({
        balance_cents: wallet?.balance_cents ?? 0,
        credits: credits
          ? { total: credits.total || 0, used: credits.used || 0, rollover: credits.rollover || 0 }
          : { total: 0, used: 0, rollover: 0 },
      });

      // Transactions
      const { data: txData } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setTransactions(txData || []);
    } catch (err) {
      console.error("Error fetching wallet data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWalletData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------
  // Purchase credits
  // ---------------------------------------------------------------
  const handlePurchaseCredits = async () => {
    if (creditPurchaseAmount <= 0) {
      toast.warning("Please enter a valid number of credits.");
      return;
    }
    try {
      setProcessing(true);
      const user = await getCurrentUserSafe();
      if (!user) {
        toast.error("Please log in to purchase credits.");
        return;
      }

      const allocation = getCreditAllocation(subscriptionInfo?.tier || "basic");
      const pricePerCredit =
        allocation.pricePerCredit[currency.toLowerCase() as keyof typeof allocation.pricePerCredit];
      const totalAmount = creditPurchaseAmount * pricePerCredit;
      const amountCents = Math.round(totalAmount * 100);

      // Try wallet balance first
      if (walletData && walletData.balance_cents >= amountCents) {
        const res = await fetch("/api/use-wallet-balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "credit_purchase", amountCents, credits: creditPurchaseAmount }),
        });
        if (res.ok) {
          toast.success(`${creditPurchaseAmount} credits purchased from wallet!`);
          setShowCreditPurchaseModal(false);
          setCreditPurchaseAmount(0);
          await fetchWalletData();
          return;
        }
        if (res.status !== 402) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || "Failed to process wallet payment");
        }
      }

      // Stripe fallback
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          currency,
          amount: totalAmount,
          amountCents,
          type: "credit_purchase",
          credits: creditPurchaseAmount,
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
      setProcessing(false);
    }
  };

  // ---------------------------------------------------------------
  // Top-up wallet
  // ---------------------------------------------------------------
  const handleTopUp = async () => {
    if (topUpAmount <= 0) {
      toast.warning("Please enter a valid amount.");
      return;
    }
    try {
      setProcessing(true);
      const user = await getCurrentUserSafe();
      if (!user) {
        toast.error("Please log in to add funds.");
        return;
      }
      const amountCents = Math.round(topUpAmount * 100);
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, currency, amount: topUpAmount, amountCents, type: "wallet_topup" }),
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
      setProcessing(false);
    }
  };

  // ---------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------
  const balance = walletData?.balance_cents || 0;
  const availableCredits = walletData?.credits
    ? walletData.credits.total - walletData.credits.used + walletData.credits.rollover
    : 0;

  const isActive = () => {
    if (!subscriptionInfo) return false;
    if (subscriptionInfo.tier === "vip") return true;
    const s = subscriptionInfo.membership_status || subscriptionInfo.status;
    if (s === "active") {
      return subscriptionInfo.expires_at ? new Date(subscriptionInfo.expires_at) > new Date() : true;
    }
    return false;
  };

  const filteredTx = transactions.filter((t) => {
    if (txFilter === "all") return true;
    if (txFilter === "credit") return t.amount_cents > 0;
    return t.amount_cents < 0;
  });

  const txIcon = (type: string) => {
    const lower = type.toLowerCase();
    if (["credit", "topup", "refund", "wallet_topup", "credit_purchase"].includes(lower))
      return { Icon: ArrowDownLeft, cls: "text-green-600 bg-green-50" };
    if (["debit", "payment", "charge", "meeting_charge", "cancellation_fee"].includes(lower))
      return { Icon: ArrowUpRight, cls: "text-red-600 bg-red-50" };
    return { Icon: History, cls: "text-gray-600 bg-gray-50" };
  };

  // ---------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="mt-3 text-sm text-gray-500">Loading wallet...</p>
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
          <Sidebar active="wallet" />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 space-y-5">
          {/* Page header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                <Wallet className="h-7 w-7 text-[#1f419a]" />
                My Wallet
              </h1>
              <p className="mt-1 text-sm text-gray-500">Manage your balance and credits</p>
            </div>
            <button
              onClick={() => {
                setRefreshing(true);
                fetchWalletData();
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* ---- Balance + Credits row ---- */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Balance card */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#1f419a] to-[#4463cf] p-5 text-white shadow-lg">
              <div className="relative z-10">
                <p className="text-xs font-medium text-white/70 uppercase tracking-wider">
                  Wallet Balance
                </p>
                <h2 className="mt-1 text-3xl font-bold tracking-tight">
                  {formatPrice(balance, currency)}
                </h2>
                <p className="mt-2 text-[11px] text-white/60">
                  {currency === "NGN" ? "Nigerian Naira" : currency === "GBP" ? "British Pounds" : "US Dollars"}
                </p>
              </div>
              {/* Decorative circle */}
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
              <div className="absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-white/5" />
            </div>

            {/* Credits card */}
            <div className="relative overflow-hidden rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Available Credits
                  </p>
                  <h2 className="mt-1 text-3xl font-bold text-[#1f419a]">{availableCredits}</h2>
                  {walletData?.credits && walletData.credits.rollover > 0 && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      Includes {walletData.credits.rollover} rollover
                    </p>
                  )}
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef2ff]">
                  <Coins className="h-6 w-6 text-[#1f419a]" />
                </div>
              </div>
              {/* Usage bar */}
              {subscriptionInfo && getCreditAllocation(subscriptionInfo.tier).monthly !== Infinity && walletData?.credits && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>{walletData.credits.used} used</span>
                    <span>{getCreditAllocation(subscriptionInfo.tier).monthly}/mo</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100">
                    <div
                      className="h-1.5 rounded-full bg-[#1f419a] transition-all"
                      style={{
                        width: `${Math.min(
                          (walletData.credits.used / getCreditAllocation(subscriptionInfo.tier).monthly) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Low / no credits warning */}
          {availableCredits === 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
              <X className="h-5 w-5 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">
                <strong>No credits.</strong> Purchase more to continue using video dating features.
              </p>
            </div>
          )}
          {availableCredits > 0 && availableCredits <= 2 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Coins className="h-5 w-5 flex-shrink-0 text-amber-500" />
              <p className="text-sm text-amber-700">
                <strong>Low credits.</strong> Only {availableCredits} remaining. Consider purchasing more.
              </p>
            </div>
          )}

          {/* ---- Quick actions ---- */}
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              onClick={() => setShowTopUpModal(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#1f419a] px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg"
            >
              <Plus className="h-4 w-4" />
              Add Funds
            </button>
            {subscriptionInfo && getCreditAllocation(subscriptionInfo.tier).monthly !== Infinity && (
              <button
                onClick={() => setShowCreditPurchaseModal(true)}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#1f419a] px-4 py-3 text-sm font-semibold text-[#1f419a] transition-colors hover:bg-[#eef2ff]"
              >
                <Coins className="h-4 w-4" />
                Buy Credits
              </button>
            )}
            <Link
              href="/dashboard/profile/subscription"
              className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-black/5 transition-colors hover:bg-gray-50"
            >
              <CreditCard className="h-4 w-4" />
              Subscription
            </Link>
          </div>

          {/* ---- Subscription status ---- */}
          {subscriptionInfo && (
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef2ff]">
                    <CreditCard className="h-4 w-4 text-[#1f419a]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {subscriptionInfo.tier.charAt(0).toUpperCase() + subscriptionInfo.tier.slice(1)} Plan
                    </p>
                    <p className={`text-xs ${isActive() ? "text-green-600" : "text-red-500"}`}>
                      {isActive() ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {subscriptionInfo.expires_at && (
                    <p className="text-xs text-gray-400">
                      Expires {new Date(subscriptionInfo.expires_at).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {getCreditAllocation(subscriptionInfo.tier).monthly === Infinity
                      ? "Unlimited credits"
                      : `${getCreditAllocation(subscriptionInfo.tier).monthly} credits/mo`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ---- Transaction history ---- */}
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-[#1f419a]" />
                <h2 className="font-semibold text-gray-900">Transaction History</h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                  {filteredTx.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-gray-400" />
                {(["all", "credit", "debit"] as TxFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setTxFilter(f)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      txFilter === f
                        ? "bg-[#1f419a] text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {f === "all" ? "All" : f === "credit" ? "Credits" : "Debits"}
                  </button>
                ))}
              </div>
            </div>

            {filteredTx.length === 0 ? (
              <div className="p-10 text-center">
                <History className="mx-auto mb-3 h-10 w-10 text-gray-200" />
                <p className="text-sm font-medium text-gray-500">No transactions yet</p>
                <p className="mt-1 text-xs text-gray-400">
                  Your transaction history will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredTx.map((tx) => {
                  const isCredit = tx.amount_cents > 0;
                  const { Icon, cls } = txIcon(tx.type);
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50/50"
                    >
                      <div
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${cls}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900 capitalize">
                          {tx.type.replace(/_/g, " ")}
                        </p>
                        {tx.description && (
                          <p className="truncate text-xs text-gray-400">{tx.description}</p>
                        )}
                        <p className="text-[10px] text-gray-300">
                          {new Date(tx.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-semibold ${isCredit ? "text-green-600" : "text-red-500"}`}>
                          {isCredit ? "+" : ""}
                          {formatPrice(tx.amount_cents, currency)}
                        </p>
                        <p className="text-[10px] text-gray-300">
                          Bal: {formatPrice(tx.balance_after_cents, currency)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ---- Top-up modal ---- */}
      {showTopUpModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <div>
                <h3 className="font-bold text-gray-900">Add Funds</h3>
                <p className="text-xs text-gray-500">Top up your wallet balance</p>
              </div>
              <button
                onClick={() => {
                  setShowTopUpModal(false);
                  setTopUpAmount(0);
                }}
                className="rounded-lg p-1.5 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Amount ({currencySymbol(currency)})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={topUpAmount || ""}
                  onChange={(e) => setTopUpAmount(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-lg font-semibold focus:border-[#1f419a] focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                  placeholder="0.00"
                />
              </div>

              {/* Preset amounts */}
              <div className="flex gap-2">
                {(currency === "NGN" ? [5000, 10000, 25000] : currency === "GBP" ? [5, 10, 25] : [5, 10, 25]).map(
                  (amt) => (
                    <button
                      key={amt}
                      onClick={() => setTopUpAmount(amt)}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                        topUpAmount === amt
                          ? "border-[#1f419a] bg-[#eef2ff] text-[#1f419a]"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {currencySymbol(currency)}
                      {amt.toLocaleString()}
                    </button>
                  )
                )}
              </div>

              {topUpAmount > 0 && (
                <div className="rounded-xl bg-[#eef2ff] p-3 text-center">
                  <p className="text-xs text-gray-500">You will be charged</p>
                  <p className="text-xl font-bold text-[#1f419a]">
                    {formatPrice(Math.round(topUpAmount * 100), currency)}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-gray-100 p-4">
              <button
                onClick={() => {
                  setShowTopUpModal(false);
                  setTopUpAmount(0);
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleTopUp}
                disabled={processing || topUpAmount <= 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4" /> Continue to Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Credit purchase modal ---- */}
      {showCreditPurchaseModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <div>
                <h3 className="font-bold text-gray-900">Purchase Credits</h3>
                <p className="text-xs text-gray-500">Buy additional credits for video dating</p>
              </div>
              <button
                onClick={() => {
                  setShowCreditPurchaseModal(false);
                  setCreditPurchaseAmount(0);
                }}
                className="rounded-lg p-1.5 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              {/* Price per credit */}
              {subscriptionInfo && (() => {
                const alloc = getCreditAllocation(subscriptionInfo.tier);
                const ppc = alloc.pricePerCredit[currency.toLowerCase() as keyof typeof alloc.pricePerCredit];
                return (
                  <div className="rounded-xl bg-blue-50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-blue-500">Price per credit</p>
                    <p className="text-lg font-bold text-blue-700">
                      {formatPrice(Math.round(ppc * 100), currency)}
                    </p>
                  </div>
                );
              })()}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Number of Credits</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={creditPurchaseAmount || ""}
                  onChange={(e) => setCreditPurchaseAmount(parseInt(e.target.value) || 0)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-lg font-semibold focus:border-[#1f419a] focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                  placeholder="0"
                />
              </div>

              {/* Quick pick */}
              <div className="flex gap-2">
                {[5, 10, 20].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setCreditPurchaseAmount(amt)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                      creditPurchaseAmount === amt
                        ? "border-[#1f419a] bg-[#eef2ff] text-[#1f419a]"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {amt} credits
                  </button>
                ))}
              </div>

              {/* Total */}
              {creditPurchaseAmount > 0 && subscriptionInfo && (() => {
                const alloc = getCreditAllocation(subscriptionInfo.tier);
                const ppc = alloc.pricePerCredit[currency.toLowerCase() as keyof typeof alloc.pricePerCredit];
                const totalCents = Math.round(creditPurchaseAmount * ppc * 100);
                const canUseWallet = walletData && walletData.balance_cents >= totalCents;
                return (
                  <div className="rounded-xl bg-[#eef2ff] p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{creditPurchaseAmount} credits</span>
                      <span className="font-bold text-[#1f419a]">{formatPrice(totalCents, currency)}</span>
                    </div>
                    {canUseWallet ? (
                      <p className="text-[11px] text-green-600">
                        Sufficient wallet balance — payment will be deducted from your wallet.
                      </p>
                    ) : walletData ? (
                      <p className="text-[11px] text-amber-600">
                        Wallet ({formatPrice(walletData.balance_cents, currency)}) insufficient — redirecting to Stripe.
                      </p>
                    ) : null}
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3 border-t border-gray-100 p-4">
              <button
                onClick={() => {
                  setShowCreditPurchaseModal(false);
                  setCreditPurchaseAmount(0);
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePurchaseCredits}
                disabled={processing || creditPurchaseAmount <= 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                  </>
                ) : (
                  "Purchase Credits"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Page wrapper (Suspense boundary for useSearchParams)
// ---------------------------------------------------------------
export default function WalletPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
        </div>
      }
    >
      <WalletContent />
    </Suspense>
  );
}
