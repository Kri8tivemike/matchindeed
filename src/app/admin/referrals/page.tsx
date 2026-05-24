"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Gift,
  Loader2,
  RefreshCw,
  Save,
  Shield,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type OverviewPayload = {
  metrics: {
    total_referrals: number;
    active_codes: number;
    pending_rewards: number;
    approved_rewards: number;
    approved_credits: number;
    risk_flags: number;
  };
  settings: ReferralSettings;
  admin: {
    permissions: string[];
  };
};

type ReferralSettings = {
  profilePreferencesCompletedCredits: number;
  firstSubscriptionPurchasedCredits: number;
  autoApproveLowRiskRewards: boolean;
};

type RewardRow = {
  id: string;
  milestone: string;
  credits_awarded: number;
  status: string;
  risk_level: string;
  risk_reasons: string[];
  created_at: string;
  referrer?: { email: string | null; display_name: string | null } | null;
  referred_user?: { email: string | null; display_name: string | null } | null;
};

function milestoneLabel(value: string) {
  if (value === "profile_preferences_completed") return "Profile + preferences";
  if (value === "first_subscription_purchased") return "First subscription";
  return value.replace(/_/g, " ");
}

function statusClass(status: string) {
  if (status === "approved") return "bg-green-50 text-green-700 ring-green-200";
  if (status === "rejected") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "held") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-blue-50 text-blue-700 ring-blue-200";
}

export default function AdminReferralsPage() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const permissions = useMemo(
    () => new Set(overview?.admin.permissions || []),
    [overview]
  );
  const canManageSettings =
    permissions.has("*") || permissions.has("manage_referral_settings");
  const canManageRewards =
    permissions.has("*") || permissions.has("manage_referral_rewards");

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Admin session missing.");
    return fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...(init?.headers || {}),
      },
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [overviewResponse, rewardsResponse] = await Promise.all([
        authedFetch("/api/admin/referrals/overview"),
        authedFetch("/api/admin/referrals/rewards?limit=50"),
      ]);

      if (!overviewResponse.ok) throw new Error("Unable to load referral overview.");
      if (!rewardsResponse.ok) throw new Error("Unable to load referral rewards.");

      const overviewPayload = (await overviewResponse.json()) as OverviewPayload;
      const rewardsPayload = (await rewardsResponse.json()) as { rewards: RewardRow[] };
      setOverview(overviewPayload);
      setSettings(overviewPayload.settings);
      setRewards(rewardsPayload.rewards || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load referrals.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await authedFetch("/api/admin/referrals/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to save settings.");
      setSettings(payload.settings);
      setOverview((current) =>
        current ? { ...current, settings: payload.settings } : current
      );
      setMessage("Referral settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const runRewardAction = async (
    rewardId: string,
    action: "approve" | "hold" | "reject"
  ) => {
    setMessage(null);
    try {
      const response = await authedFetch(
        `/api/admin/referrals/rewards/${action}`,
        {
          method: "POST",
          body: JSON.stringify({ reward_id: rewardId }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Unable to ${action} reward.`);
      await loadData();
      setMessage(`Reward ${action} action completed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to ${action} reward.`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Referral System</h1>
          <p className="text-gray-500">
            Manage invited users, reward credits, fraud review, and Growth Manager settings.
          </p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          type="button"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {message && (
        <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {message}
        </div>
      )}

      {overview && (
        <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Total referrals", overview.metrics.total_referrals, Users],
            ["Active codes", overview.metrics.active_codes, Gift],
            ["Pending rewards", overview.metrics.pending_rewards, AlertTriangle],
            ["Approved rewards", overview.metrics.approved_rewards, CheckCircle2],
            ["Credits awarded", overview.metrics.approved_credits, Gift],
            ["Risk flags", overview.metrics.risk_flags, Shield],
          ].map(([label, value, Icon]) => {
            const TypedIcon = Icon as typeof Gift;
            return (
              <div key={label as string} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">{label as string}</p>
                  <TypedIcon className="h-5 w-5 text-[#1f419a]" />
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900">{String(value)}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Reward ledger</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">Referrer</th>
                  <th className="px-5 py-3">Referred user</th>
                  <th className="px-5 py-3">Milestone</th>
                  <th className="px-5 py-3">Credits</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Risk</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rewards.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-gray-500" colSpan={7}>
                      No referral rewards yet.
                    </td>
                  </tr>
                ) : (
                  rewards.map((reward) => (
                    <tr key={reward.id}>
                      <td className="px-5 py-3 text-gray-700">
                        {reward.referrer?.display_name || reward.referrer?.email || "User"}
                      </td>
                      <td className="px-5 py-3 text-gray-700">
                        {reward.referred_user?.display_name || reward.referred_user?.email || "User"}
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {milestoneLabel(reward.milestone)}
                      </td>
                      <td className="px-5 py-3 text-gray-700">+{reward.credits_awarded}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(reward.status)}`}>
                          {reward.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3 capitalize text-gray-700">{reward.risk_level}</td>
                      <td className="px-5 py-3">
                        {canManageRewards && !["approved", "rejected"].includes(reward.status) ? (
                          <div className="flex gap-2">
                            <button onClick={() => runRewardAction(reward.id, "approve")} className="rounded-md border border-green-200 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50" type="button">Approve</button>
                            <button onClick={() => runRewardAction(reward.id, "hold")} className="rounded-md border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50" type="button">Hold</button>
                            <button onClick={() => runRewardAction(reward.id, "reject")} className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50" type="button">Reject</button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">No action</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-semibold text-gray-900">Reward settings</h2>
          <p className="mt-1 text-sm text-gray-500">
            Growth Managers can adjust the credits awarded for each referral milestone.
          </p>

          {settings && (
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  Profile + preferences reward
                </span>
                <input
                  type="number"
                  min={1}
                  disabled={!canManageSettings}
                  value={settings.profilePreferencesCompletedCredits}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      profilePreferencesCompletedCredits: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1f419a]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  First subscription reward
                </span>
                <input
                  type="number"
                  min={1}
                  disabled={!canManageSettings}
                  value={settings.firstSubscriptionPurchasedCredits}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      firstSubscriptionPurchasedCredits: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1f419a]"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  disabled={!canManageSettings}
                  checked={settings.autoApproveLowRiskRewards}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      autoApproveLowRiskRewards: event.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-[#1f419a]"
                />
                Auto-approve low-risk rewards
              </label>
              <button
                onClick={saveSettings}
                disabled={!canManageSettings || saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f419a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#17357f] disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save settings
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
