"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Award,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Gift,
  Loader2,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Shield,
  SlidersHorizontal,
  Target,
  UserCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const AUDIT_PAGE_SIZE = 8;

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
    mixpanel_configured?: boolean;
    steps: FunnelStep[];
  };
  attribution?: {
    top_sources: AttributionSource[];
  };
  rollout: RolloutStatus;
  settings: ReferralSettings;
  admin: {
    permissions: string[];
  };
};

type ReferralSettings = {
  profilePreferencesCompletedCredits: number;
  firstSubscriptionPurchasedCredits: number;
  autoApproveLowRiskRewards: boolean;
  metaPixelId: string;
  tiktokPixelId: string;
  googleTagId: string;
  googleTagManagerContainerId: string;
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
  referral?: {
    source: string | null;
    metadata: ReferralAttribution | null;
  } | null;
};

type ReferralAttribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landing_path?: string;
  signup_source?: string;
  attribution?: ReferralAttribution;
};

type AttributionSource = {
  source: string;
  label: string;
  count: number;
  top_campaign: string | null;
};

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  referral_id: string | null;
  reward_id: string | null;
  action: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  actor?: { email: string | null; display_name: string | null } | null;
};

type AuditPagination = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

type AmbassadorRow = {
  id: string;
  user_id: string;
  status: "active" | "paused" | "ended";
  contract_target_referrals: number;
  contract_target_subscriptions: number;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  referral_code: string | null;
  account: {
    email: string | null;
    display_name: string | null;
    tier: string | null;
  } | null;
  performance: {
    referrals: number;
    profile_rewards: number;
    subscription_conversions: number;
    approved_credits: number;
    referral_target_progress: number;
    subscription_target_progress: number;
  };
};

type AmbassadorSummary = {
  total: number;
  active: number;
  totalReferrals: number;
  totalSubscriptionConversions: number;
  totalCreditsAwarded: number;
};

type AmbassadorCandidate = {
  id: string;
  email: string | null;
  display_name: string | null;
  tier: string | null;
  ambassador_status: string | null;
};

type FunnelStep = {
  key: string;
  label: string;
  value: number;
  rate_label: string | null;
  rate: number | null;
  helper: string;
};

type RolloutCheck = {
  key: string;
  label: string;
  status: "ready" | "warning" | "blocked";
  detail: string;
};

type RolloutStatus = {
  status: "setup_required" | "pilot_ready" | "pilot_monitoring";
  readiness_percent: number;
  checks: RolloutCheck[];
  pilot: {
    referral_target: number;
    reward_review_window_days: number;
    current_referrals: number;
  };
};

type DashboardSection =
  | "overview"
  | "funnel"
  | "rewards"
  | "ambassadors"
  | "settings"
  | "tracking"
  | "audit"
  | "rollout";

const VALID_DASHBOARD_SECTIONS: DashboardSection[] = [
  "overview",
  "funnel",
  "rewards",
  "ambassadors",
  "settings",
  "tracking",
  "audit",
  "rollout",
];

const TIKTOK_EVENTS_MANAGER_URL =
  "https://ads.tiktok.com/i18n/events_manager/datasource/list?aadvid=7647568381838639120&org_id=7647568355013656592&open_from=ttam_nav";

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

function rolloutStatusLabel(status: RolloutStatus["status"]) {
  if (status === "setup_required") return "Setup required";
  if (status === "pilot_monitoring") return "Pilot monitoring";
  return "Pilot ready";
}

function rolloutStatusClass(status: RolloutStatus["status"]) {
  if (status === "setup_required") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "pilot_monitoring") return "bg-blue-50 text-blue-700 ring-blue-200";
  return "bg-green-50 text-green-700 ring-green-200";
}

function rolloutCheckClass(status: RolloutCheck["status"]) {
  if (status === "blocked") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "warning") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-green-50 text-green-700 ring-green-200";
}

function stepWidth(step: FunnelStep, maxValue: number) {
  return `${Math.max(5, Math.round((step.value / maxValue) * 100))}%`;
}

