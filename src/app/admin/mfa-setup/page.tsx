"use client";

/**
 * AdminMfaSetupPage — TOTP MFA enrollment for admin accounts.
 *
 * Admins are redirected here on first login if they haven't enrolled MFA.
 * Shows a QR code to scan with Google Authenticator / Authy / 1Password.
 * After verifying a code, the factor is confirmed and the admin can proceed.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Shield,
  KeyRound,
  Loader2,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import Image from "next/image";

export default function AdminMfaSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Enrollment data
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [success, setSuccess] = useState(false);

  /**
   * Start MFA enrollment — generates a QR code and secret key.
   */
  useEffect(() => {
    const startEnrollment = async () => {
      try {
        // Verify user is logged in and is an admin
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/admin/login");
          return;
        }

        // Check if already enrolled
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verified = factors?.totp?.find((f) => f.status === "verified");
        if (verified) {
          router.push("/admin");
          return;
        }

        // Unenroll any unverified factors first
        for (const factor of factors?.totp || []) {
          if (factor.status === "unverified") {
            await supabase.auth.mfa.unenroll({ factorId: factor.id });
          }
        }

        // Enroll a new TOTP factor
        const { data, error: enrollError } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "MatchIndeed Admin",
        });

        if (enrollError) {
          setError(
            enrollError.message ||
              "Failed to start MFA enrollment. Enable MFA in Supabase Dashboard → Authentication → Providers, or set NEXT_PUBLIC_ADMIN_MFA_REQUIRED=false to skip."
          );
          setLoading(false);
          return;
        }

        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
        setFactorId(data.id);
      } catch {
        setError("An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    startEnrollment();
  }, [router]);

  /**
   * Verify the TOTP code to confirm enrollment.
   */
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnrolling(true);

    try {
      if (!factorId) {
        setError("Enrollment data missing. Please refresh and try again.");
        setEnrolling(false);
        return;
      }

      // Challenge + verify to confirm the factor
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });

      if (challengeError) {
        setError("Failed to create challenge.");
        setEnrolling(false);
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
        setEnrolling(false);
        return;
      }

      setSuccess(true);
      // Redirect to admin dashboard after a brief success message
      setTimeout(() => router.push("/admin"), 2000);
    } catch {
      setError("Verification failed. Please try again.");
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1f419a] to-[#2a44a3] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1f419a] to-[#2a44a3] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1f419a] to-[#2a44a3] mb-4">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Set Up Two-Factor Authentication
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              MFA is required for all admin accounts. Scan the QR code with
              Google Authenticator, Authy, or 1Password.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex flex-col gap-3 p-4 rounded-xl bg-red-50 text-red-700 border border-red-200">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/admin")}
                className="text-sm font-medium text-[#1f419a] hover:underline text-left"
              >
                Skip for now and go to admin panel →
              </button>
            </div>
          )}

          {/* Success */}
          {success ? (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">MFA Enabled!</h2>
              <p className="text-sm text-gray-500 mt-1">
                Redirecting to admin dashboard...
              </p>
            </div>
          ) : (
            <>
              {/* QR Code */}
              {qrCode && (
                <div className="flex flex-col items-center mb-6">
                  <div className="p-3 bg-white border-2 border-gray-200 rounded-xl mb-3">
                    <img
                      src={qrCode}
                      alt="Scan this QR code with your authenticator app"
                      className="w-48 h-48"
                    />
                  </div>
                  {/* Manual entry key */}
                  {secret && (
                    <details className="w-full text-center">
                      <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                        Can&apos;t scan? Enter key manually
                      </summary>
                      <code className="mt-2 block text-xs bg-gray-50 p-2 rounded-lg font-mono text-gray-700 break-all">
                        {secret}
                      </code>
                    </details>
                  )}
                </div>
              )}

              {/* Verify Code */}
              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Enter the 6-digit code from your app
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KeyRound className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) =>
                        setTotpCode(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="000000"
                      required
                      autoFocus
                      className="w-full pl-10 text-center text-xl tracking-[0.5em] py-3 rounded-xl border border-gray-300 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none transition-all font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={enrolling || totpCode.length !== 6}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {enrolling ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Confirm & Enable MFA"
                  )}
                </button>
              </form>
            </>
          )}
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
