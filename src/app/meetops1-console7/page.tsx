"use client";

import { Suspense, useEffect, useState, useCallback, type ComponentProps } from "react";
import Image from "next/image";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  Eye,
  EyeOff,
  KeyRound,
  LifeBuoy,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Video,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  COORDINATOR_DASHBOARD_PATH,
  COORDINATOR_MFA_SETUP_PATH,
} from "@/lib/coordinator/path";
import CloudflareTurnstile from "@/components/CloudflareTurnstile";

type NextLinkProps = ComponentProps<typeof NextLink>;
type MfaMode = "totp" | "recovery";

function Link({ prefetch, ...props }: NextLinkProps) {
  return <NextLink {...props} prefetch={prefetch ?? false} />;
}

function getSafeCoordinatorNext(value: string | null) {
  return typeof value === "string" && value.startsWith("/coordinator/")
    ? value
    : COORDINATOR_DASHBOARD_PATH;
}

function CoordinatorLoginContent() {
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
  const queryError =
    searchParams.get("error") === "use_coordinator_login"
      ? "Please use this coordinator login page for coordinator access."
      : null;
  const displayedError = error ?? queryError;

  useEffect(() => {
    const handleLogout = async () => {
      if (searchParams.get("logout") === "true") {
        await supabase.auth.signOut();
      }
    };

    void handleLogout();
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

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
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
        setError(
          authError.message.includes("Invalid login credentials")
            ? "Invalid coordinator email or password."
            : authError.message
        );
        return;
      }

      if (!authData.user) {
        setError("Login failed. Please try again.");
        return;
      }

      const accessResponse = await fetch("/api/coordinator/access", {
        headers: {
          Authorization: `Bearer ${authData.session?.access_token || ""}`,
        },
      });
      const accessData = await accessResponse.json().catch(() => ({}));

      if (!accessResponse.ok) {
        await supabase.auth.signOut();
        setError(
          accessData.error || "This account is not enabled for coordinator access."
        );
        return;
      }

      const { data: mfaFactors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        setError("Failed to check your 2FA status. Please try again.");
        await supabase.auth.signOut();
        return;
      }

      const verifiedTOTP = mfaFactors?.totp?.find((factor) => factor.status === "verified");
      if (verifiedTOTP) {
        setMfaFactorId(verifiedTOTP.id);
        setMfaMode("totp");
        setMfaStep(true);
        return;
      }

      if ((mfaFactors?.totp || []).length > 0) {
        router.push(COORDINATOR_MFA_SETUP_PATH);
        return;
      }

      router.push(getSafeCoordinatorNext(searchParams.get("next")));
    } catch (loginError) {
      console.error("Coordinator login error:", loginError);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mfaMode === "recovery") {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setError("Your session expired. Please sign in again.");
          resetMfaState();
          return;
        }

        const response = await fetch("/api/coordinator/mfa/recovery-code/verify", {
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
          return;
        }

        router.push(`${COORDINATOR_MFA_SETUP_PATH}?recovered=true`);
        return;
      }

      if (!mfaFactorId) {
        setError("MFA factor not found. Please log in again.");
        return;
      }

      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: mfaFactorId });

      if (challengeError) {
        setError("Failed to create MFA challenge. Please try again.");
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
        return;
      }

      router.push(getSafeCoordinatorNext(searchParams.get("next")));
    } catch (verifyError) {
      console.error("Coordinator MFA verification error:", verifyError);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const recoveryMode = mfaMode === "recovery";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#10255f] via-[#1f419a] to-[#3657c9] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] bg-white shadow-2xl lg:grid-cols-[0.95fr_1.05fr]">
          <div className="relative hidden overflow-hidden bg-[#10255f] p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 right-0 h-80 w-80 rounded-full bg-amber-300/15 blur-3xl" />

            <Link href="/" className="relative z-10">
              <Image
                src="/matchindeed-logo-white.png"
                alt="MatchIndeed"
                width={170}
                height={44}
                style={{ width: "auto", height: "auto" }}
              />
            </Link>

            <div className="relative z-10">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/80">
                <ShieldCheck className="h-4 w-4" />
                Coordinator access only
              </div>
              <h1 className="text-4xl font-black leading-tight">
                Meeting operations,
                <br />
                <span className="text-amber-300">kept separate.</span>
              </h1>
              <p className="mt-4 max-w-sm text-base leading-7 text-white/65">
                Sign in here to view assigned video meetings, upcoming sessions,
                and approved meetings ready to join.
              </p>
              <div className="mt-8 flex flex-wrap gap-4 text-sm text-white/55">
                <span className="inline-flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Assigned meetings
                </span>
                <span className="inline-flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Upcoming reminders
                </span>
              </div>
            </div>

            <p className="relative z-10 text-xs text-white/35">
              &copy; {new Date().getFullYear()} MatchIndeed Coordinator Console.
            </p>
          </div>

          <div className="flex items-center justify-center px-6 py-10 sm:px-10">
            <div className="w-full max-w-md">
              <div className="mb-8 text-center">
                <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1f419a] to-[#2a44a3] shadow-lg shadow-[#1f419a]/25">
                  <ShieldCheck className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-950">
                  Coordinator Login
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Sign in to access assigned meeting operations
                </p>
              </div>

              {displayedError ? (
                <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <p className="text-sm">{displayedError}</p>
                </div>
              ) : null}

              {mfaStep ? (
                <form onSubmit={handleMfaVerify} className="space-y-5">
                  <div className="mb-4 text-center">
                    <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                      {recoveryMode ? (
                        <LifeBuoy className="h-6 w-6 text-[#1f419a]" />
                      ) : (
                        <KeyRound className="h-6 w-6 text-[#1f419a]" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {recoveryMode
                        ? "Use your one-time recovery code to regain coordinator access."
                        : "Enter the 6-digit code from your authenticator app."}
                    </p>
                  </div>

                  {recoveryMode ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                      Using a recovery code will reset your current authenticator
                      setup and send you to a fresh 2FA setup screen.
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      {recoveryMode ? "Recovery Code" : "Verification Code"}
                    </label>
                    <input
                      type="text"
                      inputMode={recoveryMode ? "text" : "numeric"}
                      autoComplete={recoveryMode ? "off" : "one-time-code"}
                      maxLength={recoveryMode ? 32 : 6}
                      value={recoveryMode ? recoveryCode : totpCode}
                      onChange={(event) => {
                        if (recoveryMode) {
                          setRecoveryCode(event.target.value.toUpperCase());
                        } else {
                          setTotpCode(event.target.value.replace(/\D/g, ""));
                        }
                      }}
                      placeholder={recoveryMode ? "MI-AB12-CD34-EF56-GH78" : "000000"}
                      required
                      autoFocus
                      className={`w-full rounded-xl border border-gray-300 font-mono outline-none transition-all focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 ${
                        recoveryMode
                          ? "px-4 py-3 text-center text-base tracking-[0.16em]"
                          : "py-3 text-center text-2xl tracking-[0.5em]"
                      }`}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      loading ||
                      (!recoveryMode && totpCode.length !== 6) ||
                      (recoveryMode && recoveryCode.trim().length < 8)
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-3 font-semibold text-white shadow-lg shadow-[#1f419a]/20 transition-all hover:scale-[1.01] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="w-full text-sm text-[#1f419a] hover:underline"
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
                    className="w-full text-sm text-gray-500 hover:text-gray-700"
                  >
                    Back to login
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Coordinator Email
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="coordinator@example.com"
                        required
                        className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-4 outline-none transition-all focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        required
                        className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-12 outline-none transition-all focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <CloudflareTurnstile onVerify={handleTurnstileVerify} onExpire={() => setTurnstileToken(null)} />

                  <button
                    type="submit"
                    disabled={loading || !!(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-3 font-semibold text-white shadow-lg shadow-[#1f419a]/20 transition-all hover:scale-[1.01] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign in to Coordinator Console"
                    )}
                  </button>
                </form>
              )}

              <div className="mt-8 border-t border-gray-200 pt-6 text-center">
                <p className="text-sm text-gray-500">
                  Only assigned coordinators can access this console.
                </p>
                <Link
                  href="/"
                  className="mt-2 inline-flex text-sm font-medium text-[#1f419a] hover:underline"
                >
                  Back to MatchIndeed
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoordinatorLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#1f419a] text-white">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <CoordinatorLoginContent />
    </Suspense>
  );
}