function extractTikTokPixelId(value: string) {
  const trimmed = value.trim();
  const loadMatch = trimmed.match(/ttq\.load\(\s*['"]([A-Za-z0-9_-]{8,80})['"]\s*\)/);
  if (loadMatch?.[1]) return loadMatch[1];

  const sdkMatch = trimmed.match(/[?&]sdkid=([A-Za-z0-9_-]{8,80})/);
  if (sdkMatch?.[1]) return sdkMatch[1];

  return trimmed;
}

function extractMetaPixelId(value: string) {
  const trimmed = value.trim();
  const matches = [
    ...trimmed.matchAll(/fbq\(\s*['"]init['"]\s*,\s*['"]([0-9]{5,30})['"]/g),
    ...trimmed.matchAll(/[?&]id=([0-9]{5,30})(?:&|$|["'])/g),
  ];

  return matches.at(-1)?.[1] ?? trimmed;
}

function hasValidMetaPixelId(value: string) {
  return /^[0-9]{5,30}$/.test(value.trim());
}

function hasValidTikTokPixelId(value: string) {
  return /^[A-Za-z0-9_-]{8,80}$/.test(value.trim());
}

function hasValidGoogleTagId(value: string) {
  return /^(G|AW|GT|DC)-[A-Za-z0-9_-]{3,80}$/.test(value.trim());
}

function hasValidGoogleTagManagerContainerId(value: string) {
  return /^GTM-[A-Za-z0-9_-]{3,80}$/.test(value.trim());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    referral_created: "Referral created",
    referral_reward_created: "Reward created",
    referral_reward_approved: "Reward approved",
    referral_reward_held: "Reward held",
    referral_reward_rejected: "Reward rejected",
    referral_settings_updated: "Settings updated",
    referral_ambassador_saved: "Ambassador saved",
    referral_ambassador_updated: "Ambassador updated",
  };
  return labels[action] || action.replace(/_/g, " ");
}

function auditSummary(log: AuditLogRow) {
  const meta = log.meta || {};
  if (log.action === "referral_settings_updated") {
    return "Reward credit settings were updated.";
  }
  if (typeof meta.credits_awarded === "number" && typeof meta.milestone === "string") {
    return `${meta.credits_awarded} credit(s) for ${milestoneLabel(meta.milestone)}.`;
  }
  if (typeof meta.referral_code === "string") {
    return `Referral code ${meta.referral_code} was used.`;
  }
  return "Referral activity recorded.";
}

function formatSourceName(value?: string | null) {
  if (!value) return "Direct / unknown";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getRewardAttribution(reward: RewardRow) {
  const metadata = reward.referral?.metadata || {};
  const nested =
    metadata.attribution && typeof metadata.attribution === "object"
      ? metadata.attribution
      : {};
  return {
    source:
      metadata.utm_source ||
      nested.utm_source ||
      metadata.signup_source ||
      nested.signup_source ||
      reward.referral?.source ||
      null,
    campaign: metadata.utm_campaign || nested.utm_campaign || null,
    medium: metadata.utm_medium || nested.utm_medium || null,
  };
}

export default function ReferralOperationsDashboard() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditPagination, setAuditPagination] = useState<AuditPagination>({
    page: 1,
    limit: AUDIT_PAGE_SIZE,
    total: 0,
    total_pages: 1,
  });
  const [auditPage, setAuditPage] = useState(1);
  const [ambassadors, setAmbassadors] = useState<AmbassadorRow[]>([]);
  const [ambassadorSummary, setAmbassadorSummary] =
    useState<AmbassadorSummary | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateResults, setCandidateResults] = useState<AmbassadorCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] =
    useState<AmbassadorCandidate | null>(null);
  const [ambassadorForm, setAmbassadorForm] = useState({
    contractTargetReferrals: 10,
    contractTargetSubscriptions: 2,
    notes: "",
  });
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const permissions = useMemo(
    () => new Set(overview?.admin.permissions || []),
    [overview]
  );
  const canManageSettings =
    permissions.has("*") || permissions.has("manage_referral_settings");
  const canManageRewards =
    permissions.has("*") || permissions.has("manage_referral_rewards");
  const trackingSettings = settings || overview?.settings;
  const configuredTrackingCount = [
    trackingSettings?.metaPixelId,
    trackingSettings?.tiktokPixelId,
    trackingSettings?.googleTagId,
    trackingSettings?.googleTagManagerContainerId,
  ].filter(Boolean).length;
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
  const sectionParam = searchParams.get("section") as DashboardSection | null;
  const activeSection = sectionParam && VALID_DASHBOARD_SECTIONS.includes(sectionParam)
    ? sectionParam
    : "overview";
  const auditTotalPages = Math.max(1, auditPagination.total_pages || 1);
  const auditStart = auditPagination.total === 0
    ? 0
    : (auditPagination.page - 1) * auditPagination.limit + 1;
  const auditEnd = Math.min(
    auditPagination.total,
    auditPagination.page * auditPagination.limit
  );

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
      const [overviewResponse, rewardsResponse, auditResponse, ambassadorResponse] = await Promise.all([
        authedFetch("/api/admin/referrals/overview"),
        authedFetch("/api/admin/referrals/rewards?limit=50"),
        authedFetch(
          `/api/admin/referrals/audit?limit=${AUDIT_PAGE_SIZE}&page=${auditPage}`
        ),
        authedFetch("/api/admin/referrals/ambassadors"),
      ]);

      if (!overviewResponse.ok) throw new Error("Unable to load referral overview.");
      if (!rewardsResponse.ok) throw new Error("Unable to load referral rewards.");
      if (!auditResponse.ok) throw new Error("Unable to load referral audit logs.");
      if (!ambassadorResponse.ok) throw new Error("Unable to load ambassadors.");

      const overviewPayload = (await overviewResponse.json()) as OverviewPayload;
      const rewardsPayload = (await rewardsResponse.json()) as { rewards: RewardRow[] };
      const auditPayload = (await auditResponse.json()) as {
        audit_logs: AuditLogRow[];
        pagination?: AuditPagination;
      };
      const ambassadorPayload = (await ambassadorResponse.json()) as {
        ambassadors: AmbassadorRow[];
        summary: AmbassadorSummary;
      };
      setOverview(overviewPayload);
      setSettings(overviewPayload.settings);
      setRewards(rewardsPayload.rewards || []);
      setAuditLogs(auditPayload.audit_logs || []);
      setAuditPagination(
        auditPayload.pagination || {
          page: auditPage,
          limit: AUDIT_PAGE_SIZE,
          total: auditPayload.audit_logs?.length || 0,
          total_pages: 1,
        }
      );
      setAmbassadors(ambassadorPayload.ambassadors || []);
      setAmbassadorSummary(ambassadorPayload.summary || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load referrals.");
    } finally {
      setLoading(false);
    }
  }, [auditPage, authedFetch]);

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

  const searchCandidates = async () => {
    setMessage(null);
    try {
      const response = await authedFetch(
        `/api/admin/referrals/ambassadors/candidates?search=${encodeURIComponent(candidateSearch)}`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to search users.");
      setCandidateResults(payload.users || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to search users.");
    }
  };

  const saveAmbassador = async () => {
    if (!selectedCandidate) {
      setMessage("Select a user before saving an Ambassador.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await authedFetch("/api/admin/referrals/ambassadors", {
        method: "POST",
        body: JSON.stringify({
          userId: selectedCandidate.id,
          status: "active",
          ...ambassadorForm,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to save Ambassador.");
      }
      setAmbassadors(payload.ambassadors || []);
      setAmbassadorSummary(payload.summary || null);
      setSelectedCandidate(null);
      setCandidateResults([]);
      setCandidateSearch("");
      setMessage("Ambassador saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save Ambassador.");
    } finally {
      setSaving(false);
    }
  };

  const updateAmbassadorStatus = async (
    ambassador: AmbassadorRow,
    status: AmbassadorRow["status"]
  ) => {
    setMessage(null);
    try {
      const response = await authedFetch("/api/admin/referrals/ambassadors", {
        method: "PATCH",
        body: JSON.stringify({
          ambassadorId: ambassador.id,
          status,
          contractTargetReferrals: ambassador.contract_target_referrals,
          contractTargetSubscriptions: ambassador.contract_target_subscriptions,
          startsAt: ambassador.starts_at,
          endsAt: ambassador.ends_at,
          notes: ambassador.notes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to update Ambassador.");
      }
      setAmbassadors(payload.ambassadors || []);
      setAmbassadorSummary(payload.summary || null);
      setMessage("Ambassador status updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update Ambassador.");
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
    <div className="space-y-5 p-5 lg:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-950">Referral System</h1>
            {overview?.funnel && (
              <span
                title={
                  overview.funnel.mixpanel_configured
                    ? "Database funnel and Mixpanel event tracking are available."
                    : "Database-backed funnel tracking is available. Mixpanel event forwarding can be configured separately."
                }
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

      {overview && activeSection === "rollout" && (
        <section className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#1f419a]">
                    <Rocket className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-semibold text-gray-950">Controlled rollout</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Pilot readiness for referral rewards, monitoring, and review controls.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Rollout status
                    </p>
                    <p className="mt-2 text-2xl font-bold text-gray-950">
                      {overview.rollout.readiness_percent}%
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${rolloutStatusClass(overview.rollout.status)}`}>
                    {rolloutStatusLabel(overview.rollout.status)}
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-[#1f419a]"
                    style={{ width: `${overview.rollout.readiness_percent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h3 className="font-semibold text-gray-950">Readiness checks</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Operational checks before expanding referral rewards beyond pilot users.
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {overview.rollout.checks.map((check) => (
                  <div key={check.key} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_110px] sm:items-center">
                    <div>
                      <p className="text-sm font-semibold text-gray-950">{check.label}</p>
                      <p className="mt-1 text-sm text-gray-500">{check.detail}</p>
                    </div>
                    <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 sm:justify-self-end ${rolloutCheckClass(check.status)}`}>
                      {check.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-950">Pilot window</h3>
                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-500">Pilot referrals</span>
                    <span className="text-sm font-semibold text-gray-950">
                      {overview.rollout.pilot.current_referrals} / {overview.rollout.pilot.referral_target}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-[#1f419a]"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (overview.rollout.pilot.current_referrals /
                              Math.max(overview.rollout.pilot.referral_target, 1)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Review window
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-950">
                      {overview.rollout.pilot.reward_review_window_days} days
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-gray-950">Launch guardrails</h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Pending rewards</span>
                    <span className="font-semibold text-gray-950">
                      {overview.metrics.pending_rewards}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Risk flags</span>
                    <span className="font-semibold text-gray-950">
                      {overview.metrics.risk_flags}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Credits awarded</span>
                    <span className="font-semibold text-gray-950">
                      {overview.metrics.approved_credits}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {overview && activeSection === "overview" && (
        <section className="space-y-4">
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
                <div key={label as string} className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label as string}</p>
                      <p className="mt-1.5 text-2xl font-bold text-gray-950">{String(value)}</p>
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

          <div className="grid auto-rows-min items-start gap-4 xl:grid-cols-12">
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm xl:col-span-7">
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-4 py-3.5">
                <div>
                  <h2 className="font-semibold text-gray-950">Product funnel</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Follow the referral path from signup through subscription.
                  </p>
                </div>
                <a
                  href="/growth-manager/dashboard?section=funnel"
                  className="text-sm font-semibold text-[#1f419a] hover:text-[#17357f]"
                >
                  View details
                </a>
              </div>
              <div className="space-y-3.5 p-4">
                {onboardingSteps.slice(0, 4).map((step) => (
                  <div key={step.key} className="grid gap-3 sm:grid-cols-[155px_1fr_90px] sm:items-center">
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
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <span className="text-sm font-bold text-gray-950">{step.value.toLocaleString()}</span>
                      {step.rate !== null && (
                        <span className="min-w-12 rounded-full bg-blue-50 px-2 py-0.5 text-center text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                          {step.rate}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 xl:col-span-5">
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-4 py-3.5">
                  <div>
                    <h2 className="font-semibold text-gray-950">Reward queue</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Recent reward decisions and items needing action.
                    </p>
                  </div>
                  <a
                    href="/growth-manager/dashboard?section=rewards"
                    className="text-sm font-semibold text-[#1f419a] hover:text-[#17357f]"
                  >
                    Open queue
                  </a>
                </div>
                <div className="divide-y divide-gray-100">
                  {rewards.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-500">
                      No referral rewards yet. New rewards will appear here when referred users complete eligible milestones.
                    </div>
                  ) : (
                    rewards.slice(0, 3).map((reward) => (
                      <div key={reward.id} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_90px_70px] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-950">
                            {reward.referrer?.display_name || reward.referrer?.email || "Referrer"}
                          </p>
                          <p className="mt-1 truncate text-xs text-gray-500">
                            {milestoneLabel(reward.milestone)} for {reward.referred_user?.display_name || reward.referred_user?.email || "referred user"}
                          </p>
                        </div>
                        <span className={`w-fit rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(reward.status)}`}>
                          {reward.status.replace(/_/g, " ")}
                        </span>
                        <span className="text-sm font-semibold text-gray-950 sm:text-right">
                          +{reward.credits_awarded}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-950">Rollout readiness</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {rolloutStatusLabel(overview.rollout.status)}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${rolloutStatusClass(overview.rollout.status)}`}>
                    {overview.rollout.readiness_percent}%
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-[#1f419a]"
                    style={{ width: `${overview.rollout.readiness_percent}%` }}
                  />
                </div>
                <div className="mt-4 space-y-3">
                  {overview.rollout.checks.slice(0, 3).map((check) => (
                    <div key={check.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600">{check.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1 ${rolloutCheckClass(check.status)}`}>
                        {check.status}
                      </span>
                    </div>
                  ))}
                </div>
                <a
                  href="/growth-manager/dashboard?section=rollout"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Review rollout
                </a>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white shadow-sm xl:col-span-8">
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-4 py-3.5">
                <div>
                  <h2 className="font-semibold text-gray-950">Ambassador performance</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Track selected users against referral and subscription targets.
                  </p>
                </div>
                <a
                  href="/growth-manager/dashboard?section=ambassadors"
                  className="text-sm font-semibold text-[#1f419a] hover:text-[#17357f]"
                >
                  Manage
                </a>
              </div>
              <div className="grid gap-0 sm:grid-cols-4">
                {[
                  ["Ambassadors", ambassadorSummary?.total || 0, "Tracked users"],
                  ["Active", ambassadorSummary?.active || 0, "Under contract"],
                  ["Referrals", ambassadorSummary?.totalReferrals || 0, "Generated"],
                  ["Subscriptions", ambassadorSummary?.totalSubscriptionConversions || 0, "Converted"],
                ].map(([label, value, helper]) => (
                  <div key={label as string} className="border-b border-gray-100 px-4 py-3.5 sm:border-b-0 sm:border-r sm:last:border-r-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {label as string}
                    </p>
                    <p className="mt-1.5 text-2xl font-bold text-gray-950">{String(value)}</p>
                    <p className="mt-1 text-xs text-gray-500">{helper as string}</p>
                  </div>
                ))}
              </div>
              {ambassadors.length > 0 ? (
                <div className="divide-y divide-gray-100 border-t border-gray-100">
                  {ambassadors.slice(0, 3).map((ambassador) => (
                    <div key={ambassador.id} className="grid gap-4 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_180px_180px_90px] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-950">
                          {ambassador.account?.display_name || ambassador.account?.email || "Ambassador"}
                        </p>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {ambassador.referral_code || "No referral code"}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-500">Referrals</span>
                          <span className="font-semibold text-gray-950">
                            {ambassador.performance.referrals} / {ambassador.contract_target_referrals}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-[#1f419a]"
                            style={{ width: `${ambassador.performance.referral_target_progress}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-500">Subscriptions</span>
                          <span className="font-semibold text-gray-950">
                            {ambassador.performance.subscription_conversions} / {ambassador.contract_target_subscriptions}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-green-500"
                            style={{ width: `${ambassador.performance.subscription_target_progress}%` }}
                          />
                        </div>
                      </div>
                      <span className={`w-fit rounded-full px-2 py-1 text-xs font-semibold capitalize ring-1 md:justify-self-end ${
                        ambassador.status === "active"
                          ? "bg-green-50 text-green-700 ring-green-200"
                          : ambassador.status === "paused"
                            ? "bg-amber-50 text-amber-700 ring-amber-200"
                            : "bg-gray-50 text-gray-600 ring-gray-200"
                      }`}>
                        {ambassador.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-t border-gray-100 px-4 py-5">
                  <p className="text-sm text-gray-500">
                    No Ambassadors are being tracked yet. Add contracted users so Growth Managers can monitor target performance.
                  </p>
                  <a
                    href="/growth-manager/dashboard?section=ambassadors"
                    className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#1f419a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17357f]"
                  >
                    Add Ambassador
                  </a>
                </div>
              )}
            </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm xl:col-span-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-950">Reward settings</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Current milestone credit rules.
                    </p>
                  </div>
                  <SlidersHorizontal className="h-5 w-5 text-[#1f419a]" />
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Profile + preferences</span>
                    <span className="font-semibold text-gray-950">
                      {settings?.profilePreferencesCompletedCredits ?? overview.settings.profilePreferencesCompletedCredits} credits
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">First subscription</span>
                    <span className="font-semibold text-gray-950">
                      {settings?.firstSubscriptionPurchasedCredits ?? overview.settings.firstSubscriptionPurchasedCredits} credits
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Low-risk auto approve</span>
                    <span className="font-semibold text-gray-950">
                      {(settings?.autoApproveLowRiskRewards ?? overview.settings.autoApproveLowRiskRewards) ? "On" : "Off"}
                    </span>
                  </div>
                </div>
                <a
                  href="/growth-manager/dashboard?section=settings"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-[#1f419a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#17357f]"
                >
                  Edit settings
                </a>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm xl:col-span-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-950">Tracking setup</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Ads and analytics IDs requested for Growth tracking.
                    </p>
                  </div>
                  <BarChart3 className="h-5 w-5 text-[#1f419a]" />
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  {[
                    ["Meta Pixel", trackingSettings?.metaPixelId],
                    ["TikTok Pixel", trackingSettings?.tiktokPixelId],
                    ["Google tag", trackingSettings?.googleTagId],
                    ["GTM container", trackingSettings?.googleTagManagerContainerId],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span className="text-gray-500">{label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                        value
                          ? "bg-green-50 text-green-700 ring-green-200"
                          : "bg-amber-50 text-amber-700 ring-amber-200"
                      }`}>
                        {value ? "Configured" : "Needed"}
                      </span>
                    </div>
                  ))}
                </div>
                <a
                  href="/growth-manager/dashboard?section=tracking"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Configure tracking
                </a>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm xl:col-span-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-950">Referral sources</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Top captured UTM/source channels from referred signups.
                    </p>
                  </div>
                  <Target className="h-5 w-5 text-[#1f419a]" />
                </div>
                <div className="mt-4 space-y-3">
                  {(overview.attribution?.top_sources || []).length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No campaign attribution has been captured yet.
                    </p>
                  ) : (
                    overview.attribution?.top_sources.map((source) => (
                      <div key={source.source} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-gray-900">
                            {source.label}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                            {source.count}
                          </span>
                        </div>
                        {source.top_campaign && (
                          <p className="mt-1 truncate text-xs text-gray-500">
                            Top campaign: {source.top_campaign}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

            <div className="rounded-lg border border-gray-200 bg-white shadow-sm xl:col-span-12">
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-4 py-3.5">
                <div>
                  <h2 className="font-semibold text-gray-950">Recent activity</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Latest referral events, settings changes, and reward decisions.
                  </p>
                </div>
                <a
                  href="/growth-manager/dashboard?section=audit"
                  className="text-sm font-semibold text-[#1f419a] hover:text-[#17357f]"
                >
                  Audit trail
                </a>
              </div>
              <div className="divide-y divide-gray-100">
                {auditLogs.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">
                    No referral audit history yet.
                  </div>
                ) : (
                  auditLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="grid gap-3 px-4 py-3.5 md:grid-cols-[220px_1fr_170px] md:items-center">
                      <div>
                        <p className="text-sm font-semibold text-gray-950">
                          {auditActionLabel(log.action)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {log.actor?.display_name || log.actor?.email || "System"}
                        </p>
                      </div>
                      <p className="text-sm text-gray-600">{auditSummary(log)}</p>
                      <p className="text-xs font-medium text-gray-500 md:text-right">
                        {formatDateTime(log.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {overview?.funnel && activeSection === "funnel" && (
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

      {activeSection === "rewards" && (
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
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Credits</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Risk</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rewards.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-gray-500" colSpan={8}>
                      No referral rewards yet.
                    </td>
                  </tr>
                ) : (
                  rewards.map((reward) => {
                    const attribution = getRewardAttribution(reward);
                    return (
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
                        <td className="px-5 py-3">
                          <div className="min-w-32">
                            <span className="rounded-full bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                              {formatSourceName(attribution.source)}
                            </span>
                            {attribution.campaign && (
                              <p className="mt-1 max-w-40 truncate text-xs text-gray-500">
                                {attribution.campaign}
                              </p>
                            )}
                          </div>
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "ambassadors" && (
        <section className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Ambassadors", ambassadorSummary?.total || 0, Award, "Tracked users"],
              ["Active", ambassadorSummary?.active || 0, UserCheck, "Currently contracted"],
              ["Referrals", ambassadorSummary?.totalReferrals || 0, Users, "From ambassadors"],
              [
                "Subscriptions",
                ambassadorSummary?.totalSubscriptionConversions || 0,
                Target,
                "Converted referrals",
              ],
            ].map(([label, value, Icon, helper]) => {
              const TypedIcon = Icon as typeof Award;
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

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="font-semibold text-gray-950">Ambassador performance</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Track selected users against referral and subscription targets.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-3">Ambassador</th>
                      <th className="px-5 py-3">Code</th>
                      <th className="px-5 py-3">Referral target</th>
                      <th className="px-5 py-3">Subscription target</th>
                      <th className="px-5 py-3">Credits</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ambassadors.length === 0 ? (
                      <tr>
                        <td className="px-5 py-10 text-center text-gray-500" colSpan={7}>
                          No Ambassadors have been added yet.
                        </td>
                      </tr>
                    ) : (
                      ambassadors.map((ambassador) => (
                        <tr key={ambassador.id} className="hover:bg-gray-50/70">
                          <td className="px-5 py-4">
                            <p className="font-semibold text-gray-950">
                              {ambassador.account?.display_name ||
                                ambassador.account?.email ||
                                "User"}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {ambassador.account?.email || "No email"}
                            </p>
                          </td>
                          <td className="px-5 py-4 font-medium text-gray-700">
                            {ambassador.referral_code || "No code"}
                          </td>
                          <td className="px-5 py-4">
                            <div className="min-w-40">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold text-gray-950">
                                  {ambassador.performance.referrals} / {ambassador.contract_target_referrals}
                                </span>
                                <span className="text-xs font-semibold text-blue-700">
                                  {ambassador.performance.referral_target_progress}%
                                </span>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className="h-full rounded-full bg-[#1f419a]"
                                  style={{
                                    width: `${ambassador.performance.referral_target_progress}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="min-w-40">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold text-gray-950">
                                  {ambassador.performance.subscription_conversions} / {ambassador.contract_target_subscriptions}
                                </span>
                                <span className="text-xs font-semibold text-blue-700">
                                  {ambassador.performance.subscription_target_progress}%
                                </span>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className="h-full rounded-full bg-green-500"
                                  style={{
                                    width: `${ambassador.performance.subscription_target_progress}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 font-semibold text-gray-950">
                            {ambassador.performance.approved_credits}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ring-1 ${
                              ambassador.status === "active"
                                ? "bg-green-50 text-green-700 ring-green-200"
                                : ambassador.status === "paused"
                                  ? "bg-amber-50 text-amber-700 ring-amber-200"
                                  : "bg-gray-50 text-gray-600 ring-gray-200"
                            }`}>
                              {ambassador.status}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {canManageSettings ? (
                              <select
                                value={ambassador.status}
                                onChange={(event) =>
                                  updateAmbassadorStatus(
                                    ambassador,
                                    event.target.value as AmbassadorRow["status"]
                                  )
                                }
                                className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 outline-none focus:border-[#1f419a]"
                              >
                                <option value="active">Active</option>
                                <option value="paused">Paused</option>
                                <option value="ended">Ended</option>
                              </select>
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
            </div>

            <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-gray-950">Add Ambassador</h2>
              <p className="mt-1 text-sm text-gray-500">
                Select an existing MatchIndeed user and set contract targets.
              </p>
              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Search user
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={candidateSearch}
                      onChange={(event) => setCandidateSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          searchCandidates();
                        }
                      }}
                      className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[#1f419a]"
                      placeholder="Name or email"
                    />
                    <button
                      onClick={searchCandidates}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                      type="button"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {candidateResults.length > 0 && (
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100">
                    {candidateResults.map((candidate) => {
                      const selected = selectedCandidate?.id === candidate.id;
                      return (
                        <button
                          key={candidate.id}
                          onClick={() => setSelectedCandidate(candidate)}
                          className={`block w-full border-b border-gray-100 px-3 py-3 text-left last:border-b-0 ${
                            selected ? "bg-blue-50" : "hover:bg-gray-50"
                          }`}
                          type="button"
                        >
                          <p className="text-sm font-semibold text-gray-950">
                            {candidate.display_name || candidate.email || "User"}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {candidate.email || "No email"}
                          </p>
                          {candidate.ambassador_status && (
                            <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                              Existing Ambassador: {candidate.ambassador_status}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">
                    Referral target
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={ambassadorForm.contractTargetReferrals}
                    onChange={(event) =>
                      setAmbassadorForm({
                        ...ambassadorForm,
                        contractTargetReferrals: Number(event.target.value),
                      })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[#1f419a]"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">
                    Subscription target
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={ambassadorForm.contractTargetSubscriptions}
                    onChange={(event) =>
                      setAmbassadorForm({
                        ...ambassadorForm,
                        contractTargetSubscriptions: Number(event.target.value),
                      })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-[#1f419a]"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-gray-700">
                    Contract notes
                  </span>
                  <textarea
                    value={ambassadorForm.notes}
                    onChange={(event) =>
                      setAmbassadorForm({
                        ...ambassadorForm,
                        notes: event.target.value,
                      })
                    }
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1f419a]"
                    placeholder="Optional target details"
                  />
                </label>

                <button
                  onClick={saveAmbassador}
                  disabled={!canManageSettings || saving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f419a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#17357f] disabled:cursor-not-allowed disabled:opacity-50"
                  type="button"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
                  Save Ambassador
                </button>
              </div>
            </aside>
          </div>
        </section>
      )}

      {activeSection === "settings" && (
        <section className="max-w-2xl rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
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
        </section>
      )}

      {activeSection === "tracking" && (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-950">Tracking pixels</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Configure the IDs needed for Meta, TikTok, Google Ads, and GA4 tracking.
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                configuredTrackingCount >= 3
                  ? "bg-green-50 text-green-700 ring-green-200"
                  : "bg-amber-50 text-amber-700 ring-amber-200"
              }`}>
                {configuredTrackingCount} of 4 configured
              </span>
            </div>
          </div>

          {settings && (
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-4 p-5">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">
                      Meta / Facebook Pixel ID
                    </span>
                    <div className="relative mt-1">
                      <input
                        disabled={!canManageSettings}
                        value={settings.metaPixelId}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            metaPixelId: extractMetaPixelId(event.target.value),
                          })
                        }
                        className="h-10 w-full rounded-lg border border-gray-200 px-3 pr-10 text-sm outline-none focus:border-[#1f419a]"
                        placeholder="Example: 123456789012345"
                      />
                      {hasValidMetaPixelId(settings.metaPixelId) && (
                        <CheckCircle2
                          aria-label="Meta Pixel ID format verified"
                          className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600"
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Paste the Pixel ID only. If you paste full Meta base code,
                      the dashboard will extract the ID from fbq(&quot;init&quot;, ...).
                    </p>
                    <a
                      href="https://business.facebook.com/events_manager"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex text-xs font-semibold text-[#1f419a] hover:text-[#17357f]"
                    >
                      Open Meta Events Manager
                    </a>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">
                      TikTok Pixel ID
                    </span>
                    <div className="relative mt-1">
                      <input
                        disabled={!canManageSettings}
                        value={settings.tiktokPixelId}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            tiktokPixelId: extractTikTokPixelId(event.target.value),
                          })
                        }
                        className="h-10 w-full rounded-lg border border-gray-200 px-3 pr-10 text-sm outline-none focus:border-[#1f419a]"
                        placeholder="Example: D8HF70RC77UE8A9K664G"
                      />
                      {hasValidTikTokPixelId(settings.tiktokPixelId) && (
                        <CheckCircle2
                          aria-label="TikTok Pixel ID format verified"
                          className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600"
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Paste the Pixel ID only. If you paste the full TikTok base code, the dashboard will extract the ID from ttq.load(...).
                    </p>
                    <a
                      href={TIKTOK_EVENTS_MANAGER_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex text-xs font-semibold text-[#1f419a] hover:text-[#17357f]"
                    >
                      Open client TikTok Events Manager
                    </a>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">
                      Google tag ID
                    </span>
                    <div className="relative mt-1">
                      <input
                        disabled={!canManageSettings}
                        value={settings.googleTagId}
                        onChange={(event) =>
                          setSettings({ ...settings, googleTagId: event.target.value })
                        }
                        className="h-10 w-full rounded-lg border border-gray-200 px-3 pr-10 text-sm outline-none focus:border-[#1f419a]"
                        placeholder="Example: G-XXXXXXXX or AW-XXXXXXXX"
                      />
                      {hasValidGoogleTagId(settings.googleTagId) && (
                        <CheckCircle2
                          aria-label="Google tag ID format verified"
                          className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600"
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Use a GA4 Measurement ID or Google Ads tag ID for website measurement.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <a
                        href="https://analytics.google.com/analytics/web/#/admin/datastreams"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-[#1f419a] hover:text-[#17357f]"
                      >
                        Open GA4 Data Streams
                      </a>
                      <a
                        href="https://ads.google.com/aw/conversions"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-[#1f419a] hover:text-[#17357f]"
                      >
                        Open Google Ads Conversions
                      </a>
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">
                      Google Tag Manager container ID
                    </span>
                    <div className="relative mt-1">
                      <input
                        disabled={!canManageSettings}
                        value={settings.googleTagManagerContainerId}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            googleTagManagerContainerId: event.target.value,
                          })
                        }
                        className="h-10 w-full rounded-lg border border-gray-200 px-3 pr-10 text-sm outline-none focus:border-[#1f419a]"
                        placeholder="Example: GTM-XXXXXXX"
                      />
                      {hasValidGoogleTagManagerContainerId(
                        settings.googleTagManagerContainerId
                      ) && (
                        <CheckCircle2
                          aria-label="Google Tag Manager container ID format verified"
                          className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600"
                        />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Optional central container for managing Meta, TikTok, and Google tags.
                    </p>
                    <a
                      href="https://tagmanager.google.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex text-xs font-semibold text-[#1f419a] hover:text-[#17357f]"
                    >
                      Open Google Tag Manager
                    </a>
                  </label>

                  <button
                    onClick={saveSettings}
                    disabled={!canManageSettings || saving}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f419a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#17357f] disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save tracking setup
                  </button>
              </div>

              <aside className="border-t border-gray-100 bg-gray-50 p-5 lg:border-l lg:border-t-0">
                <h3 className="text-sm font-semibold text-gray-950">Setup checklist</h3>
                <div className="mt-4 space-y-4 text-sm">
                  <div>
                    <p className="font-semibold text-gray-800">Meta Pixel</p>
                    <p className="mt-1 text-gray-500">
                      Create a web pixel in Meta Events Manager, copy the Pixel ID, then verify with Meta Pixel Helper.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">TikTok Pixel</p>
                    <p className="mt-1 text-gray-500">
                      Create a Web data connection in TikTok Events Manager, install base code or GTM, then test events.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">Google tag</p>
                    <p className="mt-1 text-gray-500">
                      Add one Google tag to every page and configure conversion events separately.
                    </p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-white p-3 text-xs text-amber-800">
                    Saving IDs enables base page-view tracking. Custom conversion events still need a separate rollout.
                  </div>
                </div>
              </aside>
            </div>
          )}
        </section>
      )}

      {activeSection === "audit" && (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold text-gray-950">Audit trail</h2>
              <p className="mt-1 text-sm text-gray-500">
                Recent referral setting changes, reward approvals, holds, rejections, and system events.
              </p>
            </div>
            <div className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200">
              {auditPagination.total} event{auditPagination.total === 1 ? "" : "s"}
            </div>
          </div>
          <div className="max-h-[calc(100vh-280px)] min-h-[320px] overflow-y-auto divide-y divide-gray-100">
            {auditLogs.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-500">
                No referral audit history yet.
              </div>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="grid gap-3 px-5 py-4 hover:bg-gray-50/70 md:grid-cols-[220px_1fr_190px] md:items-center">
                  <div>
                    <p className="text-sm font-semibold text-gray-950">
                      {auditActionLabel(log.action)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {log.actor?.display_name || log.actor?.email || "System"}
                    </p>
                  </div>
                  <p className="text-sm text-gray-600">{auditSummary(log)}</p>
                  <p className="text-xs font-medium text-gray-500 md:text-right">
                    {formatDateTime(log.created_at)}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500">
              {auditPagination.total === 0
                ? "Showing 0 audit events"
                : `Showing ${auditStart} to ${auditEnd} of ${auditPagination.total}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAuditPage((page) => Math.max(1, page - 1))}
                disabled={auditPage <= 1 || loading}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous audit page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-24 text-center text-sm font-medium text-gray-700">
                Page {auditPagination.page} of {auditTotalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setAuditPage((page) => Math.min(auditTotalPages, page + 1))
                }
                disabled={auditPage >= auditTotalPages || loading}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next audit page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
