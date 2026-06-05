"use client";

import { useMemo, useState, useEffect, useCallback, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import Image from "next/image";
import {
  CheckCircle,
  Eye,
  EyeOff,
  Heart,
  Loader2,
  Lock,
  Mail,
  Shield,
  Video,
  XCircle,
} from "lucide-react";
import CloudflareTurnstile from "@/components/CloudflareTurnstile";
import { GoogleSignInButton } from "@/components/SocialAuthButtons";
import { evaluatePassword } from "@/lib/auth/validation";
import { supabase } from "@/lib/supabase";
import { normalizeLookingForOption } from "@/lib/matching/interest-preference";

type NextLinkProps = ComponentProps<typeof NextLink>;
type SignupAttribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landing_path?: string;
  signup_source?: string;
};

function Link({ prefetch, ...props }: NextLinkProps) {
  return <NextLink {...props} prefetch={prefetch ?? false} />;
}

function isEmailConfirmationError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("email not confirmed") || normalized.includes("email_not_confirmed");
}

const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

function cleanAttributionValue(value: string | null) {
  return (value || "").trim().slice(0, 120);
}

function readSignupAttribution() {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  const storedRaw = sessionStorage.getItem("matchindeedSignupAttribution");
  let stored: SignupAttribution = {};

  if (storedRaw) {
    try {
      stored = JSON.parse(storedRaw) as SignupAttribution;
    } catch {
      stored = {};
    }
  }

  const attribution: SignupAttribution = {
    ...stored,
    landing_path: stored.landing_path || window.location.pathname,
  };

  for (const key of ATTRIBUTION_KEYS) {
    const value = cleanAttributionValue(params.get(key));
    if (value) attribution[key] = value;
  }

  const ref = cleanAttributionValue(params.get("ref"));
  if (ref) {
    attribution.signup_source = attribution.utm_source || "referral_link";
  } else if (attribution.utm_source) {
    attribution.signup_source = attribution.utm_source;
  }

  sessionStorage.setItem(
    "matchindeedSignupAttribution",
    JSON.stringify(attribution)
  );
  return attribution;
}

