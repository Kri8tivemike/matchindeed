"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export const dynamic = "force-dynamic";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED === "true";
  // Email verification prompts are deferred post-login; no resend in pre-login screen

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
      if (error) throw error;

      // Create or update account record
      if (data.user) {
        await supabase.from("accounts").upsert([
          {
            id: data.user.id,
            email: data.user.email,
            display_name: data.user.email?.split("@")[0] || "User",
            tier: "basic",
          }
        ], { onConflict: "id" });

        // Initialize wallet and credits if new user
        await supabase.from("wallets").upsert([
          {
            user_id: data.user.id,
            balance_cents: 0,
          }
        ], { onConflict: "user_id" });

        await supabase.from("credits").upsert([
          {
            user_id: data.user.id,
            total: 0,
            used: 0,
            rollover: 0,
          }
        ], { onConflict: "user_id" });
      }

      const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
      if (next) {
        router.push(next);
      } else if (data.user) {
        // Check user progress
        const { data: progress } = await supabase
          .from("user_progress")
          .select("profile_completed, preferences_completed")
          .eq("user_id", data.user.id)
          .maybeSingle();

        // Initialize progress if it doesn't exist
        if (!progress) {
          await supabase.from("user_progress").upsert([
            { user_id: data.user.id, profile_completed: false, preferences_completed: false }
          ], { onConflict: "user_id" });
        }

        // Route based on completion status
        if (!progress?.profile_completed) {
          // Redirect to profile page to show onboarding or profile details
          router.push("/dashboard/profile");
        } else if (!progress?.preferences_completed) {
          // Redirect to preferences completion
          router.push("/dashboard/profile/preferences");
        } else {
          // Both completed, go to dashboard
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

  // Placeholder for post-login verification trigger

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-4">
            <Image src="/matchindeed.svg" alt="Matchindeed" width={150} height={40} />
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back</h1>
          <p className="text-gray-600">Sign in to your account to continue</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  Remember me
                </label>
              </div>
              <div className="text-sm">
                <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                  Forgot password?
                </a>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-[#2F80ED] hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Don&apos;t have an account?</span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/register"
                className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Create new account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
