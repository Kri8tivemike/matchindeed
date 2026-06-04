"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  CreditCard,
  Gift,
  Loader2,
  RefreshCw,
  Save,
  Shield,
  UserCheck,
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
  funnel: {
    source: "database";
    analytics_configured: boolean;
    steps: FunnelStep[];
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

type FunnelStep = {
  key: string;
  label: string;
  value: number;
  rate_label: string | null;
  rate: number | null;
  helper: string;
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

function riskClass(riskLevel: string) {
  if (riskLevel === "high") return "bg-red-50 text-red-700 ring-red-200";
  if (riskLevel === "medium") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-green-50 text-green-700 ring-green-200";
}

function stepWidth(step: FunnelStep, maxValue: number) {
  return `${Math.max(5, Math.round((step.value / maxValue) * 100))}%`;
}

export default function ReferralOperationsDashboard() {
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
  const funnelSteps = useMemo(
    () => overview?.funnel.steps || [],
    [overview?.funnel.steps]
  );
  const maxFunnelValue = useMemo(
    () => Math.max(...funnelSteps.map((step) => step.value), 1),
    [funnelSteps]
  );
  const stepByKey = useMemo(
    () =>
      new Map(
        funnelSteps.map((step) => [step.key, step])
      ),
    [funnelSteps]
  );
  const onboardingSteps = [
    "signup_completed",
    "profile_completed",
    "preferences_completed",
    "subscription_purchased",
  ]
    .map((key) => stepByKey.get(key))
    .filter(Boolean) as FunnelStep[];
  const rewardStep = stepByKey.get("referral_reward_earned");
  const meetingSteps = ["meeting_requested", "meeting_booked"]
    .map((key) => stepByKey.get(key))
    .filter(Boolean) as FunnelStep[];

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
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-950">Referral System</h1>
            {overview?.funnel && (
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                  overview.funnel.analytics_configured
                    ? "bg-green-50 text-green-700 ring-green-200"
                    : "bg-amber-50 text-amber-700 ring-amber-200"
                }`}
              >
                Analytics {overview.funnel.analytics_configured ? "configured" : "not configured"}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Monitor invite conversion, approve referral credits, and manage reward rules.
          </p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          type="button"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {message && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {message}
        </div>
      )}

      {overview && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {[
            ["Total referrals", overview.metrics.total_referrals, Users, "Invited users"],
            ["Active codes", overview.metrics.active_codes, Gift, "Live referral codes"],
            ["Pending rewards", overview.metrics.pending_rewards, Clock, "Need review"],
            ["Approved rewards", overview.metrics.approved_rewards, CheckCircle2, "Completed decisions"],
            ["Credits awarded", overview.metrics.approved_credits, CreditCard, "Booking credits"],
            ["Risk flags", overview.metrics.risk_flags, Shield, "Fraud signals"],
          ].map(([label, value, Icon, helper]) => {
            const TypedIcon = Icon as typeof Gift;
            return (
              <div key={label as string} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label as string}</p>
                    <p className="mt-2 text-2xl font-bold text-gray-950">{String(value)}</p>
                    <p className="mt-1 text-xs text-gray-500">{helper as string}</p>
                  </div>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#1f419a]">
                    <TypedIcon className="h-4 w-4" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {overview?.funnel && (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-gray-950">Core product funnel</h2>
              <p className="text-sm text-gray-500">Referral eligibility depends on profile completion and first subscription progress.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
              <BarChart3 className="h-3.5 w-3.5" />
              Database source
            </span>
          </div>
          <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <div className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-[#1f419a]" />
                <h3 className="text-sm font-semibold text-gray-950">User onboarding milestones</h3>
              </div>
              <div className="space-y-4">
                {onboardingSteps.map((step, index) => (
                  <div key={step.key}>
                    <div className="grid gap-3 sm:grid-cols-[170px_1fr_110px] sm:items-center">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{step.label}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{step.helper}</p>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-[#1f419a]"
                          style={{ width: stepWidth(step, maxFunnelValue) }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <span className="text-lg font-bold text-gray-950">{step.value.toLocaleString()}</span>
                        {step.rate !== null && (
                          <span className="min-w-14 rounded-full bg-blue-50 px-2 py-1 text-center text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                            {step.rate}%
                          </span>
                        )}
                      </div>
                    </div>
                    {index < onboardingSteps.length - 1 && (
                      <div className="ml-2 mt-3 h-px bg-gray-100" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 lg:border-l lg:border-t-0">
              <div className="border-b border-gray-100 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Gift className="h-4 w-4 text-[#1f419a]" />
                  <h3 className="text-sm font-semibold text-gray-950">Reward health</h3>
                </div>
                {rewardStep && (
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{rewardStep.label}</p>
                        <p className="mt-1 text-xs text-gray-500">{rewardStep.helper}</p>
                      </div>
                      <span className="text-2xl font-bold text-gray-950">{rewardStep.value.toLocaleString()}</span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{ width: stepWidth(rewardStep, maxFunnelValue) }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#1f419a]" />
                  <h3 className="text-sm font-semibold text-gray-950">Meeting activity</h3>
                </div>
                <div className="space-y-4">
                  {meetingSteps.map((step) => (
                    <div key={step.key}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{step.label}</p>
                          <p className="mt-1 text-xs text-gray-500">{step.helper}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-gray-950">{step.value.toLocaleString()}</p>
                          {step.rate !== null && (
                            <p className="text-xs font-semibold text-blue-700">{step.rate}% {step.rate_label}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-[#1f419a]"
                          style={{ width: stepWidth(step, maxFunnelValue) }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-950">Reward ledger</h2>
            <p className="mt-1 text-sm text-gray-500">Latest referral reward decisions and review status.</p>
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
                    <tr key={reward.id} className="hover:bg-gray-50/70">
                      <td className="px-5 py-3 font-medium text-gray-800">
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
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ring-1 ${riskClass(reward.risk_level)}`}>
                          {reward.risk_level || "low"}
                        </span>
                      </td>
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

        <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-950">Reward settings</h2>
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
                  className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[#1f419a]"
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
                  className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[#1f419a]"
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
