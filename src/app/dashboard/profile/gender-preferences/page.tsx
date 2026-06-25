"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle,
  Clock,
  Eye,
  Loader2,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";

type GenderChangeStatus = {
  canChange: boolean;
  latestChangedAt: string | null;
  nextEligibleAt: string | null;
  pauseUntil: string | null;
  status: string | null;
  approvalNotes: string | null;
  restoredAt: string | null;
};

type GenderPreferencesPayload = {
  success?: boolean;
  error?: string;
  code?: string;
  nextEligibleAt?: string | null;
  profile?: {
    gender: string | null;
    firstName: string | null;
  };
  preferences?: {
    partnerGenderPreference: string | null;
  };
  genderChangeStatus?: GenderChangeStatus;
};

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

const SHOW_ME_OPTIONS = [
  { value: "female", label: "Women" },
  { value: "male", label: "Men" },
] as const;

function formatGender(value: string | null | undefined) {
  if (!value) return "Not set";
  const found = GENDER_OPTIONS.find((option) => option.value === value);
  return found?.label || value.replace(/_/g, " ");
}

function formatShowMe(value: string | null | undefined) {
  if (value === "male") return "Men";
  if (value === "female") return "Women";
  return "Not set";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Your session has expired. Please log in again.");
  }
  return session.access_token;
}

