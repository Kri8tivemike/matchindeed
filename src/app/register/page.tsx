"use client";

/**
 * RegisterPage — MatchIndeed
 *
 * Split-layout registration page matching the landing page design.
 * Left panel: branding + marketing copy (desktop only).
 * Right panel: registration form with real-time password strength meter.
 * All business logic preserved.
 */

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Loader2,
  Video,
  Shield,
  Heart,
  CheckCircle,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import CloudflareTurnstile from "@/components/CloudflareTurnstile";
import { GoogleSignInButton } from "@/components/SocialAuthButtons";

// ---------------------------------------------------------------
// Password strength helper
// ---------------------------------------------------------------
function getPasswordStrength(pw: string) {
  const rules = [
    { label: "At least 6 characters", met: pw.length >= 6 },
    { label: "Contains a number", met: /\d/.test(pw) },
    { label: "Contains uppercase", met: /[A-Z]/.test(pw) },
    { label: "Contains special character", met: /[^A-Za-z0-9]/.test(pw) },
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
// Component
// ---------------------------------------------------------------
export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const pwStrength = useMemo(() => getPasswordStrength(password), [password]);
  const handleTurnstileVerify = useCallback((token: string) => setTurnstileToken(token), []);

  // ---------------------------------------------------------------
  // Handle Registration — all existing logic preserved
  // ---------------------------------------------------------------
  const handleRegister = async (e: React.FormEvent) => {
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
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName, turnstileToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      router.push(
        "/verify-email?email=" + encodeURIComponent(email) + "&registered=true"
      );
    } catch (error: unknown) {
      setError(
        error instanceof Error
          ? error.message
          : "An error occurred during registration"
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="flex min-h-screen">
      {/* ===== Left Panel — Branding (desktop only) ===== */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1e2a78] via-[#2a44a3] to-[#4463cf] p-12 lg:flex">
        {/* Decorative blurs */}
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />

        {/* Logo */}
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

        {/* Marketing copy */}
        <div className="relative z-10">
          <h2 className="text-4xl font-extrabold leading-tight text-white">
            Start your journey
            <br />
            to{" "}
            <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
              real love
            </span>
          </h2>
          <p className="mt-4 max-w-sm text-lg text-white/60">
            Join thousands of singles finding meaningful connections through
            video dating. Create your free account in under 2 minutes.
          </p>

          {/* Benefits */}
          <div className="mt-8 space-y-3 text-sm text-white/50">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span>Free to join — no credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span>Verified profiles for a safe experience</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span>Built-in video dating — no external apps</span>
            </div>
          </div>

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap gap-4 text-sm text-white/40">
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4" /> Verified
            </span>
            <span className="flex items-center gap-1.5">
              <Video className="h-4 w-4" /> Video Dates
            </span>
            <span className="flex items-center gap-1.5">
              <Heart className="h-4 w-4" /> Real Matches
            </span>
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-white/30">
          &copy; {new Date().getFullYear()} MatchIndeed. All rights reserved.
        </p>
      </div>

      {/* ===== Right Panel — Registration Form ===== */}
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-10">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-6 text-center lg:hidden">
            <Link href="/" className="inline-block">
              <Image src="/matchindeed.svg" alt="MatchIndeed" width={150} height={40} style={{ width: "auto", height: "auto" }} />
            </Link>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              Create your account
            </h1>
            <p className="mt-2 text-gray-500">
              Join MatchIndeed and find your perfect match
            </p>
          </div>

          {/* Form Card */}
          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-black/5">
            {/* Social sign-up */}
            <GoogleSignInButton />
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-gray-400">Or sign up with email</span>
              </div>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              {/* Error */}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Name fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-gray-700">
                    First name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm transition-colors focus:border-[#1f419a] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="lastName" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Last name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm transition-colors focus:border-[#1f419a] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                    />
                  </div>
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-4 text-sm transition-colors focus:border-[#1f419a] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Password
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
                    placeholder="Create a password"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-10 text-sm transition-colors focus:border-[#1f419a] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1f419a]/30"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {password.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {/* Strength bar */}
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${pwStrength.color}`}
                          style={{ width: `${(pwStrength.score / 4) * 100}%` }}
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

                    {/* Rules checklist */}
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
                          <span className={rule.met ? "text-green-600" : "text-gray-400"}>
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
                <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Confirm password
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
                    placeholder="Confirm your password"
                    className={`w-full rounded-xl border bg-gray-50 py-2.5 pl-9 pr-10 text-sm transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20 ${
                      confirmPassword && confirmPassword !== password
                        ? "border-red-300 focus:border-red-400"
                        : "border-gray-200 focus:border-[#1f419a]"
                    }`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1f419a]/30"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== password && (
                  <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              {/* Terms text */}
              <p className="text-xs text-gray-400">
                By creating an account, you agree to our{" "}
                <span className="text-[#1f419a]">Terms of Service</span> and{" "}
                <span className="text-[#1f419a]">Privacy Policy</span>.
              </p>

              {/* Bot Protection */}
              <CloudflareTurnstile onVerify={handleTurnstileVerify} />

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create free account"
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-gray-400">
                  Already have an account?
                </span>
              </div>
            </div>

            {/* Login Link */}
            <Link
              href="/login"
              className="flex w-full items-center justify-center rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Sign in instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
