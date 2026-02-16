"use client";

/**
 * AdminActivityLimitsPage — Manage Activity Rate Limits per Tier
 *
 * Allows admins to view and edit the daily, weekly, and monthly
 * limits for winks, likes, and interested actions across all tiers.
 *
 * Features:
 * - Visual grid of limit cards per tier
 * - Inline editing with save per tier
 * - Reset all tiers to defaults
 * - Color-coded tier indicators
 * - 0 = unlimited indicator
 */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Loader2,
  RefreshCw,
  Save,
  RotateCcw,
  Eye,
  Heart,
  MessageCircle,
  Crown,
  Shield,
  Star,
  Zap,
  Check,
  AlertCircle,
  Infinity as InfinityIcon,
} from "lucide-react";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type TierLimits = {
  tier: string;
  winks_per_day: number;
  winks_per_week: number;
  winks_per_month: number;
  likes_per_day: number;
  likes_per_week: number;
  likes_per_month: number;
  interesteds_per_day: number;
  interesteds_per_week: number;
  interesteds_per_month: number;
  [key: string]: string | number;
};

// ---------------------------------------------------------------
// Tier styling config
// ---------------------------------------------------------------

const TIER_CONFIG: Record<
  string,
  {
    label: string;
    icon: React.ReactNode;
    color: string;
    bg: string;
    border: string;
    gradient: string;
  }
> = {
  basic: {
    label: "Basic",
    icon: <Shield className="h-5 w-5" />,
    color: "text-gray-700",
    bg: "bg-gray-50",
    border: "border-gray-200",
    gradient: "from-gray-100 to-gray-50",
  },
  standard: {
    label: "Standard",
    icon: <Star className="h-5 w-5" />,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    gradient: "from-blue-100 to-blue-50",
  },
  premium: {
    label: "Premium",
    icon: <Zap className="h-5 w-5" />,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    gradient: "from-amber-100 to-amber-50",
  },
  vip: {
    label: "VIP",
    icon: <Crown className="h-5 w-5" />,
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    gradient: "from-purple-100 to-purple-50",
  },
};

// ---------------------------------------------------------------
// Activity type config
// ---------------------------------------------------------------

