"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Shield, Mail, Lock, AlertCircle, Loader2, Eye, EyeOff, KeyRound } from "lucide-react";
import Image from "next/image";

/**
 * AdminLoginPage - Login page for admin panel
 * 
 * Features:
 * - Email/password authentication
 * - Role verification (only admin roles can access)
 * - TOTP MFA challenge (if MFA is enrolled)
 * - MFA enrollment redirect (if admin has no MFA set up)
 * - Logout handling
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA state
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  // Handle logout if requested
  useEffect(() => {
    const handleLogout = async () => {
      if (searchParams.get("logout") === "true") {
        await supabase.auth.signOut();
      }
    };
    handleLogout();

    // Show error message if redirected with error
    const errorParam = searchParams.get("error");
    if (errorParam === "unauthorized") {
      setError("You don't have permission to access the admin panel.");
    }
  }, [searchParams]);

  /**
   * Handle login form submission
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Authenticate with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
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

      // Check if user has admin role
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

      // Verify admin role
      const adminRoles = ["moderator", "admin", "superadmin"];
      if (!adminRoles.includes(account.role)) {
        setError("You don't have permission to access the admin panel.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // Skip MFA when ADMIN_MFA_REQUIRED=false (e.g. development, or MFA not yet enabled in Supabase)
      const mfaRequired = process.env.NEXT_PUBLIC_ADMIN_MFA_REQUIRED !== "false";
      if (!mfaRequired) {
        router.push("/admin");
        setLoading(false);
        return;
      }

      // Check if MFA is enrolled
      const { data: mfaFactors } = await supabase.auth.mfa.listFactors();
      const verifiedTOTP = mfaFactors?.totp?.find((f) => f.status === "verified");

      if (verifiedTOTP) {
        // MFA is enrolled — show TOTP challenge
        setMfaFactorId(verifiedTOTP.id);
        setMfaStep(true);
        setLoading(false);
        return;
      }

      // No MFA enrolled — redirect to MFA setup page
      router.push("/admin/mfa-setup");
    } catch (err) {
      console.error("Login error:", err);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  /**
   * Handle MFA TOTP verification
   */
  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!mfaFactorId) {
        setError("MFA factor not found. Please log in again.");
        setLoading(false);
        return;
      }

      // Create a challenge
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: mfaFactorId });

      if (challengeError) {
        setError("Failed to create MFA challenge. Please try again.");
        setLoading(false);
        return;
      }

      // Verify the TOTP code
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

      // MFA verified — redirect to admin dashboard
      router.push("/admin");
    } catch (err) {
      console.error("MFA verification error:", err);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1f419a] to-[#2a44a3] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1f419a] to-[#2a44a3] mb-4">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Login</h1>
            <p className="text-gray-500 mt-1">Sign in to access the admin panel</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-red-50 text-red-700 border border-red-200">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {mfaStep ? (
            /* MFA Verification Form */
            <form onSubmit={handleMfaVerify} className="space-y-5">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-3">
                  <KeyRound className="h-6 w-6 text-[#1f419a]" />
                </div>
                <p className="text-sm text-gray-600">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Verification Code
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
                  className="w-full text-center text-2xl tracking-[0.5em] py-3 rounded-xl border border-gray-300 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none transition-all font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Sign In"
                )}
              </button>

              <button
                type="button"
                onClick={() => { setMfaStep(false); setTotpCode(""); setError(null); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Back to login
              </button>
            </form>
          ) : (
            /* Login Form */
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email Field */}
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

              {/* Password Field */}
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
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

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-500">
              Only authorized administrators can access this panel.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-1 text-sm text-[#1f419a] hover:underline mt-2"
            >
              ← Back to Matchindeed
            </a>
          </div>
        </div>

        {/* Logo */}
        <div className="mt-6 text-center">
          <Image
            src="/matchindeed.svg"
            alt="Matchindeed"
            width={140}
            height={36}
            className="inline-block opacity-80"
            style={{ width: "auto", height: "auto" }}
          />
        </div>
      </div>
    </div>
  );
}
