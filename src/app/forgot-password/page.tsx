"use client";

/**
 * ForgotPasswordPage — MatchIndeed
 *
 * Split-layout forgot password page matching the auth design system.
 * Left panel: branding + reassuring copy (desktop only).
 * Right panel: email form → success state.
 * All business logic preserved.
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { Mail, ArrowLeft, Loader2, Shield, Lock, KeyRound } from "lucide-react";
import Image from "next/image";
import CloudflareTurnstile from "@/components/CloudflareTurnstile";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const handleTurnstileVerify = useCallback((token: string) => setTurnstileToken(token), []);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      setSuccess(true);
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
            Don&apos;t worry,
            <br />
            <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
              we&apos;ve got you
            </span>
          </h2>
          <p className="mt-4 max-w-sm text-lg text-white/60">
            It happens to the best of us. We&apos;ll send you a secure link to
            reset your password and get you back to finding your perfect match.
          </p>

          {/* Trust points */}
          <div className="mt-8 space-y-3 text-sm text-white/50">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>Secure, encrypted password reset</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span>Link expires in 1 hour for safety</span>
            </div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              <span>Only you can reset your password</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-white/30">
          &copy; {new Date().getFullYear()} MatchIndeed. All rights reserved.
        </p>
      </div>

      {/* ===== Right Panel — Form ===== */}
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
            <h1 className="text-3xl font-bold text-gray-900">Forgot password</h1>
            <p className="mt-2 text-gray-500">
              Enter your email to receive a password reset link
            </p>
          </div>

          {/* Form Card */}
          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-black/5">
            {success ? (
              /* ---- Success State ---- */
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 ring-4 ring-green-100">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  Check your email
                </h2>
                <p className="text-sm text-gray-600">
                  We&apos;ve sent a password reset link to{" "}
                  <strong className="text-gray-900">{email}</strong>
                </p>
                <p className="text-xs text-gray-400">
                  Please check your inbox and click the link to reset your
                  password. The link will expire in 1 hour.
                </p>
                <div className="pt-4">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#1f419a] hover:text-[#17357b]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to login
                  </Link>
                </div>
              </div>
            ) : (
              /* ---- Form State ---- */
              <form onSubmit={handleForgotPassword} className="space-y-5">
                {/* Error */}
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm transition-colors focus:border-[#1f419a] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                    />
                  </div>
                </div>

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
                      Sending...
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </button>

                {/* Back to login */}
                <div className="text-center">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 text-sm text-[#1f419a] hover:text-[#17357b]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to login
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
