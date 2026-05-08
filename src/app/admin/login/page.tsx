"use client";

import { useState, useEffect, useCallback, type ComponentProps } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ADMIN_BASE_PATH, ADMIN_MFA_SETUP_PATH } from "@/lib/admin/path";
import { COORDINATOR_LOGIN_PATH } from "@/lib/coordinator/path";
import {
  Shield,
  Mail,
  Lock,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
  LifeBuoy,
} from "lucide-react";
import Image from "next/image";
import NextLink from "next/link";
import CloudflareTurnstile from "@/components/CloudflareTurnstile";

type NextLinkProps = ComponentProps<typeof NextLink>;
type MfaMode = "totp" | "recovery";

function Link({ prefetch, ...props }: NextLinkProps) {
  return <NextLink {...props} prefetch={prefetch ?? false} />;
}

export default function AdminLoginPage() {
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
      return "You don't have permission to access the admin panel.";
    }
    if (errorParam === "use_coordinator_login") {
      return "This account is set up for coordinator access. Use the coordinator login page instead.";
    }
    return null;
  })();
  const displayedError = error ?? queryError;

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

      const adminRoles = ["admin", "superadmin"];
      if (account.role === "coordinator") {
        await supabase.auth.signOut();
        router.replace(`${COORDINATOR_LOGIN_PATH}?error=use_coordinator_login`);
        return;
      }

      if (!adminRoles.includes(account.role)) {
        setError("You don't have permission to access the admin panel.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      const mfaRequired = process.env.NEXT_PUBLIC_ADMIN_MFA_REQUIRED !== "false";
      if (!mfaRequired) {
        router.push(ADMIN_BASE_PATH);
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
      console.error("Login error:", loginError);
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

      router.push(ADMIN_BASE_PATH);
    } catch (verifyError) {
      console.error("MFA verification error:", verifyError);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  const recoveryMode = mfaMode === "recovery";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1f419a] to-[#2a44a3] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1f419a] to-[#2a44a3] mb-4">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Login</h1>
            <p className="text-gray-500 mt-1">Sign in to access the admin panel</p>
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
                  Using a recovery code will reset your current authenticator setup
                  and send you to a fresh 2FA setup screen.
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
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Verifying...
                  </>
                ) : recoveryMode ? (
                  "Use Recovery Code"
                ) : (
                  "Verify & Sign In"
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

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  resetMfaState();
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Back to login
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@matchindeed.com"
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
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
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
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
              </div>

              <CloudflareTurnstile onVerify={handleTurnstileVerify} onExpire={() => setTurnstileToken(null)} />

              <button
                type="submit"
                disabled={loading || !!(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In to Admin Panel"
                )}
              </button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-500">
              Only authorized administrators can access this panel.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-[#1f419a] hover:underline mt-2"
            >
              ← Back to Matchindeed
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Image
            src="/matchindeed-logo-white.png"
            alt="MatchIndeed"
            width={132}
            height={34}
            className="inline-block"
            style={{ width: "auto", height: "auto" }}
          />
        </div>
      </div>
    </div>
  );
}
