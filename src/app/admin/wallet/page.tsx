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
} from "lucide-react";
import Link from "next/link";

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

  /**
   * Fetch all wallets - ensures fresh data from database
   */
  const fetchWallets = async () => {
    setLoading(true);
    try {
      // First verify admin status
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data: account } = await supabase
          .from("accounts")
          .select("role, email")
          .eq("id", authUser.id)
          .single();
        console.log("[Admin Wallet] Current admin user:", {
          id: authUser.id,
          email: account?.email,
          role: account?.role,
        });
      }

      // Use a fresh query with explicit timestamp to avoid caching
      // RLS policy should allow admins to see all wallets
      const { data: walletsData, error: walletsError } = await supabase
        .from("wallets")
        .select(`
          user_id,
          balance_cents,
          updated_at
        `)
        .order("updated_at", { ascending: false });

      // If the join fails, try fetching accounts separately
      if (walletsData && walletsData.length > 0) {
        const userIds = walletsData.map(w => w.user_id);
        const { data: accountsData } = await supabase
          .from("accounts")
          .select("id, email, display_name")
          .in("id", userIds);

        // Merge accounts data with wallets
        const walletsWithAccounts = walletsData.map(wallet => ({
          ...wallet,
          accounts: accountsData?.find(a => a.id === wallet.user_id) || null,
        }));

        // Update walletsData to include accounts
        walletsData.forEach((wallet, index) => {
          walletsData[index] = walletsWithAccounts[index];
        });
      }

      if (walletsError) {
        console.error("[Admin Wallet] Error fetching wallets:", walletsError);
        console.error("[Admin Wallet] Error details:", {
          code: walletsError.code,
          message: walletsError.message,
          details: walletsError.details,
          hint: walletsError.hint,
        });
        return;
      }

      console.log("[Admin Wallet] Wallet details:", walletsData?.map(w => {
        const wExt = w as { user_id: string; balance_cents: number; accounts?: { email?: string } | { email?: string }[] | null };
        return {
          user_id: w.user_id,
          email: Array.isArray(wExt.accounts) ? wExt.accounts[0]?.email : wExt.accounts?.email,
          balance: w.balance_cents,
        };
      }));

      // Process wallets - handle cases where accounts might be null or array
      const walletsWithTransactions = await Promise.all(
        (walletsData || []).map(async (wallet: any) => {
          // Handle accounts data - could be array, object, or null
          let userData = null;
          if (wallet.accounts) {
            if (Array.isArray(wallet.accounts)) {
              userData = wallet.accounts[0] || null;
            } else {
              userData = wallet.accounts;
            }
          }

          // If no account data, try to fetch it separately (admin should have access)
          if (!userData) {
            console.log("[Admin Wallet] Account data missing for wallet:", wallet.user_id, "fetching separately");
            const { data: account, error: accountError } = await supabase
              .from("accounts")
              .select("email, display_name")
              .eq("id", wallet.user_id)
              .single();

            if (accountError) {
              console.warn("[Admin Wallet] Could not fetch account for wallet:", wallet.user_id, accountError);
              userData = {
                email: `User ${wallet.user_id.substring(0, 8)}...`,
                display_name: "Unknown",
              };
            } else {
              userData = account;
            }
          }

          // Fetch recent transactions for each wallet
          const { data: transactions } = await supabase
            .from("wallet_transactions")
            .select("*")
            .eq("user_id", wallet.user_id)
            .order("created_at", { ascending: false })
            .limit(10);

          return {
            user_id: wallet.user_id,
            balance_cents: wallet.balance_cents || 0,
            user: userData,
            transactions: transactions || [],
          };
        })
      );

      console.log("[Admin Wallet] Processed wallets:", walletsWithTransactions.length);
      setWallets(walletsWithTransactions);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallets();
  }, []);

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
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
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

      const adjustmentInCents = adjustmentAmount;

      console.log("[Admin Wallet] Adjusting wallet:", {
        userId: selectedWallet.user_id,
        currentBalance,
        adjustmentAmount: adjustmentInCents,
        calculatedBalance,
        newBalance,
        adminId: user.id,
      });

      // Update wallet balance
      const { error: walletError } = await supabase
        .from("wallets")
        .upsert({
          user_id: selectedWallet.user_id,
          balance_cents: newBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (walletError) {
        console.error("[Admin Wallet] Error updating wallet:", walletError);
        throw walletError;
      }

      const adjustmentDirection = adjustmentInCents > 0 ? "Added" : "Removed";
      const adjustmentAbs = Math.abs(adjustmentInCents);

      const { error: transError } = await supabase
        .from("wallet_transactions")
        .insert({
          user_id: selectedWallet.user_id,
          type: "admin_adjustment",
          amount_cents: adjustmentAbs,
          balance_before_cents: currentBalance,
          balance_after_cents: newBalance,
          description: `Admin ${adjustmentDirection}: ₦${(adjustmentAbs / 100).toFixed(2)} - ${adjustmentReason}${calculatedBalance < 0 ? ` (Balance capped at ₦0.00)` : ""}`,
          admin_id: user.id,
          reference_id: `admin_adjustment_${Date.now()}_${user.id}`,
        });

      if (transError) {
        console.error("[Admin Wallet] Error creating transaction:", transError);
        await supabase
          .from("wallets")
          .upsert({
            user_id: selectedWallet.user_id,
            balance_cents: currentBalance,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        throw transError;
      }

      try {
        const { error: logError } = await supabase.from("admin_logs").insert({
          admin_id: user.id,
          target_user_id: selectedWallet.user_id,
          action: "wallet_adjusted",
          meta: {
            adjustment_cents: adjustmentInCents,
            old_balance_cents: currentBalance,
            new_balance_cents: newBalance,
            reason: adjustmentReason,
          },
        });

        if (logError) {
          console.warn("[Admin Wallet] Could not log admin action (table may not exist):", logError);
        }
      } catch (logErr) {
        console.warn("[Admin Wallet] Admin log error (non-critical):", logErr);
      }

      setAdjustmentAmount(0);
      setAdjustmentReason("");
      setSelectedWallet(null);
      await fetchWallets();
      toast.success(`Wallet adjusted successfully! New balance: ₦${(newBalance / 100).toLocaleString()}`);
    } catch (error: unknown) {
      console.error("[Admin Wallet] Error adjusting wallet:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to adjust wallet: ${msg}`);
    }
  };

  const filteredWallets = wallets.filter(wallet => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      wallet.user?.email?.toLowerCase().includes(query) ||
      wallet.user?.display_name?.toLowerCase().includes(query)
    );
  });

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance_cents, 0);

  /** Determine if a transaction is a credit (green) or debit (red) using amount_cents */
  const isCredit = (tx: { type: string; amount_cents: number }) =>
    tx.type === "topup" ||
    tx.type === "refund" ||
    (tx.type === "admin_adjustment" && tx.amount_cents > 0);

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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recent Transactions</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredWallets.map((wallet) => (
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
                          href={`/admin/users/${wallet.user_id}`}
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