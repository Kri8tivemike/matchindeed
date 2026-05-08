"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Mail, Send, ShieldCheck, HelpCircle, LogIn, LogOut, UserCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const SUPPORT_EMAIL = "help@matchindeed.com";
const REASONS = [
  "Account Login Issue",
  "Profile Verification",
  "Payment / Subscription",
  "Report a User",
  "Technical Problem",
  "Delete My Account",
  "General Question",
  "Other",
] as const;

export default function ContactUsPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("General Question");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<{ id: string; email: string | null } | null>(null);
  const authMenuRef = useRef<HTMLDivElement | null>(null);

  const navItems = [
    { label: "Home", href: "/" },
    { label: "How It Works", href: "/#how-it-works" },
    { label: "Features", href: "/#features" },
    { label: "FAQ", href: "/#faq" },
    { label: "About Us", href: "/about-us" },
  ];

  useEffect(() => {
    const hydrateUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setAuthUser(user ? { id: user.id, email: user.email || null } : null);
      setAuthLoading(false);
      if (!user) return;
      setEmail(user.email || "");

      const [{ data: profile }, { data: account }] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("first_name")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("accounts")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      const resolvedName =
        (profile?.first_name || "").trim() ||
        (account?.display_name || "").trim() ||
        "";
      if (resolvedName) {
        setFullName(resolvedName);
      }
    };

    void hydrateUser();
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(
        session?.user
          ? { id: session.user.id, email: session.user.email || null }
          : null
      );
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authMenuOpen) return;

    const onDocumentClick = (event: MouseEvent) => {
      if (!authMenuRef.current) return;
      if (!authMenuRef.current.contains(event.target as Node)) {
        setAuthMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [authMenuOpen]);

  const handleSignOut = useCallback(async () => {
    setAuthMenuOpen(false);
    setMobileMenuOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign out error:", error);
      return;
    }
    router.push("/");
  }, [router]);

  const canSubmit = useMemo(
    () => fullName.trim() && email.trim() && reason.trim() && message.trim(),
    [fullName, email, reason, message]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          reason,
          message,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({
          type: "error",
          message:
            typeof payload.error === "string"
              ? payload.error
              : "We couldn't send your request right now. Please try again.",
        });
        return;
      }

      setStatus({
        type: "success",
        message: "Your support request has been sent. Our team will respond through email.",
      });
      setMessage("");
      setReason("General Question");
    } catch {
      setStatus({
        type: "error",
        message: "We couldn't send your request right now. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f8fc]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-gradient-to-r from-[#1e2a78] to-[#2a44a3] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/matchindeed-logo-white.png"
              alt="MatchIndeed"
              width={112}
              height={28}
              priority
              style={{ width: "auto", height: "auto" }}
            />
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-white/80 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="transition-colors hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {authLoading ? (
              <div className="h-9 w-9 rounded-full border border-white/20 bg-white/10" />
            ) : authUser ? (
              <div ref={authMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAuthMenuOpen((prev) => !prev)}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/30 px-3 text-sm text-white/90 transition-colors hover:bg-white/10"
                  aria-label="Open account menu"
                >
                  <UserCircle2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Account</span>
                </button>

                {authMenuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5">
                    <Link
                      href="/dashboard"
                      onClick={() => setAuthMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <UserCircle2 className="h-4 w-4" />
                      View account
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-white/30 px-3 text-sm text-white/90 transition-colors hover:bg-white/10"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Login</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="ml-2 rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 md:hidden"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? "Close" : "Menu"}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-white/10 px-6 py-4 md:hidden">
            <nav className="flex flex-col items-center gap-3 text-center text-sm text-white/80">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1 transition-colors hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
              {authLoading ? (
                <span className="mt-2 py-1 text-white/70">Loading...</span>
              ) : authUser ? (
                <>
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="mt-2 py-1 transition-colors hover:text-white"
                  >
                    View account
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-2 py-1 text-white/80 transition-colors hover:text-white"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="mt-2 py-1 transition-colors hover:text-white"
                >
                  Login
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
        <section className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#1f419a]/8 px-4 py-2 text-sm font-semibold text-[#1f419a]">
            <HelpCircle className="h-4 w-4" />
            Contact MatchIndeed Support
          </span>

          <div className="space-y-4">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Need help with your account, profile, or subscription?
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Send a support request and our team will review it as quickly as possible. All fields
              are required so we can help you properly on the first reply.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#dbe4ff] bg-white p-5 shadow-sm">
              <Mail className="mb-3 h-5 w-5 text-[#1f419a]" />
              <p className="text-sm font-semibold text-slate-900">Support email</p>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 block text-sm text-[#1f419a] hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </div>
            <div className="rounded-2xl border border-[#dbe4ff] bg-white p-5 shadow-sm">
              <ShieldCheck className="mb-3 h-5 w-5 text-[#1f419a]" />
              <p className="text-sm font-semibold text-slate-900">Best for faster support</p>
              <p className="mt-1 text-sm text-slate-600">
                Choose the reason that matches your issue and include key details in the form.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#dbe4ff] bg-white p-6 shadow-[0_20px_60px_rgba(31,65,154,0.12)] sm:p-8">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="fullName" className="text-sm font-semibold text-slate-900">
                Full Name
              </label>
              <input
                id="fullName"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1f419a] focus:ring-4 focus:ring-[#1f419a]/10"
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-semibold text-slate-900">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1f419a] focus:ring-4 focus:ring-[#1f419a]/10"
                placeholder="Enter your email address"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reason" className="text-sm font-semibold text-slate-900">
                Reason for contacting us
              </label>
              <select
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value as (typeof REASONS)[number])}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1f419a] focus:ring-4 focus:ring-[#1f419a]/10"
                required
              >
                {REASONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="message" className="text-sm font-semibold text-slate-900">
                Describe Your Issue
              </label>
              <textarea
                id="message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-[170px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1f419a] focus:ring-4 focus:ring-[#1f419a]/10"
                placeholder="Tell us what happened, what you expected, and any details that can help us assist you faster."
                required
              />
            </div>

            <div className="rounded-2xl bg-[#f6f8fc] px-4 py-3 text-sm text-slate-600">
              <strong className="text-slate-900">Note:</strong> All support fields are required so our team can investigate properly.
            </div>

            {status && (
              <div
                className={`rounded-2xl px-4 py-3 text-sm ${
                  status.type === "success"
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-red-50 text-red-700 ring-1 ring-red-200"
                }`}
              >
                {status.message}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1f419a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#17357b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {submitting ? "Sending request..." : "Send Support Request"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