const ACTIVITY_TYPES = [
  {
    key: "winks",
    label: "Winks",
    icon: <Eye className="h-4 w-4" />,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    key: "likes",
    label: "Likes",
    icon: <Heart className="h-4 w-4" />,
    color: "text-red-600",
    bg: "bg-red-50",
  },
  {
    key: "interesteds",
    label: "Interested",
    icon: <MessageCircle className="h-4 w-4" />,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
];

const PERIODS = ["day", "week", "month"] as const;

// ---------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------

export default function AdminActivityLimitsPage() {
  const [limits, setLimits] = useState<TierLimits[]>([]);
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<TierLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Show toast with auto-dismiss
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  /**
   * Fetch all activity limits from API
   */
  const fetchLimits = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/admin/activity-limits", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setLimits(json.limits || []);
      } else {
        showToast("Failed to load limits", "error");
      }
    } catch (err) {
      console.error("Error fetching limits:", err);
      showToast("Failed to load limits", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLimits();
  }, [fetchLimits]);

  /**
   * Start editing a tier
   */
  const startEditing = (tier: TierLimits) => {
    setEditingTier(tier.tier);
    setEditValues({ ...tier });
  };

  /**
   * Cancel editing
   */
  const cancelEditing = () => {
    setEditingTier(null);
    setEditValues(null);
  };

  /**
   * Update a single field value during editing
   */
  const updateField = (field: string, value: string) => {
    if (!editValues) return;
    const numVal = value === "" ? 0 : parseInt(value, 10);
    if (isNaN(numVal) || numVal < 0) return;
    setEditValues({ ...editValues, [field]: numVal });
  };

  /**
   * Save edited limits for a tier
   */
  const saveEdits = async () => {
    if (!editValues || !editingTier) return;

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/admin/activity-limits", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(editValues),
      });

      if (res.ok) {
        showToast(`${TIER_CONFIG[editingTier]?.label || editingTier} limits saved`);
        setEditingTier(null);
        setEditValues(null);
        await fetchLimits();
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to save", "error");
      }
    } catch (err) {
      console.error("Error saving limits:", err);
      showToast("Failed to save limits", "error");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Reset all tiers to default limits
   */
  const resetAll = async () => {
    if (!confirm("Reset all tier limits to their default values? This cannot be undone.")) {
      return;
    }

    setResetting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/admin/activity-limits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "reset_all" }),
      });

      if (res.ok) {
        showToast("All tiers reset to defaults");
        await fetchLimits();
      } else {
        showToast("Failed to reset", "error");
      }
    } catch (err) {
      console.error("Error resetting limits:", err);
      showToast("Failed to reset limits", "error");
    } finally {
      setResetting(false);
    }
  };

  /**
   * Render a single limit value (display mode)
   */
  const renderValue = (val: number) => {
    if (val === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-sm">
          <InfinityIcon className="h-3.5 w-3.5" />
          Unlimited
        </span>
      );
    }
    return <span className="font-semibold text-gray-900 text-sm">{val}</span>;
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {toast.type === "success" ? (
            <Check className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="h-6 w-6 text-[#1f419a]" />
            Activity Limits
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure daily, weekly, and monthly limits for winks, likes, and
            interested actions per subscription tier. Set to 0 for unlimited.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetAll}
            disabled={resetting || !!editingTier}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 text-sm"
          >
            <RotateCcw
              className={`h-4 w-4 ${resetting ? "animate-spin" : ""}`}
            />
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={fetchLimits}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 text-sm"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">How limits work</p>
          <p className="mt-1 text-blue-700">
            Each user&apos;s activity (winks, likes, interested) is checked against
            their tier&apos;s limits before the action is allowed. If a limit is
            reached, the user sees a &quot;limit reached&quot; message. Setting a value
            to <strong>0 means unlimited</strong> — the user can perform that
            action without restriction.
          </p>
        </div>
      </div>

      {/* Tier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {limits.map((tierLimits) => {
          const config = TIER_CONFIG[tierLimits.tier] || TIER_CONFIG.basic;
          const isEditing = editingTier === tierLimits.tier;
          const currentValues = isEditing ? editValues! : tierLimits;

          return (
            <div
              key={tierLimits.tier}
              className={`bg-white rounded-xl shadow-sm border ${config.border} overflow-hidden`}
            >
              {/* Tier Header */}
              <div
                className={`bg-gradient-to-r ${config.gradient} px-5 py-4 flex items-center justify-between border-b ${config.border}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-9 w-9 rounded-lg ${config.bg} flex items-center justify-center ${config.color}`}
                  >
                    {config.icon}
                  </div>
                  <div>
                    <h2 className={`font-bold ${config.color}`}>
                      {config.label} Tier
                    </h2>
                    <p className="text-xs text-gray-500">
                      Activity rate limits
                    </p>
                  </div>
                </div>

                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => startEditing(tierLimits)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEdits}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1f419a] text-white hover:bg-[#17357b] transition disabled:opacity-50 flex items-center gap-1"
                    >
                      {saving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      Save
                    </button>
                  </div>
                )}
              </div>

              {/* Limits Grid */}
              <div className="p-5">
                <div className="grid grid-cols-1 gap-4">
                  {ACTIVITY_TYPES.map((activity) => (
                    <div key={activity.key}>
                      {/* Activity type label */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`${activity.color}`}>
                          {activity.icon}
                        </span>
                        <span className="text-sm font-semibold text-gray-700">
                          {activity.label}
                        </span>
                      </div>

                      {/* Period values */}
                      <div className="grid grid-cols-3 gap-3">
                        {PERIODS.map((period) => {
                          const field = `${activity.key}_per_${period}`;
                          const value = (currentValues[field] as number) || 0;

                          return (
                            <div
                              key={period}
                              className={`rounded-lg p-3 ${
                                isEditing ? "bg-gray-50 border border-gray-200" : "bg-gray-50"
                              }`}
                            >
                              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                                Per {period}
                              </p>
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={value}
                                  onChange={(e) =>
                                    updateField(field, e.target.value)
                                  }
                                  className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1f419a] focus:border-transparent"
                                />
                              ) : (
                                renderValue(value)
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Reference */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Quick Reference
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          {limits.map((t) => {
            const config = TIER_CONFIG[t.tier] || TIER_CONFIG.basic;
            const totalDaily =
              (t.winks_per_day || 0) +
              (t.likes_per_day || 0) +
              (t.interesteds_per_day || 0);
            const hasUnlimited =
              t.winks_per_day === 0 ||
              t.likes_per_day === 0 ||
              t.interesteds_per_day === 0;

            return (
              <div
                key={t.tier}
                className={`rounded-lg p-3 ${config.bg} border ${config.border}`}
              >
                <p className={`font-bold ${config.color}`}>{config.label}</p>
                <p className="text-gray-600 mt-1">
                  {hasUnlimited ? (
                    <span className="text-emerald-600">Has unlimited actions</span>
                  ) : (
                    <>
                      {totalDaily} actions/day total
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