export default function RegisterPage() {
  const router = useRouter();
  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const [entryChecked, setEntryChecked] = useState(false);
  const [initialLookingFor, setInitialLookingFor] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [signupAttribution, setSignupAttribution] = useState<SignupAttribution>({});

  const passwordValidation = useMemo(() => evaluatePassword(password), [password]);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setError(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const startedAtRaw = sessionStorage.getItem("signupStartedFromLanding");
    const searchPreferences = sessionStorage.getItem("searchPreferences");
    const referralFromUrl =
      new URLSearchParams(window.location.search).get("ref") || "";
    const attribution = readSignupAttribution();
    setSignupAttribution(attribution);

    if (referralFromUrl) {
      const normalizedReferral = referralFromUrl
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "")
        .slice(0, 32);
      setReferralCode(normalizedReferral);
      sessionStorage.setItem("matchindeedReferralCode", normalizedReferral);
    } else {
      setReferralCode(sessionStorage.getItem("matchindeedReferralCode") || "");
    }
    const startedAt = Number(startedAtRaw || "");
    const startedRecently =
      Number.isFinite(startedAt) &&
      startedAt > 0 &&
      Date.now() - startedAt < 1000 * 60 * 60 * 24;

    let parsedLookingFor: string | null = null;
    if (searchPreferences) {
      try {
        const parsed = JSON.parse(searchPreferences) as { seeking?: string };
        parsedLookingFor = normalizeLookingForOption(parsed?.seeking || "");
      } catch {
        parsedLookingFor = null;
      }
    }

    if ((!parsedLookingFor || !startedRecently) && !referralFromUrl) {
      router.replace("/?focusSignup=1");
      return;
    }

    setInitialLookingFor(parsedLookingFor);
    setEntryChecked(true);
  }, [router]);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    if (!initialLookingFor && !referralCode) {
      setError("Please start signup from the homepage form.");
      return;
    }

    if (!passwordValidation.isValid) {
      setError("Password must contain 8+ chars, uppercase, lowercase, and a number.");
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      setError("Please complete bot verification.");
      return;
    }

    setLoading(true);

    try {
      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          turnstileToken,
          initialLookingFor: initialLookingFor || "",
          referralCode: referralCode || undefined,
          attribution: signupAttribution,
        }),
      });

      const registerPayload = (await registerResponse.json()) as { error?: string };
      if (!registerResponse.ok) {
        throw new Error(registerPayload.error || "Registration failed");
      }

      if (typeof window !== "undefined") {
        sessionStorage.removeItem("signupStartedFromLanding");
        sessionStorage.removeItem("searchPreferences");
        sessionStorage.removeItem("matchindeedReferralCode");
        sessionStorage.removeItem("matchindeedSignupAttribution");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        if (isEmailConfirmationError(signInError.message)) {
          router.push(`/verify-email?email=${encodeURIComponent(email.trim())}&registered=true`);
          return;
        }

        throw new Error(signInError.message || "Account created, but automatic sign-in failed.");
      }

      router.push("/dashboard/profile/edit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred during registration");
    } finally {
      setLoading(false);
    }
  };

  if (!entryChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="mt-3 text-sm text-gray-500">Redirecting to signup start...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1e2a78] via-[#2a44a3] to-[#4463cf] p-12 lg:flex">
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />

        <Link href="/" className="relative z-10">
          <Image
            src="/matchindeed-logo-white.png"
            alt="MatchIndeed"
            width={160}
            height={42}
            style={{ width: "auto", height: "auto" }}
          />
        </Link>

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
            Create your account in one step, then continue directly to profile setup.
          </p>

          <div className="mt-8 space-y-3 text-sm text-white/60">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-300" />
              <span>Simple signup flow</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-300" />
              <span>Turnstile and fraud checks enabled</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-300" />
              <span>Profile completion starts after signup</span>
            </div>
          </div>

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

        <p className="relative z-10 text-xs text-white/30">
          &copy; {new Date().getFullYear()} MatchIndeed. All rights reserved.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <Link href="/" className="inline-block">
              <Image
                src="/matchindeed-logo-black-font.png"
                alt="MatchIndeed"
                width={150}
                height={40}
                style={{ width: "auto", height: "auto" }}
              />
            </Link>
          </div>

          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Create your account</h1>
            <p className="mt-2 text-gray-500">Enter email and password to start profile setup.</p>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-black/5">
            <GoogleSignInButton />

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-gray-400">or continue with email</span>
              </div>
            </div>

            <form onSubmit={handleRegister} className="space-y-5">
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <label className="block text-sm text-gray-700">
                <span className="mb-1.5 block font-medium">Email address</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
                    placeholder="you@example.com"
                  />
                </div>
              </label>

              <label className="block text-sm text-gray-700">
                <span className="mb-1.5 block font-medium">Password</span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-10 text-sm outline-none transition-colors focus:border-[#1f419a] focus:bg-white focus:ring-2 focus:ring-[#1f419a]/20"
                    placeholder="Create a secure password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </label>

              {password ? (
                <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full transition-all ${passwordValidation.colorClass}`}
                        style={{ width: `${(passwordValidation.score / 4) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium capitalize text-gray-700">
                      {passwordValidation.level}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                    {passwordValidation.rules.map((rule) => (
                      <div key={rule.id} className="flex items-center gap-1.5">
                        {rule.met ? (
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-gray-300" />
                        )}
                        <span className={rule.met ? "text-emerald-700" : "text-gray-500"}>
                          {rule.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {turnstileEnabled ? <CloudflareTurnstile onVerify={handleTurnstileVerify} /> : null}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create account"
                )}
              </button>
            </form>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-gray-400">Already have an account?</span>
              </div>
            </div>

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
