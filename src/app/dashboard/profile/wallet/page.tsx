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
import {
  MIN_CREDIT_PURCHASE,
  MONTHLY_CREDITS_BY_TIER,
  PRICE_PER_CREDIT_BY_TIER,
} from "@/lib/credits/config";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type Currency = "NGN" | "USD" | "GBP";

type WalletData = {
  balance_cents: number;
  credits: { total: number; used: number; rollover: number } | null;
};

type SubscriptionInfo = {
  tier: string | null;
  status: string | null;
  expires_at: string | null;
  membership_status: string | null;
};

type CreditAllocation = {
  monthly: number;
  pricePerCredit: { ngn: number; usd: number; gbp: number };
};

type Transaction = {
  id: string;
  source: "wallet" | "credits";
  type: string;
  amount_cents: number;
  amount_credits: number;
  balance_before_cents: number | null;
  balance_after_cents: number | null;
  description: string | null;
  created_at: string;
  reference_id: string | null;
  admin_id: string | null;
};

type TxFilter = "all" | "credit" | "debit";

type CreditPurchaseAvailability = {
  canPurchase: boolean;
  pricePerCredit: number;
  reason: string;
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Stripe minimum charge amounts per currency (in main unit, e.g. pounds/dollars) */
const STRIPE_MINIMUM_AMOUNT: Record<Currency, number> = {
  USD: 0.50,  // $0.50
  GBP: 0.30,  // £0.30
  NGN: 50.00, // ₦50.00
};

/** Compute the minimum number of credits needed to meet Stripe's per-transaction minimum */
function getMinCreditQuantity(pricePerCredit: number, currency: Currency): number {
  if (pricePerCredit <= 0) return 1;
  const min = STRIPE_MINIMUM_AMOUNT[currency];
  return Math.max(1, Math.ceil(min / pricePerCredit));
}

/** Compute the minimum wallet top-up amount for the selected currency */
function getMinTopUpAmount(currency: Currency): number {
  return STRIPE_MINIMUM_AMOUNT[currency];
}

/** Detect user currency based on IP (Nigeria → NGN, UK → GBP, else USD). Uses /api/geo; client-side fallback for Tailscale. */
async function detectCurrency(): Promise<Currency> {
  try {
    const res = await fetch("/api/geo");
    const data = await res.json();
    const c = (data.currency || "usd").toLowerCase();
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

function shouldCenterCheckoutError(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("too low to process") ||
    normalized.includes("minimum amount") ||
    normalized.includes("minimum top-up amount")
  );
}

/** Currency symbol */
function currencySymbol(c: Currency): string {
  return c === "NGN" ? "₦" : c === "GBP" ? "£" : "$";
}

function formatTransactionTitle(tx: Transaction): string {
  const normalized = tx.type.toLowerCase();

  const labels: Record<string, string> = {
    wallet_topup: "Wallet Top-up",
    credit_purchase: "Credit Purchase",
    credit_purchase_wallet: "Credit Purchase (Wallet)",
    meeting_request_sent: "Calendar Booking Request Fee",
    meeting_request_accepted: "Meeting Acceptance Fee",
    subscription_monthly_allocation: "Monthly Credit Allocation",
    subscription_credit_rollover: "Credit Rollover",
    credit_refund: "Credit Refund",
    cancellation_fee: "Cancellation Fee",
    meeting_charge: "Meeting Charge",
  };

  return labels[normalized] || tx.type.replace(/_/g, " ");
}

/** Get credit allocation for a tier */
function getCreditAllocation(tier: string): CreditAllocation {
  switch ((tier || "").toLowerCase()) {
    case "basic":
      return {
        monthly: MONTHLY_CREDITS_BY_TIER.basic,
        pricePerCredit: PRICE_PER_CREDIT_BY_TIER.basic,
      };
    case "standard":
      return {
        monthly: MONTHLY_CREDITS_BY_TIER.standard,
        pricePerCredit: PRICE_PER_CREDIT_BY_TIER.standard,
      };
    case "premium":
      return {
        monthly: MONTHLY_CREDITS_BY_TIER.premium,
        pricePerCredit: PRICE_PER_CREDIT_BY_TIER.premium,
      };
    case "vip":
      return { monthly: Infinity, pricePerCredit: { ngn: 0, usd: 0, gbp: 0 } };
    default:
      return {
        monthly: 0,
        pricePerCredit: PRICE_PER_CREDIT_BY_TIER.basic,
      };
  }
}

function isSubscriptionActive(subscriptionInfo: SubscriptionInfo | null) {
  if (!subscriptionInfo) return false;
  if (subscriptionInfo.tier?.toLowerCase() === "vip") return true;
  const status = subscriptionInfo.membership_status || subscriptionInfo.status;
  if (status !== "active") return false;
  return subscriptionInfo.expires_at
    ? new Date(subscriptionInfo.expires_at) > new Date()
    : true;
}

function getCreditPurchaseAvailability(
  tier: string | null | undefined,
  currency: Currency
): CreditPurchaseAvailability {
  if (!tier) {
    return {
      canPurchase: false,
      pricePerCredit: 0,
      reason: "An active subscription plan is required before purchasing extra credits.",
    };
  }

  const allocation = getCreditAllocation(tier);
  const pricePerCredit =
    allocation.pricePerCredit[
      currency.toLowerCase() as keyof typeof allocation.pricePerCredit
    ] || 0;

  if (allocation.monthly === Infinity || pricePerCredit <= 0) {
    return {
      canPurchase: false,
      pricePerCredit,
      reason: "Your VIP plan already includes unlimited credits.",
    };
  }

  return { canPurchase: true, pricePerCredit, reason: "" };
}

async function redirectToStripeCheckout(
  url: string | null | undefined
) {
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
    // Stripe Checkout must be opened as a top-level page, not inside an iframe.
    try {
      if (window.top) {
        window.top.location.href = url;
        return;
      }
    } catch {
      // Ignore and fallback below.
    }

    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) return;
  }

  window.location.assign(url);
}