export default function GenderPreferencesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingShowMe, setSavingShowMe] = useState(false);
  const [submittingGender, setSubmittingGender] = useState(false);
  const [profileGender, setProfileGender] = useState<string | null>(null);
  const [showMe, setShowMe] = useState<string | null>(null);
  const [status, setStatus] = useState<GenderChangeStatus | null>(null);
  const [selectedGender, setSelectedGender] = useState<string>("");
  const [verificationStatement, setVerificationStatement] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/profile/gender-preferences", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await response.json().catch(() => null)) as
        | GenderPreferencesPayload
        | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to load gender preferences.");
      }

      setProfileGender(payload.profile?.gender || null);
      setShowMe(payload.preferences?.partnerGenderPreference || null);
      setStatus(payload.genderChangeStatus || null);
      setSelectedGender(payload.profile?.gender || "");
    } catch (error) {
      console.error("[gender-preferences] load failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const changeLocked = Boolean(status && !status.canChange);
  const pendingApproval =
    status?.status === "pending_verification" || status?.status === "pending_approval";
  const approvedWaiting = status?.status === "approved" && !status.restoredAt;
  const rejected = status?.status === "rejected";
  const nextEligibleDate = formatDate(status?.nextEligibleAt);
  const pauseUntilDate = formatDate(status?.pauseUntil);

  const canSubmitGender = useMemo(() => {
    return (
      selectedGender &&
      selectedGender !== profileGender &&
      !changeLocked &&
      !pendingApproval &&
      verificationStatement.trim().length >= 20
    );
  }, [changeLocked, pendingApproval, profileGender, selectedGender, verificationStatement]);

  const updateShowMe = async (value: string) => {
    setSavingShowMe(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/profile/gender-preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ partnerGenderPreference: value }),
      });
      const payload = (await response.json().catch(() => null)) as
        | GenderPreferencesPayload
        | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to update Show Me.");
      }
      setShowMe(value);
      toast.success("Show Me preference updated.");
    } catch (error) {
      console.error("[gender-preferences] show me update failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update Show Me.");
    } finally {
      setSavingShowMe(false);
    }
  };

  const submitGenderChange = async () => {
    setSubmittingGender(true);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/profile/gender-preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          gender: selectedGender,
          verificationStatement,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | GenderPreferencesPayload
        | null;

      if (response.status === 429 && payload?.code === "GENDER_CHANGE_COOLDOWN") {
        const date = formatDate(payload.nextEligibleAt);
        throw new Error(
          `Gender can only be changed once every 90 days.${
            date ? ` You can change it again on ${date}.` : ""
          }`
        );
      }

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to submit gender change.");
      }

      setProfileGender(payload.profile?.gender || selectedGender);
      setShowMe(payload.preferences?.partnerGenderPreference || showMe);
      setStatus(payload.genderChangeStatus || null);
      setVerificationStatement("");
      toast.warning(
        "Your profile is hidden while your gender change is reviewed and matches refresh."
      );
    } catch (error) {
      console.error("[gender-preferences] gender submit failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to submit gender change.");
    } finally {
      setSubmittingGender(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8 lg:py-7 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:block lg:w-[260px] xl:w-[280px]">
          <Sidebar active="gender-preferences" />
        </aside>

        <main className="min-w-0 pb-8">
          <div className="mb-5 flex items-center gap-3">
            <Link
              href="/dashboard/profile/my-account"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              aria-label="Back to account settings"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-950">
                Gender & Preferences
              </h1>
              <p className="text-sm text-slate-500">
                Manage your gender setting and who you want to see.
              </p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                      <Users className="h-4 w-4 text-[#1f419a]" />
                      Show Me
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      This can be changed instantly and does not require review.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {formatShowMe(showMe)}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {SHOW_ME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={savingShowMe}
                      onClick={() => updateShowMe(option.value)}
                      className={`rounded-xl border px-4 py-3 text-left font-semibold transition ${
                        showMe === option.value
                          ? "border-[#1f419a] bg-[#eef2ff] text-[#1f419a]"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                      } disabled:opacity-50`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                    <BadgeCheck className="h-4 w-4 text-[#1f419a]" />
                    Change Gender
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Gender changes are limited to once every 90 days and require review.
                  </p>
                </div>

                {changeLocked && (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Gender can only be changed once every 90 days.
                    {nextEligibleDate ? ` You can change it again on ${nextEligibleDate}.` : ""}
                  </div>
                )}

                {pendingApproval && (
                  <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    Your profile is hidden while this change waits for admin approval.
                    {pauseUntilDate ? ` The 24-hour pause ends on ${pauseUntilDate}.` : ""}
                  </div>
                )}

                {approvedWaiting && (
                  <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    Your change has been approved. Your profile will become visible after the
                    24-hour pause ends.
                  </div>
                )}

                {rejected && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    This gender change was rejected.
                    {status?.approvalNotes ? ` Note: ${status.approvalNotes}` : " Please contact support for help."}
                  </div>
                )}

                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  {GENDER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={changeLocked || pendingApproval || approvedWaiting}
                      onClick={() => setSelectedGender(option.value)}
                      className={`rounded-xl border px-4 py-3 text-left font-semibold transition ${
                        selectedGender === option.value
                          ? "border-[#1f419a] bg-[#eef2ff] text-[#1f419a]"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <label className="mb-1 block text-sm font-semibold text-slate-700">
                  Verification statement
                </label>
                <textarea
                  value={verificationStatement}
                  onChange={(event) => setVerificationStatement(event.target.value)}
                  rows={5}
                  disabled={changeLocked || pendingApproval || approvedWaiting}
                  placeholder="Explain why this gender setting should be updated. This is reviewed by MatchIndeed support."
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#1f419a] disabled:bg-slate-100"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Minimum 20 characters. Your profile is hidden after submission.
                </p>

                <button
                  type="button"
                  onClick={submitGenderChange}
                  disabled={!canSubmitGender || submittingGender}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1f419a] px-5 py-3 text-sm font-semibold text-white hover:bg-[#17357b] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingGender ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Submit for Review
                </button>
              </div>
            </section>

            <aside className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-950">
                  <Eye className="h-4 w-4 text-[#1f419a]" />
                  Current Settings
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                    <span className="text-slate-500">Gender</span>
                    <span className="font-semibold text-slate-900">
                      {formatGender(profileGender)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                    <span className="text-slate-500">Show Me</span>
                    <span className="font-semibold text-slate-900">
                      {formatShowMe(showMe)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-950">
                  <Clock className="h-4 w-4 text-[#1f419a]" />
                  Review Status
                </h2>
                {status?.latestChangedAt ? (
                  <div className="space-y-3 text-sm text-slate-700">
                    <p>
                      <span className="font-medium">Latest change:</span>{" "}
                      {formatDate(status.latestChangedAt)}
                    </p>
                    <p>
                      <span className="font-medium">Status:</span>{" "}
                      {(status.status || "cooldown").replace(/_/g, " ")}
                    </p>
                    {status.pauseUntil && (
                      <p>
                        <span className="font-medium">Pause until:</span>{" "}
                        {formatDate(status.pauseUntil)}
                      </p>
                    )}
                    {status.nextEligibleAt && (
                      <p>
                        <span className="font-medium">Next eligible:</span>{" "}
                        {formatDate(status.nextEligibleAt)}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    No prior gender change request found.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-base font-semibold text-slate-950">
                  Safety Rules
                </h2>
                <div className="space-y-2 text-sm text-slate-600">
                  <p className="flex gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-green-600" />
                    One gender change is allowed every 90 days.
                  </p>
                  <p className="flex gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-green-600" />
                    Profile visibility pauses for 24 hours after a change.
                  </p>
                  <p className="flex gap-2">
                    <XCircle className="mt-0.5 h-4 w-4 text-red-500" />
                    Show Me changes do not require review.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
