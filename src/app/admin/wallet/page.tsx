"use client";

/**
 * AdminWalletPage - Wallet & Credit Management
 *
 * Features per client request:
 * - View wallet balance for all users
 * - Add/remove credits from user wallets
 * - View wallet transaction history
 * - Previous wallet balance tracking
 * - Wallet analysis
 */

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import {
  Wallet,
  Search,
  Plus,
  Minus,
  History,
  TrendingUp,
  Loader2,
  RefreshCw,
  User,
  DollarSign,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { adminPath } from "@/lib/admin/path";

const WALLET_PAGE_SIZE = 10;

type WalletData = {
  user_id: string;
  balance_cents: number;
  user: {
    email: string;
    display_name: string | null;
  } | null;
  transactions: {
    id: string;
    type: string;
    amount_cents: number;
    balance_after_cents: number;
    description: string | null;
    created_at: string;
  }[];
};

export default function AdminWalletPage() {
  const { toast } = useToast();
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState(0); // Amount in cents
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [viewingTransactions, setViewingTransactions] = useState<WalletData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  /**
   * Fetch all wallets - ensures fresh data from database
   */
  const fetchWallets = async () => {
    setLoading(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        toast.error("Please log in again.");
        setWallets([]);
        return;
      }

      const query = searchQuery
        ? `?q=${encodeURIComponent(searchQuery)}&limit=200`
        : "?limit=200";

      const response = await fetch(`/api/admin/wallet${query}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to fetch wallets");
      }

      setWallets(payload.wallets || []);
    } catch (error) {
      console.error("[Admin Wallet] Fetch error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to fetch wallets"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  /**
   * Adjust wallet balance
   * Note: adjustmentAmount is in cents
   */
  const handleAdjustWallet = async () => {
    if (!selectedWallet || adjustmentAmount === 0 || !adjustmentReason.trim()) {
      toast.warning("Please enter amount and reason");
      return;
    }

    const adjustmentInNaira = Math.abs(adjustmentAmount / 100);
    const action = adjustmentAmount > 0 ? "add" : "remove";
    const confirmMessage = `Are you sure you want to ${action} ₦${adjustmentInNaira.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${action === "add" ? "to" : "from"} this wallet?\n\nCurrent balance: ₦${(selectedWallet.balance_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nNew balance: ₦${((selectedWallet.balance_cents + adjustmentAmount) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\nReason: ${adjustmentReason}`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setAdjusting(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        toast.error("Authentication error. Please log in again.");
        return;
      }

      const currentBalance = selectedWallet.balance_cents;
      const calculatedBalance = currentBalance + adjustmentAmount;
      const newBalance = Math.max(0, calculatedBalance);

      if (calculatedBalance < 0) {
        const wouldBeNegative = calculatedBalance;
        if (!confirm(`Warning: This adjustment would result in a negative balance (₦${(wouldBeNegative / 100).toFixed(2)}). The balance will be set to ₦0.00 instead. Continue?`)) {
          return;
        }
      }

      const response = await fetch("/api/admin/wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_id: selectedWallet.user_id,
          adjustment_cents: adjustmentAmount,
          reason: adjustmentReason.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to adjust wallet");
      }

      setAdjustmentAmount(0);
      setAdjustmentReason("");
      setSelectedWallet(null);
      await fetchWallets();
      toast.success(
        `Wallet adjusted successfully! New balance: ₦${(
          (payload?.wallet?.balance_after_cents || newBalance) / 100
        ).toLocaleString()}`
      );
    } catch (error: unknown) {
      console.error("[Admin Wallet] Error adjusting wallet:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to adjust wallet: ${msg}`);
    } finally {
      setAdjusting(false);
    }
  };

  const filteredWallets = wallets;
  const totalWalletPages = Math.max(
    1,
    Math.ceil(filteredWallets.length / WALLET_PAGE_SIZE)
  );
  const currentWalletPage = Math.min(currentPage, totalWalletPages);
  const walletPageStart = (currentWalletPage - 1) * WALLET_PAGE_SIZE;
  const paginatedWallets = filteredWallets.slice(
    walletPageStart,
    walletPageStart + WALLET_PAGE_SIZE
  );
  const walletPageEnd = walletPageStart + paginatedWallets.length;

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance_cents, 0);

  /** Determine if a transaction is a credit (green) or debit (red) using amount_cents */
  const isCredit = (tx: { type: string; amount_cents: number }) =>
    tx.type === "topup" ||
    tx.type === "refund" ||
    (tx.type === "admin_adjustment" && tx.amount_cents > 0);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalWalletPages));
  }, [totalWalletPages]);

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wallet Management</h1>
          <p className="text-gray-500">Manage user wallets and credits</p>
        </div>
        <button
          onClick={() => fetchWallets()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Wallets</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{wallets.length}</p>
            </div>
            <Wallet className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Balance</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                ₦{(totalBalance / 100).toLocaleString()}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Balance</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                ₦{wallets.length > 0 ? ((totalBalance / wallets.length) / 100).toLocaleString() : "0"}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by user email or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none"
          />
        </div>
      </div>

      {/* Wallets Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          </div>
        ) : filteredWallets.length === 0 ? (
          <div className="text-center py-12">
            <Wallet className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No wallets found</p>
          </div>
        ) : (
          <>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[960px]">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-100 shadow-sm">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recent Transactions</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedWallets.map((wallet) => (
                  <tr key={wallet.user_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {wallet.user?.display_name || "Unknown"}
                          </p>
                          <p className="text-xs text-gray-500">{wallet.user?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className={`text-sm font-bold ${wallet.balance_cents < 0 ? "text-red-600" : "text-gray-900"}`}>
                        ₦{(wallet.balance_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {wallet.balance_cents < 0 && (
                        <p className="text-xs text-red-500 mt-1">⚠️ Negative balance</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{wallet.transactions.length} transactions</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setViewingTransactions(wallet)}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50"
                        >
                          <History className="h-4 w-4 inline mr-1" />
                          History
                        </button>
                        <button
                          onClick={() => setSelectedWallet(wallet)}
                          className="px-3 py-1.5 rounded-lg bg-[#1f419a] text-white text-sm hover:bg-[#17357b]"
                        >
                          Adjust
                        </button>
                        <Link
                          href={adminPath(`/users/${wallet.user_id}`)}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-gray-50"
                        >
                          View User
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalWalletPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                Showing {walletPageStart + 1} to {walletPageEnd} of{" "}
                {filteredWallets.length} wallets
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.max(1, currentWalletPage - 1))}
                  disabled={currentWalletPage === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <label className="sr-only" htmlFor="wallet-page-select">
                  Select wallet page
                </label>
                <select
                  id="wallet-page-select"
                  value={currentWalletPage}
                  onChange={(event) => setCurrentPage(Number(event.target.value))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20"
                >
                  {Array.from({ length: totalWalletPages }, (_, index) => {
                    const pageNumber = index + 1;
                    return (
                      <option key={pageNumber} value={pageNumber}>
                        Page {pageNumber} of {totalWalletPages}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage(Math.min(totalWalletPages, currentWalletPage + 1))
                  }
                  disabled={currentWalletPage === totalWalletPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Adjustment Modal */}
      {selectedWallet && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Adjust Wallet</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Balance</label>
                <p className="text-lg font-bold text-gray-900">
                  ₦{(selectedWallet.balance_cents / 100).toLocaleString()}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adjustment Amount (₦)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAdjustmentAmount(adjustmentAmount - 100000)}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                    disabled={adjusting}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-gray-500">₦</span>
                    <input
                      type="number"
                      step="0.01"
                      min="-999999"
                      max="999999"
                      value={(adjustmentAmount / 100).toFixed(2)}
                      onChange={(e) => {
                        const nairaValue = parseFloat(e.target.value) || 0;
                        setAdjustmentAmount(Math.round(nairaValue * 100));
                      }}
                      className="flex-1 text-center px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                      disabled={adjusting}
                    />
                  </div>
                  <button
                    onClick={() => setAdjustmentAmount(adjustmentAmount + 100000)}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                    disabled={adjusting}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {adjustmentAmount >= 0 ? "Adding" : "Removing"} ₦{Math.abs(adjustmentAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {adjustmentAmount !== 0 && (
                    <span className="ml-2">
                      → New balance: ₦{((selectedWallet.balance_cents + adjustmentAmount) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (Required)</label>
                <textarea
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder="Reason for adjustment (e.g., Refund, Compensation, Correction...)"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none resize-none h-20"
                  disabled={adjusting}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    if (!adjusting) {
                      setSelectedWallet(null);
                      setAdjustmentAmount(0);
                      setAdjustmentReason("");
                    }
                  }}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  disabled={adjusting}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setAdjusting(true);
                    await handleAdjustWallet();
                    setAdjusting(false);
                  }}
                  disabled={adjusting || adjustmentAmount === 0 || !adjustmentReason.trim()}
                  className="flex-1 py-2 rounded-lg bg-[#1f419a] text-white hover:bg-[#17357b] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {adjusting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Apply Adjustment"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction History Modal */}
      {viewingTransactions && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Transaction History</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {viewingTransactions.user?.display_name || "Unknown"} ({viewingTransactions.user?.email})
                  </p>
                  <p className="text-sm font-medium text-gray-700 mt-1">
                    Current Balance: ₦{(viewingTransactions.balance_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <button
                  onClick={() => setViewingTransactions(null)}
                  className="p-2 rounded-lg hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {viewingTransactions.transactions.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No transactions found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {viewingTransactions.transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              isCredit(tx)
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}>
                              {tx.type.replace("_", " ").toUpperCase()}
                            </span>
                            {tx.type === "admin_adjustment" && (
                              <span className="text-xs text-gray-500">Admin Action</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-900 font-medium">
                            {tx.description || "No description"}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(tx.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${
                            isCredit(tx)
                              ? "text-green-600"
                              : "text-red-600"
                          }`}>
                            {tx.amount_cents > 0 ? "+" : "-"}₦{(Math.abs(tx.amount_cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Balance: ₦{(tx.balance_after_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
