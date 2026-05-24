"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LifeBuoy,
  Lock,
  Mail,
  ShieldCheck,
  TrendingUp,
  Loader2,
} from "lucide-react";
import CloudflareTurnstile from "@/components/CloudflareTurnstile";
import { supabase } from "@/lib/supabase";
import { adminPath, ADMIN_MFA_SETUP_PATH } from "@/lib/admin/path";
import { COORDINATOR_LOGIN_PATH } from "@/lib/coordinator/path";

type MfaMode = "totp" | "recovery";

const REFERRAL_PERMISSIONS = new Set([
  "view_referrals",
  "manage_referral_rewards",
  "manage_referral_settings",
  "review_referral_fraud",
]);

export default function GrowthManagerLoginPage() {
  return (
    <Suspense fallback={<GrowthManagerLoginLoading />}>
      <GrowthManagerLoginContent />
    </Suspense>
  );
}

function GrowthManagerLoginLoading() {
  return (
    <div className="min-h-screen bg-[#f6f8fc] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
        <p className="text-sm text-gray-600">Loading Growth Manager login...</p>
      </div>
    </div>
  );
}

function GrowthManagerLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const handleTurnstileVerify = useCallback((token: string) => setTurnstileToken(token), []);

  const [mfaStep, setMfaStep] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaMode, setMfaMode] = useState<MfaMode>("totp");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");

  const queryError = (() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "unauthorized") {
      return "This account does not have Growth Manager referral access.";
    }
    if (errorParam === "use_coordinator_login") {
      return "This account is set up for coordinator access. Use the coordinator login page instead.";
    }
    return null;
  })();
  const displayedError = error ?? queryError;
  const recoveryMode = mfaMode === "recovery";

  useEffect(() => {
    const handleLogout = async () => {
      if (searchParams.get("logout") === "true") {
        await supabase.auth.signOut();
      }
    };

    handleLogout();
  }, [searchParams]);

  const resetMfaState = () => {
    setMfaStep(false);
    setMfaFactorId(null);
    setMfaMode("totp");
    setTotpCode("");
    setRecoveryCode("");
  };

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token || null;
  };

  const ensureReferralAccess = async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error("Your session expired. Please sign in again.");
    }

    const response = await fetch("/api/admin/permissions/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error("This account does not have Growth Manager referral access.");
    }

    const permissions = Array.isArray(data.permissions) ? data.permissions : [];
    const hasReferralAccess =
      permissions.includes("*") ||
      permissions.some((permission: string) => REFERRAL_PERMISSIONS.has(permission));

    if (!hasReferralAccess) {
      throw new Error("This account does not have Growth Manager referral access.");
    }
  };

  const goToReferralDashboard = () => {
    router.push(adminPath("/referrals"));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
        const verifyRes = await fetch("/api/auth/verify-turnstile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: turnstileToken }),
        });
        if (!verifyRes.ok) {
          setError("Security check failed. Please try again.");
          setLoading(false);
          return;
        }
      }

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError("Login failed. Please try again.");
        setLoading(false);
        return;
      }

      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      if (accountError || !account) {
        setError("Account not found.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      if (account.role === "coordinator") {
        await supabase.auth.signOut();
        router.replace(`${COORDINATOR_LOGIN_PATH}?error=use_coordinator_login`);
        return;
      }

      if (!["admin", "superadmin"].includes(account.role)) {
        setError("This account does not have Growth Manager referral access.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      try {
        await ensureReferralAccess();
      } catch (accessError) {
        setError(
          accessError instanceof Error
            ? accessError.message
            : "This account does not have Growth Manager referral access."
        );
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      const mfaRequired = process.env.NEXT_PUBLIC_ADMIN_MFA_REQUIRED !== "false";
      if (!mfaRequired) {
        goToReferralDashboard();
        setLoading(false);
        return;
      }

      const { data: mfaFactors } = await supabase.auth.mfa.listFactors();
      const verifiedTOTP = mfaFactors?.totp?.find((factor) => factor.status === "verified");

      if (verifiedTOTP) {
        setMfaFactorId(verifiedTOTP.id);
        setMfaMode("totp");
        setMfaStep(true);
        setLoading(false);
        return;
      }

      router.push(ADMIN_MFA_SETUP_PATH);
    } catch (loginError) {
      console.error("Growth Manager login error:", loginError);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mfaMode === "recovery") {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setError("Your session expired. Please sign in again.");
          resetMfaState();
          setLoading(false);
          return;
        }

        const response = await fetch("/api/admin/mfa/recovery-code/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ code: recoveryCode }),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          setError(
            typeof payload.error === "string"
              ? payload.error
              : "Recovery code verification failed."
          );
          setRecoveryCode("");
          setLoading(false);
          return;
        }

        router.push(`${ADMIN_MFA_SETUP_PATH}?recovered=true`);
        return;
      }

      if (!mfaFactorId) {
        setError("MFA factor not found. Please log in again.");
        setLoading(false);
        return;
      }

      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: mfaFactorId });

      if (challengeError) {
        setError("Failed to create MFA challenge. Please try again.");
        setLoading(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challengeData.id,
        code: totpCode,
      });

      if (verifyError) {
        setError("Invalid verification code. Please try again.");
        setTotpCode("");
        setLoading(false);
        return;
      }

      try {
        await ensureReferralAccess();
      } catch (accessError) {
        setError(
          accessError instanceof Error
            ? accessError.message
            : "This account does not have Growth Manager referral access."
        );
        await supabase.auth.signOut();
        resetMfaState();
        setLoading(false);
        return;
      }

      goToReferralDashboard();
    } catch (verifyError) {
      console.error("Growth Manager MFA verification error:", verifyError);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f8fc] flex">
      <section className="hidden lg:flex w-[44%] bg-[#1f419a] text-white p-10 xl:p-14 flex-col justify-between">
        <div>
          <Image
            src="/matchindeed-logo-white.png"
            alt="MatchIndeed"
            width={150}
            height={38}
            className="h-auto w-[150px]"
            priority
          />
        </div>

        <div className="max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm text-white/90">
            <TrendingUp className="h-4 w-4" />
            Referral operations
          </div>
          <h1 className="mt-6 text-4xl font-bold leading-tight">
            Growth Manager Console
          </h1>
          <p className="mt-4 text-base leading-7 text-white/78">
            Review referral rewards, monitor fraud signals, and manage referral
            credit settings from one protected MatchIndeed workspace.
          </p>
        </div>

        <p className="text-sm text-white/65">
          Access is limited to Superadmins and Growth Managers with referral permissions.
        </p>
      </section>

      <main className="flex-1 flex items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-7 text-center">
            <Image
              src="/matchindeed-logo-black-font.png"
              alt="MatchIndeed"
              width={154}
              height={38}
              className="inline-block h-auto"
              priority
            />
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-7 sm:p-8">
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-50 mb-4">
                <ShieldCheck className="h-7 w-7 text-[#1f419a]" />
              </div>
              <h2 className="text-2xl font-bold text-gray-950">
                Growth Manager Login
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Sign in to access the MatchIndeed referral system.
              </p>
            </div>

            {displayedError && (
              <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-red-50 text-red-700 border border-red-200">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">{displayedError}</p>
              </div>
            )}

            {mfaStep ? (
              <form onSubmit={handleMfaVerify} className="space-y-5">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-3">
                    {recoveryMode ? (
                      <LifeBuoy className="h-6 w-6 text-[#1f419a]" />
                    ) : (
                      <KeyRound className="h-6 w-6 text-[#1f419a]" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {recoveryMode
                      ? "Use your one-time recovery code to regain access."
                      : "Enter the 6-digit code from your authenticator app."}
                  </p>
                </div>

                {recoveryMode && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    Using a recovery code will reset your current authenticator setup.
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {recoveryMode ? "Recovery Code" : "Verification Code"}
                  </label>
                  <input
                    type="text"
                    inputMode={recoveryMode ? "text" : "numeric"}
                    autoComplete={recoveryMode ? "off" : "one-time-code"}
                    maxLength={recoveryMode ? 32 : 6}
                    value={recoveryMode ? recoveryCode : totpCode}
                    onChange={(e) => {
                      if (recoveryMode) {
                        setRecoveryCode(e.target.value.toUpperCase());
                      } else {
                        setTotpCode(e.target.value.replace(/\D/g, ""));
                      }
                    }}
                    placeholder={recoveryMode ? "MI-AB12-CD34-EF56-GH78" : "000000"}
                    required
                    autoFocus
                    className={`w-full py-3 rounded-xl border border-gray-300 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none transition-all font-mono ${
                      recoveryMode
                        ? "px-4 text-center text-base tracking-[0.16em]"
                        : "text-center text-2xl tracking-[0.5em]"
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || (!recoveryMode && totpCode.length !== 6) || (recoveryMode && recoveryCode.trim().length < 8)}
                  className="w-full py-3 rounded-xl bg-[#1f419a] text-white font-medium hover:bg-[#17357b] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Verifying...
                    </>
                  ) : recoveryMode ? (
                    "Use Recovery Code"
                  ) : (
                    "Verify & Continue"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setTotpCode("");
                    setRecoveryCode("");
                    setMfaMode(recoveryMode ? "totp" : "recovery");
                  }}
                  className="w-full text-sm text-[#1f419a] hover:underline transition-colors"
                >
                  {recoveryMode
                    ? "Use authenticator code instead"
                    : "Use a recovery code instead"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="growth@matchindeed.com"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="w-full pl-10 pr-12 py-3 rounded-xl border border-gray-300 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                      )}
                    </button>
                  </div>
                </div>

                <CloudflareTurnstile
                  onVerify={handleTurnstileVerify}
                  onExpire={() => setTurnstileToken(null)}
                />

                <button
                  type="submit"
                  disabled={loading || !!(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken)}
                  className="w-full py-3 rounded-xl bg-[#1f419a] text-white font-medium hover:bg-[#17357b] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Open Referral Dashboard
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-500">
                Referral console access is permission controlled.
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-sm text-[#1f419a] hover:underline mt-2"
              >
                Back to MatchIndeed
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