// ---------------------------------------------------------------
// Inner component (uses useSearchParams)
// ---------------------------------------------------------------
function WalletContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const handledSuccessRef = useRef<Set<string>>(new Set());
  const handledCancelRef = useRef(false);
  const handledOpenRef = useRef<Set<string>>(new Set());

  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [walletAccessEnabled, setWalletAccessEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [topUpAmount, setTopUpAmount] = useState<number>(0);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showCreditPurchaseModal, setShowCreditPurchaseModal] = useState(false);
  const [creditPurchaseAmount, setCreditPurchaseAmount] = useState<number>(0);
  const [processing, setProcessing] = useState(false);
  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const creditPurchaseAvailability = getCreditPurchaseAvailability(
    subscriptionInfo?.tier,
    currency
  );
  const canPurchaseExtraCredits =
    walletAccessEnabled &&
    isSubscriptionActive(subscriptionInfo) &&
    creditPurchaseAvailability.canPurchase;

  const processedSessionsRef = useRef<Set<string>>(new Set());
  const fetchWalletDataRef = useRef<() => Promise<void>>(async () => {});
  const verifyAndProcessPaymentRef = useRef<(sessionId: string) => Promise<void>>(
    async () => {}
  );

  // Detect currency on mount
  useEffect(() => {
    detectCurrency().then(setCurrency).catch(() => setCurrency("USD"));
  }, []);

  // Check for success/cancel query params from Stripe redirect
  const successParam = searchParams.get("success");
  const canceledParam = searchParams.get("canceled");
  const sessionIdParam = searchParams.get("session_id");
  const openParam = searchParams.get("open");

  useEffect(() => {
    if (successParam === "true" && sessionIdParam) {
      if (handledSuccessRef.current.has(sessionIdParam)) {
        return;
      }
      handledSuccessRef.current.add(sessionIdParam);

      toast.success("Payment successful! Updating your wallet...");
      fetchWalletDataRef
        .current()
        .then(() => verifyAndProcessPaymentRef.current(sessionIdParam));

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("success");
        url.searchParams.delete("session_id");
        window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      }
    }
    if (canceledParam === "true" && !handledCancelRef.current) {
      handledCancelRef.current = true;
      toast.warning("Payment was canceled.");
    }
  }, [successParam, canceledParam, sessionIdParam, toast]);

  useEffect(() => {
    if (!openParam || loading) return;
    if (handledOpenRef.current.has(openParam)) return;

    if (openParam === "credits") {
      if (canPurchaseExtraCredits) {
        setShowCreditPurchaseModal(true);
      } else if (walletAccessEnabled && subscriptionInfo?.tier) {
        toast.info(creditPurchaseAvailability.reason);
      }
      handledOpenRef.current.add(openParam);
    } else if (openParam === "topup") {
      setShowTopUpModal(true);
      handledOpenRef.current.add(openParam);
    } else {
      return;
    }

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("open");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }
  }, [
    openParam,
    loading,
    canPurchaseExtraCredits,
    creditPurchaseAvailability.reason,
    walletAccessEnabled,
    subscriptionInfo?.tier,
    toast,
  ]);

  // ---------------------------------------------------------------
  // Verify payment after Stripe redirect
  // ---------------------------------------------------------------
  const verifyAndProcessPayment = async (sessionId: string) => {
    try {
      const user = await getCurrentUserSafe();
      if (!user) return;
      if (!walletAccessEnabled) {
        toast.error("Wallet is locked until your first successful subscription payment.");
        return;
      }

      if (processedSessionsRef.current.has(sessionId)) {
        return;
      }

      processedSessionsRef.current.add(sessionId);
      const maxAttempts = 4;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        const response = await fetch(`/api/verify-payment?sessionId=${sessionId}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          if (attempt === maxAttempts - 1) {
            toast.error("Failed to verify payment. Please refresh.");
          }
          continue;
        }

        const data = await response.json();

        if (data.success) {
          if (data.type === "wallet_topup" && !data.alreadyProcessed) {
            toast.success("Wallet topped up successfully!");
          }

          if (data.type === "credit_purchase" && !data.alreadyProcessed) {
            toast.success(`${data.creditsAdded || data.credits || 0} credits added!`);
          }

          await fetchWalletData();
          return;
        }

        if (data.retryable && attempt < maxAttempts - 1) {
          continue;
        }

        if (data.message) {
          toast.error(data.message);
          return;
        }

        if (!data.paid) {
          toast.error("Payment has not been completed yet.");
          return;
        }

        toast.error("Failed to process payment. Please refresh.");
        return;
      }
    } catch {
      toast.error("Failed to verify payment. Please refresh.");
    } finally {
      processedSessionsRef.current.delete(sessionId);
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
      const { data: walletData, error: walletError } = await supabase
        .from("wallets")
        .select("balance_cents")
        .eq("user_id", user.id)
        .single();
      let wallet = walletData;

      if (walletError?.code === "PGRST116") {
        await supabase.from("wallets").insert({ user_id: user.id, balance_cents: 0 });
        const { data: newW } = await supabase
          .from("wallets")
          .select("balance_cents")
          .eq("user_id", user.id)
          .single();
        wallet = newW;
      }

      // Guard against negative balances that should never happen in normal
      // operation.  If this fires, a bug in a payment route or admin tool
      // produced an invalid balance; the /api/correct-wallet-balance endpoint
      // (which is the canonical fixer) should be called to diagnose and restore.
      if (wallet && wallet.balance_cents < 0) {
        console.warn(
          `[wallet] Negative balance_cents (${wallet.balance_cents}) detected for user ${user.id}. Clamping to 0 — check /api/correct-wallet-balance for root cause.`
        );
        await supabase.from("wallets").update({ balance_cents: 0 }).eq("user_id", user.id);
        wallet.balance_cents = 0;
      }

      // Credits
      const { data: creditsData, error: creditsError } = await supabase
        .from("credits")
        .select("total, used, rollover")
        .eq("user_id", user.id)
        .single();
      let credits = creditsData;

      if (creditsError?.code === "PGRST116") {
        await supabase.from("credits").insert({ user_id: user.id, total: 0, used: 0, rollover: 0 });
        const { data: newC } = await supabase
          .from("credits")
          .select("total, used, rollover")
          .eq("user_id", user.id)
          .single();
        credits = newC;
      }

      // Subscription + wallet access state
      const { data: membership } = await supabase
        .from("memberships")
        .select("tier, status, expires_at, price_cents")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const hasPaidMembership =
        Boolean(membership) && Number(membership?.price_cents || 0) > 0;
      const hasActiveMembership =
        Boolean(membership) &&
        membership?.status === "active" &&
        (!membership?.expires_at || new Date(membership.expires_at) > new Date());

      setWalletAccessEnabled(hasPaidMembership);
      setSubscriptionInfo({
        tier: hasActiveMembership ? membership?.tier || null : null,
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
      const [{ data: walletTxData }, { data: creditTxData }] = await Promise.all([
        supabase
          .from("wallet_transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("credit_transactions")
          .select("id, amount, action_type, description, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const normalizedWalletTransactions: Transaction[] = (walletTxData || []).map((tx) => ({
        ...tx,
        source: "wallet",
        amount_credits: 0,
        balance_before_cents: tx.balance_before_cents ?? null,
        balance_after_cents: tx.balance_after_cents ?? null,
      }));

      const normalizedCreditTransactions: Transaction[] = (creditTxData || []).map((tx) => ({
        id: tx.id,
        source: "credits",
        type: tx.action_type,
        amount_cents: 0,
        amount_credits: tx.amount ?? 0,
        balance_before_cents: null,
        balance_after_cents: null,
        description: tx.description ?? null,
        created_at: tx.created_at,
        reference_id: null,
        admin_id: null,
      }));

      const mergedTransactions = [
        ...normalizedWalletTransactions,
        ...normalizedCreditTransactions,
      ]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setTransactions(mergedTransactions);
    } catch (err) {
      console.error("Error fetching wallet data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  fetchWalletDataRef.current = fetchWalletData;
  verifyAndProcessPaymentRef.current = verifyAndProcessPayment;

  useEffect(() => {
    fetchWalletData();
  }, []);

  // ---------------------------------------------------------------
  // Purchase credits
  // ---------------------------------------------------------------
  const handlePurchaseCredits = async () => {
    if (!walletAccessEnabled) {
      toast.error("Wallet is locked until your first successful subscription payment.");
      return;
    }

    if (!subscriptionInfo?.tier || !isActive()) {
      toast.error("An active subscription plan is required before purchasing extra credits.");
      return;
    }

    if (!canPurchaseExtraCredits || creditPurchaseAvailability.pricePerCredit <= 0) {
      toast.info(creditPurchaseAvailability.reason);
      setShowCreditPurchaseModal(false);
      setCreditPurchaseAmount(0);
      return;
    }

    if (creditPurchaseAmount <= 0) {
      toast.warning("Please enter a valid number of credits.");
      return;
    }

    // Enforce minimum purchase quantity
    const pricePerCreditCheck = creditPurchaseAvailability.pricePerCredit;
    if (creditPurchaseAmount < MIN_CREDIT_PURCHASE) {
      const minAmount = formatPrice(Math.round(pricePerCreditCheck * MIN_CREDIT_PURCHASE * 100), currency);
      toast.centerError(
        `The minimum order is ${MIN_CREDIT_PURCHASE} credits (${minAmount}). Please increase the quantity.`,
        undefined,
        "Minimum Order Required"
      );
      return;
    }

    try {
      setProcessing(true);
      const user = await getCurrentUserSafe();
      if (!user) {
        toast.error("Please log in to purchase credits.");
        return;
      }

      const pricePerCredit = creditPurchaseAvailability.pricePerCredit;
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
          const result = await res.json().catch(() => null);
          const nextBalance =
            typeof result?.balance_after === "number"
              ? formatPrice(result.balance_after, currency)
              : formatPrice(
                  Math.max((walletData?.balance_cents || 0) - amountCents, 0),
                  currency
                );
          toast.success(
            `${creditPurchaseAmount} credits purchased from wallet for ${formatPrice(
              amountCents,
              currency
            )}. New wallet balance: ${nextBalance}.`
          );
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
      const { url } = await res.json();
      await redirectToStripeCheckout(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start checkout.";
      if (shouldCenterCheckoutError(msg)) {
        toast.centerError(msg, undefined, "Unable to Continue");
      } else {
        toast.error(msg);
      }
    } finally {
      setProcessing(false);
    }
  };

  // ---------------------------------------------------------------
  // Top-up wallet
  // ---------------------------------------------------------------
  const handleTopUp = async () => {
    if (!walletAccessEnabled) {
      toast.error("Wallet is locked until your first successful subscription payment.");
      return;
    }

    if (!subscriptionInfo?.tier || !isActive()) {
      toast.error("An active subscription plan is required before adding funds to your wallet.");
      return;
    }

    if (topUpAmount <= 0) {
      toast.warning("Please enter a valid amount.");
      return;
    }

    // Enforce Stripe minimum top-up amount
    const minTopUp = getMinTopUpAmount(currency);
    if (topUpAmount < minTopUp) {
      toast.centerError(
        `The minimum top-up amount is ${formatPrice(Math.round(minTopUp * 100), currency)}. Please enter a higher amount.`,
        undefined,
        "Minimum Top-Up Required"
      );
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
      const { url } = await res.json();
      await redirectToStripeCheckout(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start checkout.";
      if (shouldCenterCheckoutError(msg)) {
        toast.centerError(msg, undefined, "Unable to Continue");
      } else {
        toast.error(msg);
      }
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
  const monthlyCredits =
    subscriptionInfo?.tier && getCreditAllocation(subscriptionInfo.tier).monthly !== Infinity
      ? getCreditAllocation(subscriptionInfo.tier).monthly
      : null;
  const rolloverCredits = walletData?.credits?.rollover || 0;

  const isActive = () => {
    return isSubscriptionActive(subscriptionInfo);
  };

  const filteredTx = transactions.filter((t) => {
    const signedAmount = t.source === "credits" ? t.amount_credits : t.amount_cents;

    if (txFilter === "all") return true;

    if (txFilter === "credit") {
      return t.source === "credits";
    }

    return signedAmount < 0;
  });

  const txIcon = (type: string) => {
    const lower = type.toLowerCase();
    if (
      [
        "credit",
        "topup",
        "refund",
        "wallet_topup",
        "credit_purchase",
        "subscription_monthly_allocation",
        "credit_refund",
      ].includes(lower)
    )
      return { Icon: ArrowDownLeft, cls: "text-green-600 bg-green-50" };
    if (
      [
        "debit",
        "payment",
        "charge",
        "meeting_charge",
        "cancellation_fee",
        "meeting_request_sent",
        "meeting_request_accepted",
      ].includes(lower)
    )
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
            <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={110} height={28} style={{ width: "auto", height: "auto" }} />
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

          {!walletAccessEnabled && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                Wallet access is locked until your first successful subscription payment.
              </p>
              <Link
                href="/dashboard/profile/subscription"
                className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-200"
              >
                Subscribe
              </Link>
            </div>
          )}

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
                  {monthlyCredits !== null ? (
                    <div className="mt-1 space-y-0.5 text-[11px] text-gray-400">
                      <p>Monthly plan credits: {monthlyCredits}</p>
                      {rolloverCredits > 0 && <p>Rollover credits: {rolloverCredits}</p>}
                      <p>Total available now: {availableCredits}</p>
                    </div>
                  ) : rolloverCredits > 0 ? (
                    <p className="mt-1 text-[11px] text-gray-400">
                      Includes {rolloverCredits} rollover
                    </p>
                  ) : null}
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef2ff]">
                  <Coins className="h-6 w-6 text-[#1f419a]" />
                </div>
              </div>
              {/* Usage bar */}
              {subscriptionInfo?.tier &&
                getCreditAllocation(subscriptionInfo.tier).monthly !== Infinity &&
                walletData?.credits && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>{walletData.credits.used} used</span>
                    <span>{getCreditAllocation(subscriptionInfo.tier).monthly} monthly plan credits</span>
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
          {canPurchaseExtraCredits && availableCredits === 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
              <X className="h-5 w-5 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">
                <strong>No credits.</strong> Purchase more to continue using video dating features.
              </p>
            </div>
          )}
          {canPurchaseExtraCredits && availableCredits > 0 && availableCredits <= 2 && (
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
              disabled={!walletAccessEnabled}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#1f419a] px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add Funds
            </button>
            {canPurchaseExtraCredits && (
              <button
                onClick={() => setShowCreditPurchaseModal(true)}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#1f419a] px-4 py-3 text-sm font-semibold text-[#1f419a] transition-colors hover:bg-[#eef2ff]"
              >
                <Coins className="h-4 w-4" />
                Get Credits
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

          {canPurchaseExtraCredits && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Wallet balance is used first for credit purchases.
              If your balance is not enough, card checkout opens automatically.
            </div>
          )}

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
                      {subscriptionInfo.tier
                        ? `${subscriptionInfo.tier.charAt(0).toUpperCase()}${subscriptionInfo.tier.slice(1)} Plan`
                        : "No Active Subscription"}
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
                    {subscriptionInfo.tier &&
                    getCreditAllocation(subscriptionInfo.tier).monthly === Infinity
                      ? "Unlimited credits"
                      : `${subscriptionInfo.tier ? getCreditAllocation(subscriptionInfo.tier).monthly : 0} credits/mo`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ---- Transaction history ---- */}
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5">
            {filteredTx.length === 0 ? (
              <>
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
                <div className="p-10 text-center">
                  <History className="mx-auto mb-3 h-10 w-10 text-gray-200" />
                  <p className="text-sm font-medium text-gray-500">No transactions yet</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Your transaction history will appear here.
                  </p>
                </div>
              </>
            ) : (
              <div className="relative">
                <div className="max-h-[420px] overflow-y-auto pr-1 sm:max-h-[520px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#cfd7f3] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
                  <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-gray-100 bg-white/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
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
                  <div className="divide-y divide-gray-50">
                    {filteredTx.map((tx) => {
                      const signedAmount = tx.source === "credits" ? tx.amount_credits : tx.amount_cents;
                      const isCredit = signedAmount > 0;
                      const { Icon, cls } = txIcon(tx.type);
                      const amountLabel =
                        tx.source === "credits"
                          ? `${isCredit ? "+" : ""}${tx.amount_credits} credit${Math.abs(tx.amount_credits) === 1 ? "" : "s"}`
                          : `${isCredit ? "+" : ""}${formatPrice(tx.amount_cents, currency)}`;
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
                            <p className="truncate text-sm font-medium text-gray-900">
                              {formatTransactionTitle(tx)}
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
                              {amountLabel}
                            </p>
                            {tx.source === "wallet" && tx.balance_after_cents !== null ? (
                              <p className="text-[10px] text-gray-300">
                                Bal: {formatPrice(tx.balance_after_cents, currency)}
                              </p>
                            ) : (
                              <p className="text-[10px] text-gray-300">Credits activity</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white via-white/90 to-transparent" />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ---- Top-up modal ---- */}
      {showTopUpModal && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 px-2 backdrop-blur-sm sm:items-center sm:px-0">
          <div className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:mx-4 sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-3 sm:p-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 sm:text-lg">Add Funds</h3>
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

            <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 sm:text-sm">
                  Amount ({currencySymbol(currency)})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={topUpAmount || ""}
                  onChange={(e) => setTopUpAmount(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-base font-semibold focus:border-[#1f419a] focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20 sm:py-3 sm:text-lg"
                  placeholder="0.00"
                />
                <p className="mt-1 text-[10px] text-gray-400 sm:text-xs">
                  Minimum top-up: {formatPrice(Math.round(getMinTopUpAmount(currency) * 100), currency)}
                </p>
              </div>

              {/* Preset amounts */}
              <div className="flex gap-2">
                {(currency === "NGN" ? [5000, 10000, 25000] : currency === "GBP" ? [5, 10, 25] : [5, 10, 25]).map(
                  (amt) => (
                    <button
                      key={amt}
                      onClick={() => setTopUpAmount(amt)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors sm:text-sm ${
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
                <div className="rounded-xl bg-[#eef2ff] p-2.5 text-center sm:p-3">
                  <p className="text-xs text-gray-500">You will be charged</p>
                  <p className="text-lg font-bold text-[#1f419a] sm:text-xl">
                    {formatPrice(Math.round(topUpAmount * 100), currency)}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-gray-100 p-3 sm:gap-3 sm:p-4">
              <button
                onClick={() => {
                  setShowTopUpModal(false);
                  setTopUpAmount(0);
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleTopUp}
                disabled={processing || topUpAmount <= 0 || !subscriptionInfo?.tier || !isActive()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50 whitespace-nowrap"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="sm:hidden">Processing</span>
                    <span className="hidden sm:inline">Processing...</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4" />
                    <span className="sm:hidden">Continue</span>
                    <span className="hidden sm:inline">Continue to Payment</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Credit purchase modal ---- */}
      {showCreditPurchaseModal && canPurchaseExtraCredits && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 px-2 backdrop-blur-sm sm:items-center sm:px-0">
          <div className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:mx-4 sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-3 sm:p-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 sm:text-lg">Get Credits</h3>
                <p className="text-xs text-gray-500">Use wallet balance first, then card only if needed</p>
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

            <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
              {/* Price per credit */}
              {subscriptionInfo?.tier && (() => {
                const ppc = creditPurchaseAvailability.pricePerCredit;
                return (
                  <div className="rounded-xl bg-blue-50 p-2.5 sm:p-3">
                    <p className="text-[10px] uppercase tracking-wider text-blue-500">Price per credit</p>
                    <p className="text-base font-bold text-blue-700 sm:text-lg">
                      {formatPrice(Math.round(ppc * 100), currency)}
                    </p>
                  </div>
                );
              })()}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 sm:text-sm">Number of Credits</label>
                <input
                  type="number"
                  min={MIN_CREDIT_PURCHASE}
                  step="1"
                  value={creditPurchaseAmount || ""}
                  onChange={(e) => setCreditPurchaseAmount(parseInt(e.target.value) || 0)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-base font-semibold focus:border-[#1f419a] focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20 sm:py-3 sm:text-lg"
                  placeholder="0"
                />
                {(() => {
                  const ppc = creditPurchaseAvailability.pricePerCredit;
                  return (
                    <p className="mt-1 text-[10px] text-amber-600 sm:text-xs">
                      Minimum {MIN_CREDIT_PURCHASE} credits ({formatPrice(Math.round(ppc * MIN_CREDIT_PURCHASE * 100), currency)}) required per transaction.
                    </p>
                  );
                })()}
              </div>

              {/* Quick pick */}
              <div className="flex gap-2">
                {[10, 20, 50].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setCreditPurchaseAmount(amt)}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors sm:text-sm ${
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
              {creditPurchaseAmount > 0 && subscriptionInfo?.tier && (() => {
                const ppc = creditPurchaseAvailability.pricePerCredit;
                const totalCents = Math.round(creditPurchaseAmount * ppc * 100);
                const canUseWallet = walletData && walletData.balance_cents >= totalCents;
                const walletBalance = walletData?.balance_cents || 0;
                const walletBalanceAfter = Math.max(walletBalance - totalCents, 0);
                const currentCredits =
                  (walletData?.credits?.total || 0) -
                  (walletData?.credits?.used || 0) +
                  (walletData?.credits?.rollover || 0);
                const creditsAfterPurchase = currentCredits + creditPurchaseAmount;
                return (
                  <div className="rounded-xl bg-[#eef2ff] p-2.5 space-y-2 sm:p-3">
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-gray-500">{creditPurchaseAmount} credits</span>
                      <span className="font-bold text-[#1f419a]">{formatPrice(totalCents, currency)}</span>
                    </div>
                    {canUseWallet ? (
                      <div className="space-y-1 text-[11px]">
                        <p className="font-medium text-green-600">
                          Sufficient wallet balance — payment will be deducted from your wallet.
                        </p>
                        <p className="text-[#1f419a]">
                          Wallet deduction: {formatPrice(totalCents, currency)}.
                          Balance after purchase: {formatPrice(walletBalanceAfter, currency)}.
                        </p>
                        <p className="text-[#1f419a]">
                          Credits after purchase: {creditsAfterPurchase}.
                        </p>
                      </div>
                    ) : walletData ? (
                      <div className="space-y-1 text-[11px]">
                        <p className="font-medium text-amber-600">
                          Wallet ({formatPrice(walletData.balance_cents, currency)}) insufficient — redirecting to card payment.
                        </p>
                        <p className="text-gray-500">
                          Credits after purchase: {creditsAfterPurchase}.
                        </p>
                      </div>
                    ) : null}
                    <p className="text-[11px] text-gray-500">
                      This flow uses your available wallet balance before debit or credit card checkout.
                    </p>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-2 border-t border-gray-100 p-3 sm:gap-3 sm:p-4">
              <button
                onClick={() => {
                  setShowCreditPurchaseModal(false);
                  setCreditPurchaseAmount(0);
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handlePurchaseCredits}
                disabled={processing || creditPurchaseAmount <= 0 || !canPurchaseExtraCredits}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50 whitespace-nowrap"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="sm:hidden">Processing</span>
                    <span className="hidden sm:inline">Processing...</span>
                  </>
                ) : (
                  <>
                    <span className="sm:hidden">
                      {walletData &&
                      creditPurchaseAmount > 0 &&
                      walletData.balance_cents >=
                        Math.round(
                          creditPurchaseAmount *
                            creditPurchaseAvailability.pricePerCredit *
                            100
                        )
                        ? "Use Wallet"
                        : "Continue"}
                    </span>
                    <span className="hidden sm:inline">
                      {walletData &&
                      creditPurchaseAmount > 0 &&
                      walletData.balance_cents >=
                        Math.round(
                          creditPurchaseAmount *
                            creditPurchaseAvailability.pricePerCredit *
                            100
                        )
                        ? "Pay from Wallet"
                        : "Use Wallet or Card"}
                    </span>
                  </>
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
