"use client";

/**
 * LoginPage — MatchIndeed
 *
 * Split-layout login page matching the landing page design language.
 * Left panel: branding + marketing copy (desktop only).
 * Right panel: login form.
 * All business logic (auth, account/wallet/credit setup, progress routing) preserved.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
export const dynamic = "force-dynamic";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { Eye, EyeOff, Mail, Lock, Loader2, Video, Shield, Heart } from "lucide-react";
import Image from "next/image";
import CloudflareTurnstile from "@/components/CloudflareTurnstile";
import { GoogleSignInButton } from "@/components/SocialAuthButtons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED === "true";
  const handleTurnstileVerify = useCallback((token: string) => setTurnstileToken(token), []);

  // ---------------------------------------------------------------
  // Handle Login — all existing logic preserved
  // ---------------------------------------------------------------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (authDisabled) {
        router.push("/dashboard/discover");
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.message.includes("Email not confirmed") || error.message.includes("email_not_confirmed")) {
          setError("Please verify your email before signing in. Check your inbox for the verification link.");
          setLoading(false);
          return;
        }
        if (error.message.includes("Invalid login credentials") || error.message.includes("invalid_credentials")) {
          setError("Invalid email or password. Please try again.");
          setLoading(false);
          return;
        }
        setError(error.message || "An error occurred during login. Please try again.");
        setLoading(false);
        return;
      }

      if (data.user && !data.user.email_confirmed_at) {
        setError("Please verify your email before signing in. Check your inbox for the verification link.");
        await supabase.auth.resend({ type: "signup", email: data.user.email! });
        return;
      }

      // Create or update account, wallet, credits
      if (data.user) {
        const { data: existingAccount } = await supabase
          .from("accounts")
          .select("id")
          .eq("id", data.user.id)
          .single();

        if (!existingAccount) {
          await supabase.from("accounts").insert({
            id: data.user.id,
            email: data.user.email,
            display_name: data.user.email?.split("@")[0] || "User",
            tier: "basic",
          });
        } else {
          await supabase
            .from("accounts")
            .update({ email: data.user.email })
            .eq("id", data.user.id);
        }

        const { data: existingWallet } = await supabase
          .from("wallets")
          .select("user_id")
          .eq("user_id", data.user.id)
          .single();
        if (!existingWallet) {
          await supabase.from("wallets").insert({ user_id: data.user.id, balance_cents: 0 });
        }

        const { data: existingCredits } = await supabase
          .from("credits")
          .select("user_id")
          .eq("user_id", data.user.id)
          .single();
        if (!existingCredits) {
          await supabase.from("credits").insert({ user_id: data.user.id, total: 0, used: 0, rollover: 0 });
        }
      }

      // Route based on progress
      const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
      if (next) {
        router.push(next);
      } else if (data.user) {
        let { data: progress } = await supabase
          .from("user_progress")
          .select("profile_completed, preferences_completed")
          .eq("user_id", data.user.id)
          .maybeSingle();

        if (!progress) {
          const { data: newProgress } = await supabase.from("user_progress").upsert([
            { user_id: data.user.id, profile_completed: false, preferences_completed: false }
          ], { onConflict: "user_id" }).select().single();
          progress = newProgress || { profile_completed: false, preferences_completed: false };
        }

        if (!progress?.profile_completed) {
          router.push("/dashboard/profile/edit");
        } else if (!progress?.preferences_completed) {
          router.push("/dashboard/profile/preferences");
        } else {
          router.push("/dashboard/discover");
        }
      } else {
        router.push("/dashboard/discover");
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred during login");
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
            Welcome back to
            <br />
            <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
              real connections
            </span>
          </h2>
          <p className="mt-4 max-w-sm text-lg text-white/60">
            Pick up where you left off. Your matches, messages, and upcoming
            video dates are waiting for you.
          </p>

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap gap-4 text-sm text-white/50">
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4" /> Verified Profiles
            </span>
            <span className="flex items-center gap-1.5">
              <Video className="h-4 w-4" /> Secure Video Calls
            </span>
            <span className="flex items-center gap-1.5">
              <Heart className="h-4 w-4" /> Real Connections
            </span>
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-white/30">
          &copy; {new Date().getFullYear()} MatchIndeed. All rights reserved.
        </p>
      </div>

      {/* ===== Right Panel — Login Form ===== */}
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
            <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
            <p className="mt-2 text-gray-500">
              Sign in to your account to continue
            </p>
          </div>

          {/* Form Card */}
          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-black/5">
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Error */}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Email */}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
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

              {/* Password */}
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gray-400" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-10 text-sm transition-colors focus:border-[#1f419a] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-[#1f419a] focus:ring-[#1f419a]"
                  />
                  Remember me
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-[#1f419a] hover:text-[#17357b]"
                >
                  Forgot password?
                </Link>
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
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>

              {/* Social sign-in */}
              <div className="mt-4">
                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-3 text-gray-400">Or continue with</span>
                  </div>
                </div>
                <GoogleSignInButton />
              </div>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-gray-400">
                  Don&apos;t have an account?
                </span>
              </div>
            </div>

            {/* Register Link */}
            <Link
              href="/register"
              className="flex w-full items-center justify-center rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Create new account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
