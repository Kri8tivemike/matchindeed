"use client";

/**
 * VerifyEmailPage — MatchIndeed
 *
 * Split-layout email verification page matching the auth design system.
 * Left panel: branding + reassuring copy (desktop only).
 * Right panel: status display (verifying / post-register / success / expired / error).
 * All business logic (token handling, session setup, resend) preserved.
 */

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { useToast } from "@/components/ToastProvider";
import {
  Mail,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  Shield,
  Heart,
  ArrowRight,
} from "lucide-react";
import Image from "next/image";

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
          Almost there,
          <br />
          <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
            one more step
          </span>
        </h2>
        <p className="mt-4 max-w-sm text-lg text-white/60">
          Verifying your email helps keep our community safe and ensures you
          receive important updates about your matches and meetings.
        </p>

        <div className="mt-8 space-y-3 text-sm text-white/50">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>Protects your account from unauthorized access</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span>Ensures you get match notifications</span>
          </div>
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            <span>Earns you a verified profile badge</span>
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
// Loading spinner
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
// Resend button component (reused in multiple states)
// ---------------------------------------------------------------
function ResendButton({
  resending,
  onClick,
}: {
  resending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={resending}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {resending ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          Sending...
        </>
      ) : (
        <>
          <Mail className="h-4 w-4" />
          Resend verification email
        </>
      )}
    </button>
  );
}

