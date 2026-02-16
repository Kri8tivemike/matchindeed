"use client";

/**
 * ResetPasswordPage — MatchIndeed
 *
 * Split-layout reset password page matching the auth design system.
 * Left panel: branding + reassuring copy (desktop only).
 * Right panel: password reset form with strength meter.
 * All business logic (token validation, Supabase updateUser, redirect) preserved.
 */

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import {
  Eye,
  EyeOff,
  Lock,
  CheckCircle,
  XCircle,
  Loader2,
  Shield,
  KeyRound,
  ArrowRight,
} from "lucide-react";
import Image from "next/image";

// ---------------------------------------------------------------
// Password strength helper (same as register page)
// ---------------------------------------------------------------
function getPasswordStrength(pw: string) {
  const rules = [
    { label: "At least 6 characters", met: pw.length >= 6 },
    { label: "Contains a number", met: /\d/.test(pw) },
    { label: "Contains uppercase", met: /[A-Z]/.test(pw) },
    { label: "Contains special char", met: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = rules.filter((r) => r.met).length;
  let level: "weak" | "fair" | "good" | "strong" = "weak";
  let color = "bg-red-400";
  if (score >= 4) {
    level = "strong";
    color = "bg-green-500";
  } else if (score >= 3) {
    level = "good";
    color = "bg-blue-500";
  } else if (score >= 2) {
    level = "fair";
    color = "bg-amber-400";
  }
  return { rules, score, level, color };
}

// ---------------------------------------------------------------
// Shared branding panel
// ---------------------------------------------------------------
function BrandPanel() {
  return (
    <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1e2a78] via-[#2a44a3] to-[#4463cf] p-12 lg:flex">
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />

      <Link href="/" className="relative z-10">
        <Image
          src="/matchindeed.svg"
          alt="MatchIndeed"
          width={160}
          height={42}
          className="brightness-0 invert"
          style={{ width: "auto", height: "auto" }}
        />
      </Link>

      <div className="relative z-10">
        <h2 className="text-4xl font-extrabold leading-tight text-white">
          Create a new
          <br />
          <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
            secure password
          </span>
        </h2>
        <p className="mt-4 max-w-sm text-lg text-white/60">
          Choose a strong, unique password to keep your account safe.
          We recommend mixing letters, numbers, and special characters.
        </p>

        <div className="mt-8 space-y-3 text-sm text-white/50">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>Bank-level encryption</span>
          </div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            <span>Password never stored in plain text</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            <span>Secure session management</span>
          </div>
        </div>
      </div>

      <p className="relative z-10 text-xs text-white/30">
        &copy; {new Date().getFullYear()} MatchIndeed. All rights reserved.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------
// Loading spinner (shared between states)
// ---------------------------------------------------------------
function LoadingSpinner({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#1f419a]" />
        <p className="mt-4 text-sm text-gray-500">{text}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Main content component (uses useSearchParams indirectly via hash)
// ---------------------------------------------------------------
function ResetPasswordContent() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validating, setValidating] = useState(true);

  const pwStrength = useMemo(() => getPasswordStrength(password), [password]);

  // Verify the reset token from URL hash
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const hashParams = new URLSearchParams(
          window.location.hash.substring(1)
        );
        const accessToken = hashParams.get("access_token");
        const type = hashParams.get("type");

        if (type === "recovery" && accessToken) {
          setValidating(false);
        } else {
          setError(
            "Invalid or expired reset link. Please request a new one."
          );
          setValidating(false);
        }
      } catch {
        setError("Error validating reset link. Please try again.");
        setValidating(false);
      }
    };

    verifyToken();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      setLoading(false);
      return;
    }

    try {
      const hashParams = new URLSearchParams(
        window.location.hash.substring(1)
      );
      const accessToken = hashParams.get("access_token");

      if (!accessToken) {
        throw new Error("Invalid reset link");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      setSuccess(true);

      setTimeout(() => {
        router.push("/login?message=Password reset successfully. Please sign in.");
      }, 3000);
    } catch (error: unknown) {
      setError(
        error instanceof Error
          ? error.message
          : "An error occurred. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---- Validating State ----
  if (validating) {
    return <LoadingSpinner text="Validating reset link..." />;
  }

  // ---- Success State ----
  if (success) {
    return (
      <div className="flex min-h-screen">
        <BrandPanel />
        <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:hidden">
              <Link href="/" className="inline-block">
                <Image src="/matchindeed.svg" alt="MatchIndeed" width={150} height={40} style={{ width: "auto", height: "auto" }} />
              </Link>
            </div>
            <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-black/5 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 ring-4 ring-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">
                Password reset successful
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Your password has been updated. Redirecting to login...
              </p>
              <div className="mt-6">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#1f419a] hover:text-[#17357b]"
                >
                  Go to login
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Form State ----
  return (
    <div className="flex min-h-screen">
      <BrandPanel />

      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 text-center lg:hidden">
            <Link href="/" className="inline-block">
              <Image src="/matchindeed.svg" alt="MatchIndeed" width={150} height={40} style={{ width: "auto", height: "auto" }} />
            </Link>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Reset password
            </h1>
            <p className="mt-2 text-gray-500">
              Enter your new password below
            </p>
          </div>

          {/* Form Card */}
          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-black/5">
            <form onSubmit={handleResetPassword} className="space-y-5">
              {/* Error */}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* New Password */}
              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  New password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Enter new password"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-9 pr-10 text-sm transition-colors focus:border-[#1f419a] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {password.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${pwStrength.color}`}
                          style={{
                            width: `${(pwStrength.score / 4) * 100}%`,
                          }}
                        />
                      </div>
                      <span
                        className={`text-xs font-medium capitalize ${
                          pwStrength.level === "strong"
                            ? "text-green-600"
                            : pwStrength.level === "good"
                              ? "text-blue-600"
                              : pwStrength.level === "fair"
                                ? "text-amber-600"
                                : "text-red-500"
                        }`}
                      >
                        {pwStrength.level}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {pwStrength.rules.map((rule) => (
                        <div
                          key={rule.label}
                          className="flex items-center gap-1 text-[11px]"
                        >
                          {rule.met ? (
                            <CheckCircle className="h-3 w-3 flex-shrink-0 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 flex-shrink-0 text-gray-300" />
                          )}
                          <span
                            className={
                              rule.met ? "text-green-600" : "text-gray-400"
                            }
                          >
                            {rule.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Confirm new password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Confirm new password"
                    className={`w-full rounded-xl border bg-gray-50 py-3 pl-9 pr-10 text-sm transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20 ${
                      confirmPassword && confirmPassword !== password
                        ? "border-red-300 focus:border-red-400"
                        : "border-gray-200 focus:border-[#1f419a]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== password && (
                  <p className="mt-1 text-xs text-red-500">
                    Passwords do not match
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Resetting password...
                  </>
                ) : (
                  "Reset password"
                )}
              </button>

              {/* Back to login */}
              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm text-[#1f419a] hover:text-[#17357b]"
                >
                  Back to login
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Exported page with Suspense boundary
// ---------------------------------------------------------------
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingSpinner text="Loading..." />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
