"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  COORDINATOR_DASHBOARD_PATH,
  COORDINATOR_LOGIN_PATH,
} from "@/lib/coordinator/path";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Loader2,
  AlertCircle,
  CheckCircle,
  KeyRound,
  Copy,
  RefreshCw,
  Trash2,
  ArrowRight,
} from "lucide-react";
import Image from "next/image";
import NextLink from "next/link";

type NextLinkProps = ComponentProps<typeof NextLink>;

type TotpFactor = {
  id: string;
  status: string;
  friendly_name?: string | null;
  created_at?: string;
};

type RecoveryStatus = {
  has_recovery_code: boolean;
  active: boolean;
  created_at: string | null;
  used_at: string | null;
};

const MFA_FRIENDLY_NAME = "MatchIndeed Coordinator";

function Link({ prefetch, ...props }: NextLinkProps) {
  return <NextLink {...props} prefetch={prefetch ?? false} />;
}

function formatDateTime(value: string | null) {
  if (!value) return "Not available";

  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function isDuplicateFactorNameError(error: { message?: string } | null) {
  return /friendly name.*already exists|already exists/i.test(
    error?.message || ""
  );
}

function isMissingFactorError(error: { message?: string } | null) {
  return /not found|does not exist/i.test(error?.message || "");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function CoordinatorMfaSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initializingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingRecovery, setGeneratingRecovery] = useState(false);
  const [removingRecovery, setRemovingRecovery] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [verifiedFactor, setVerifiedFactor] = useState<TotpFactor | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const recovered = searchParams.get("recovered") === "true";

  useEffect(() => {
    if (recovered) {
      setNotice(
        "Your recovery code was accepted. For safety, your previous authenticator was reset. Scan the new QR code below to secure this coordinator account again."
      );
    }
  }, [recovered]);

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || null;
  };

  const authorizedFetch = async (input: string, init: RequestInit = {}) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error("Your session expired. Please sign in again.");
    }

    return fetch(input, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });
  };

  const unenrollUnverifiedFactors = async (factors: TotpFactor[]) => {
    let removed = false;

    for (const factor of factors) {
      if (factor.status === "verified") continue;

      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: factor.id,
      });

      if (unenrollError && !isMissingFactorError(unenrollError)) {
        throw new Error(
          "An unfinished 2FA setup already exists and could not be reset. Please refresh and try again."
        );
      }

      removed = true;
    }

    if (removed) {
      await wait(400);
    }
  };

  const enrollTotpFactor = async (friendlyName = MFA_FRIENDLY_NAME) =>
    supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName,
    });

  const loadRecoveryStatus = async () => {
    try {
      const response = await authorizedFetch("/api/coordinator/mfa/recovery-code");
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to load recovery code status."
        );
      }

      setRecoveryStatus(payload as RecoveryStatus);
    } catch (statusError) {
      console.error("Failed to load recovery status:", statusError);
      setRecoveryStatus(null);
    }
  };

  const initializePage = async () => {
    if (initializingRef.current) return;
    initializingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push(COORDINATOR_LOGIN_PATH);
        return;
      }

      const permissionsResponse = await authorizedFetch("/api/coordinator/permissions");
      const permissionsPayload = await permissionsResponse.json().catch(() => ({}));
      if (!permissionsResponse.ok) {
        setError(
          typeof permissionsPayload.error === "string"
            ? permissionsPayload.error
            : "Unable to verify coordinator permissions."
        );
        setLoading(false);
        return;
      }

      const permissions = Array.isArray(permissionsPayload.permissions)
        ? permissionsPayload.permissions.map(String)
        : [];
      if (!permissions.includes("manage_2fa_auth")) {
        setError("You don't have permission to manage coordinator 2FA setup.");
        setLoading(false);
        return;
      }

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        setError("Failed to load MFA factors. Please refresh and try again.");
        setLoading(false);
        return;
      }

      const initialTotpFactors = ((factors?.totp || []) as TotpFactor[]) || [];
      const verified = initialTotpFactors.find(
        (factor) => factor.status === "verified"
      );

      if (verified) {
        setVerifiedFactor(verified);
        setQrCode(null);
        setSecret(null);
        setFactorId(null);
      } else {
        await unenrollUnverifiedFactors(initialTotpFactors);

        const { data: refreshedFactors, error: refreshedFactorsError } =
          await supabase.auth.mfa.listFactors();
        if (refreshedFactorsError) {
          setError("Failed to refresh MFA factors. Please refresh and try again.");
          setLoading(false);
          return;
        }

        const refreshedTotpFactors =
          ((refreshedFactors?.totp || []) as TotpFactor[]) || [];
        const verifiedAfterReset = refreshedTotpFactors.find(
          (factor) => factor.status === "verified"
        );

        if (verifiedAfterReset) {
          setVerifiedFactor(verifiedAfterReset);
          setQrCode(null);
          setSecret(null);
          setFactorId(null);
          await loadRecoveryStatus();
          return;
        }

        let { data, error: enrollError } = await enrollTotpFactor();

        if (enrollError && isDuplicateFactorNameError(enrollError)) {
          await unenrollUnverifiedFactors(refreshedTotpFactors);
          const fallbackName = `${MFA_FRIENDLY_NAME} ${Date.now().toString(36)}`;
          const retryResult = await enrollTotpFactor(fallbackName);
          data = retryResult.data;
          enrollError = retryResult.error;
        }

        if (enrollError || !data) {
          setError(
            enrollError?.message ||
              "Failed to start MFA enrollment. Please refresh and try again."
          );
          setLoading(false);
          return;
        }

        setVerifiedFactor(null);
        setFactorId(data.id);
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
      }

      await loadRecoveryStatus();
    } catch (initError) {
      console.error("MFA setup initialization error:", initError);
      setError(
        initError instanceof Error
          ? initError.message
          : "An unexpected error occurred while loading 2FA setup."
      );
    } finally {
      initializingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    initializePage();
    // initializePage is intentionally re-used by action handlers and only needs
    // the mount-time execution here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (!factorId) {
        setError("Enrollment data is missing. Please refresh and try again.");
        setSubmitting(false);
        return;
      }

      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });

      if (challengeError) {
        setError("Failed to create a verification challenge.");
        setSubmitting(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: totpCode,
      });

      if (verifyError) {
        setError("Invalid code. Make sure your authenticator app is synced and try again.");
        setTotpCode("");
        setSubmitting(false);
        return;
      }

      setTotpCode("");
      setNotice(
        "Two-factor authentication is now enabled. Generate a recovery code now so you always have a fallback sign-in path."
      );
      await initializePage();
    } catch (verifyError) {
      console.error("MFA verification error:", verifyError);
      setError("Verification failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateRecoveryCode = async () => {
    setError(null);
    setGeneratingRecovery(true);

    try {
      const response = await authorizedFetch("/api/coordinator/mfa/recovery-code", {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to generate a recovery code."
        );
        setGeneratingRecovery(false);
        return;
      }

      setRecoveryCode(payload.recovery_code);
      setRecoveryStatus({
        has_recovery_code: true,
        active: true,
        created_at: payload.created_at,
        used_at: null,
      });
      setNotice(
        "A new recovery code has been generated. It replaces any earlier code and is shown only once."
      );
    } catch (recoveryError) {
      console.error("Recovery code generation error:", recoveryError);
      setError("Failed to generate a recovery code.");
    } finally {
      setGeneratingRecovery(false);
    }
  };

  const handleRemoveRecoveryCode = async () => {
    setError(null);
    setRemovingRecovery(true);

    try {
      const response = await authorizedFetch("/api/coordinator/mfa/recovery-code", {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to remove the recovery code."
        );
        setRemovingRecovery(false);
        return;
      }

      setRecoveryCode(null);
      setRecoveryStatus({
        has_recovery_code: false,
        active: false,
        created_at: null,
        used_at: null,
      });
      setNotice("The current recovery code has been removed.");
    } catch (recoveryError) {
      console.error("Recovery code removal error:", recoveryError);
      setError("Failed to remove the recovery code.");
    } finally {
      setRemovingRecovery(false);
    }
  };

  const handleDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDisabling(true);

    try {
      if (!verifiedFactor) {
        setError("There is no verified authenticator to disable.");
        setDisabling(false);
        return;
      }

      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: verifiedFactor.id });

      if (challengeError) {
        setError("Failed to start the disable confirmation step.");
        setDisabling(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: verifiedFactor.id,
        challengeId: challengeData.id,
        code: disableCode,
      });

      if (verifyError) {
        setError("The authenticator code is invalid. Please try again.");
        setDisableCode("");
        setDisabling(false);
        return;
      }

      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: verifiedFactor.id,
      });

      if (unenrollError) {
        setError("Failed to disable two-factor authentication.");
        setDisabling(false);
        return;
      }

      await supabase.auth.refreshSession();

      try {
        await authorizedFetch("/api/coordinator/mfa/recovery-code", {
          method: "DELETE",
        });
      } catch (cleanupError) {
        console.warn("Recovery code cleanup after disable failed:", cleanupError);
      }

      setDisableCode("");
      setRecoveryCode(null);
      setRecoveryStatus(null);
      setNotice(
        "Two-factor authentication has been disabled. A fresh QR code is ready below if you want to re-enable it now."
      );
      await initializePage();
    } catch (disableError) {
      console.error("MFA disable error:", disableError);
      setError("Failed to disable two-factor authentication.");
    } finally {
      setDisabling(false);
    }
  };

  const handleCopyRecoveryCode = async () => {
    if (!recoveryCode) return;

    try {
      await navigator.clipboard.writeText(recoveryCode);
      setNotice("Recovery code copied to clipboard.");
    } catch {
      setNotice("Unable to copy automatically. Please copy the recovery code manually.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="text-gray-600">Loading 2FA setup...</p>
        </div>
      </div>
    );
  }

  const mfaEnabled = !!verifiedFactor;
  const recoveryActive = !!recoveryStatus?.active;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <div className="rounded-3xl border border-[#dbe4ff] bg-gradient-to-br from-white via-[#f8fbff] to-[#eef4ff] p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1f419a] to-[#2a44a3] shadow-lg shadow-blue-200/60 sm:h-14 sm:w-14">
                <Shield className="h-6 w-6 text-white sm:h-7 sm:w-7" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5874bf]">
                  Coordinator Security
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">
                  Two-Factor Authentication
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Protect coordinator access with an authenticator app and a one-time
                  recovery code. If a recovery code is used at sign-in, the old
                  authenticator is reset and must be enrolled again.
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
              <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                  Status
                </p>
                <p className={`mt-1 text-sm font-semibold ${mfaEnabled ? "text-emerald-700" : "text-amber-700"}`}>
                  {mfaEnabled ? "2FA Enabled" : "Setup Required"}
                </p>
              </div>

              <Link
                href={COORDINATOR_DASHBOARD_PATH}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1f419a] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-200/70 transition hover:opacity-95"
              >
                Go to Coordinator Panel
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {notice && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
            <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p className="text-sm">{notice}</p>
          </div>
        )}

        {mfaEnabled ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
            <div className="space-y-4">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                      <ShieldCheck className="h-4 w-4" />
                      Authenticator active
                    </div>
                    <h2 className="mt-4 text-xl font-semibold text-slate-900">
                      Recovery code
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                      Keep one one-time recovery code somewhere safe. If you lose
                      access to your authenticator app, that code will sign you in
                      and reset the current authenticator so you can enroll a new one.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm md:w-56 md:flex-shrink-0">
                    <p className="text-slate-400 uppercase tracking-[0.14em] text-xs">
                      Recovery status
                    </p>
                    <p className={`mt-1 font-semibold ${recoveryActive ? "text-emerald-700" : "text-amber-700"}`}>
                      {recoveryActive ? "Active recovery code" : "No active recovery code"}
                    </p>
                    <p className="mt-1 text-slate-500">
                      {recoveryStatus?.created_at
                        ? `Generated ${formatDateTime(recoveryStatus.created_at)}`
                        : "Generate one now for a fallback sign-in option."}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={handleGenerateRecoveryCode}
                    disabled={generatingRecovery}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1f419a] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-200/70 transition hover:opacity-95 disabled:opacity-50 sm:w-auto"
                  >
                    {generatingRecovery ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {recoveryActive ? "Replace recovery code" : "Generate recovery code"}
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveRecoveryCode}
                    disabled={removingRecovery || !recoveryStatus?.has_recovery_code}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 disabled:opacity-40 sm:w-auto"
                  >
                    {removingRecovery ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Remove recovery code
                  </button>
                </div>

                {recoveryCode && (
                  <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                      Shown once
                    </p>
                    <p className="mt-2 text-sm text-amber-900">
                      Save this code now. For security, you will not be able to view
                      this exact code again after leaving this screen.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <code className="break-all text-sm font-semibold tracking-[0.18em] text-slate-900 sm:text-base sm:tracking-[0.2em]">
                        {recoveryCode}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyRecoveryCode}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:w-auto"
                      >
                        <Copy className="h-4 w-4" />
                        Copy code
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-4">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-lg font-semibold text-slate-900">Current setup</h2>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Factor name
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {verifiedFactor.friendly_name || "MatchIndeed Coordinator"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Recovery code
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {recoveryActive ? "Ready to use once" : "Not generated yet"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {recoveryStatus?.created_at
                        ? `Generated ${formatDateTime(recoveryStatus.created_at)}`
                        : "Generate one from the left panel."}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-red-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50">
                    <ShieldOff className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Disable 2FA
                    </h2>
                    <p className="mt-1.5 text-sm text-slate-600">
                      Confirm with a fresh 6-digit authenticator code. The
                      current recovery code will be removed too.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleDisableMfa} className="mt-4 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Confirm with authenticator code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-center font-mono text-lg tracking-[0.4em] outline-none transition focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/15 sm:text-xl"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={disabling || disableCode.length !== 6}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {disabling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldOff className="h-4 w-4" />
                    )}
                    Disable two-factor authentication
                  </button>
                </form>
              </section>
            </div>
          </div>
        ) : (
          <div className="grid gap-3.5 md:grid-cols-[minmax(270px,0.84fr)_minmax(0,1.16fr)]">
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
                <KeyRound className="h-4 w-4" />
                Setup required
              </div>
              <h2 className="mt-3 text-lg font-semibold text-slate-900 sm:text-xl">
                Scan this QR code
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">
                Use Google Authenticator, Authy, or 1Password to scan the QR code
                and generate a 6-digit code.
              </p>

              {qrCode && (
                <div className="mt-4 flex justify-center">
                  <div className="rounded-[1.75rem] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                    <Image
                      src={qrCode}
                      alt="Scan this QR code with your authenticator app"
                      width={224}
                      height={224}
                      className="h-36 w-36 sm:h-44 sm:w-44"
                      unoptimized
                    />
                  </div>
                </div>
              )}

              {secret && (
                <details className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Can&apos;t scan? Enter the key manually
                  </summary>
                  <code className="mt-3 block break-all rounded-2xl bg-white px-4 py-3 text-xs leading-5 text-slate-700">
                    {secret}
                  </code>
                </details>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
                Confirm and enable 2FA
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">
                After your authenticator app starts generating codes for MatchIndeed,
                enter the current 6-digit code below to finish setup.
              </p>

              <form onSubmit={handleVerify} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Authenticator code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    required
                    autoFocus
                    className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-center font-mono text-lg tracking-[0.35em] outline-none transition focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/15 sm:text-xl"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || totpCode.length !== 6}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1f419a] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-200/70 transition hover:opacity-95 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Confirm and enable MFA
                </button>
              </form>

              <div className="mt-4 rounded-3xl border border-blue-200 bg-blue-50 p-3.5 sm:p-4">
                <p className="text-sm font-medium text-blue-900">
                  What happens next?
                </p>
                <p className="mt-2 text-sm text-blue-800">
                  Once this factor is verified, you can generate a one-time recovery
                  code on this page. That code becomes your fallback if the phone
                  running your authenticator app is unavailable.
                </p>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