// ---------------------------------------------------------------
// Main content
// ---------------------------------------------------------------
function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [status, setStatus] = useState<
    "verifying" | "success" | "error" | "expired"
  >("verifying");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  // ----- Verify on mount -----
  useEffect(() => {
    const verifyEmail = async () => {
      try {
        const registered = searchParams.get("registered");
        const emailParam = searchParams.get("email");

        if (registered === "true" && emailParam) {
          setEmail(emailParam);
          setStatus("verifying");
          setLoading(false);
          return;
        }

        const hashParams = new URLSearchParams(
          window.location.hash.substring(1)
        );
        const accessToken = hashParams.get("access_token");
        const type = hashParams.get("type");

        if (type === "signup" && accessToken) {
          setVerifying(true);

          const refreshToken = hashParams.get("refresh_token");

          if (refreshToken) {
            const { data: sessionData, error: sessionError } =
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

            if (sessionError) {
              console.error("Session error:", sessionError);
              const {
                data: { session },
              } = await supabase.auth.getSession();
              if (session?.user?.email_confirmed_at) {
                setStatus("success");
                setEmail(session.user.email || null);
                if (session.user.id) {
                  await supabase
                    .from("accounts")
                    .update({ email_verified: true })
                    .eq("id", session.user.id)
                    .then(() => {})
                    .catch(() => {});
                }
                setTimeout(() => router.push("/dashboard/profile"), 3000);
                return;
              }
              setStatus("error");
              setError("Failed to establish session");
              return;
            }

            if (sessionData.user) {
              setStatus("success");
              setEmail(sessionData.user.email || null);
              if (sessionData.user.id) {
                await supabase
                  .from("accounts")
                  .update({ email_verified: true })
                  .eq("id", sessionData.user.id)
                  .then(() => {})
                  .catch(() => {});
              }
              setTimeout(() => router.push("/dashboard/profile"), 3000);
              return;
            }
          }

          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user?.email_confirmed_at) {
            setStatus("success");
            setEmail(session.user.email || null);
            setTimeout(() => router.push("/dashboard/profile"), 3000);
            return;
          }

          setStatus("error");
          setError("Verification failed. Please try again.");
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user?.email_confirmed_at) {
            setStatus("success");
            setEmail(session.user.email || null);
          } else {
            setStatus("error");
            setError("Invalid verification link");
          }
        }
      } catch (err) {
        console.error("Verification error:", err);
        setStatus("error");
        setError(
          err instanceof Error ? err.message : "Verification failed"
        );
      } finally {
        setLoading(false);
        setVerifying(false);
      }
    };

    verifyEmail();
  }, [router, searchParams]);

  // ----- Resend handler -----
  const handleResendVerification = async () => {
    setResending(true);
    setError(null);

    try {
      const emailParam = searchParams.get("email");
      let userEmail = emailParam || email;

      if (!userEmail) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        userEmail = user?.email || null;
      }

      if (!userEmail) {
        throw new Error("No email address found. Please sign up again.");
      }

      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend verification email");
      }

      setStatus("verifying");
      setError(null);
      toast.success(
        "Verification email sent! Please check your inbox and spam folder."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to resend verification email"
      );
    } finally {
      setResending(false);
    }
  };

  // ---- Loading / Verifying ----
  if (loading || verifying) {
    return <LoadingSpinner text="Verifying your email..." />;
  }

  // ---- Post-registration waiting state ----
  if (
    status === "verifying" &&
    email &&
    searchParams.get("registered") === "true"
  ) {
    return (
      <div className="flex min-h-screen">
        <BrandPanel />
        <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:hidden">
              <Link href="/" className="inline-block">
                <Image
                  src="/matchindeed.svg"
                  alt="MatchIndeed"
                  width={150}
                  height={40}
                  style={{ width: "auto", height: "auto" }}
                />
              </Link>
            </div>

            <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-black/5 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 ring-4 ring-blue-100">
                <Mail className="h-6 w-6 text-[#1f419a]" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">
                Check your email
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                We&apos;ve sent a verification link to{" "}
                <strong className="text-gray-900">{email}</strong>
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Please click the link in the email to verify your account.
                The link will expire in 24 hours.
              </p>

              <div className="mt-6 space-y-3">
                <ResendButton
                  resending={resending}
                  onClick={handleResendVerification}
                />
                <Link
                  href="/login"
                  className="block text-sm text-[#1f419a] hover:text-[#17357b]"
                >
                  Back to login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Status card content ----
  return (
    <div className="flex min-h-screen">
      <BrandPanel />
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <Link href="/" className="inline-block">
              <Image
                src="/matchindeed.svg"
                alt="MatchIndeed"
                width={150}
                height={40}
                style={{ width: "auto", height: "auto" }}
              />
            </Link>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-black/5">
            {/* ---- Success ---- */}
            {status === "success" && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 ring-4 ring-green-100">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Email verified!
                </h2>
                <p className="text-sm text-gray-600">
                  Your email{" "}
                  {email && (
                    <strong className="text-gray-900">{email}</strong>
                  )}{" "}
                  has been successfully verified.
                </p>
                <p className="text-xs text-gray-400">
                  Redirecting to your profile...
                </p>
                <div className="pt-2">
                  <Link
                    href="/dashboard/profile"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#1f419a] hover:text-[#17357b]"
                  >
                    Go to profile
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}

            {/* ---- Expired ---- */}
            {status === "expired" && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 ring-4 ring-amber-100">
                  <XCircle className="h-6 w-6 text-amber-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Link expired
                </h2>
                <p className="text-sm text-gray-600">
                  This verification link has expired. Please request a new
                  one.
                </p>
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <ResendButton
                  resending={resending}
                  onClick={handleResendVerification}
                />
                <Link
                  href="/login"
                  className="block text-sm text-[#1f419a] hover:text-[#17357b]"
                >
                  Back to login
                </Link>
              </div>
            )}

            {/* ---- Error ---- */}
            {status === "error" && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-4 ring-red-100">
                  <XCircle className="h-6 w-6 text-red-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Verification failed
                </h2>
                <p className="text-sm text-gray-600">
                  {error ||
                    "Unable to verify your email. Please try again."}
                </p>
                <ResendButton
                  resending={resending}
                  onClick={handleResendVerification}
                />
                <Link
                  href="/login"
                  className="block text-sm text-[#1f419a] hover:text-[#17357b]"
                >
                  Back to login
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Exported page with Suspense boundary
// ---------------------------------------------------------------
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingSpinner text="Loading..." />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
