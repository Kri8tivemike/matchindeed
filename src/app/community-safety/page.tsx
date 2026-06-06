import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community Safety",
  description:
    "Read MatchIndeed's community safety guidelines covering respectful behavior, reporting, and moderation standards.",
  alternates: {
    canonical: "/community-safety",
  },
  openGraph: {
    title: "Community Safety | MatchIndeed",
    description:
      "Read MatchIndeed's community safety guidelines covering respectful behavior, reporting, and moderation standards.",
    url: "/community-safety",
  },
  twitter: {
    card: "summary",
    title: "Community Safety | MatchIndeed",
    description:
      "Read MatchIndeed's community safety guidelines covering respectful behavior, reporting, and moderation standards.",
  },
};

const lastUpdated = "February 25, 2026";

export default function CommunitySafetyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="inline-flex items-center">
            <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={110} height={28} style={{ width: "auto", height: "auto" }} />
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-[#1f419a] hover:underline"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Safety and Community Guidelines
          </h1>
          <p className="mt-2 text-sm text-gray-500">Last Updated: {lastUpdated}</p>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              1. Core Principles
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Respect for all members.</li>
              <li>Mutual consent in all interactions.</li>
              <li>Zero tolerance for harassment or abuse.</li>
              <li>Privacy and personal boundaries.</li>
              <li>Authenticity and honesty.</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              2. Member Responsibilities
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Use accurate profile photos and truthful information.</li>
              <li>Treat others with courtesy and maturity.</li>
              <li>No sexual content, hate speech, or abusive conduct.</li>
              <li>Do not record meetings without explicit consent.</li>
              <li>Do not pressure users to share personal contact details.</li>
              <li>Follow mutual-consent chat unlock rules.</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              3. Video Meeting Safety
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Use a well-lit and neutral setting.</li>
              <li>Dress appropriately.</li>
              <li>Do not share sensitive personal information.</li>
              <li>End meetings if you feel unsafe.</li>
              <li>Report inappropriate behavior quickly.</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              4. Chat Unlock Rules
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Chat opens only when both members confirm interest after a video
              meeting. Attempts to bypass this system may result in moderation
              action.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              5. Prohibited Behavior
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Harassment, threats, intimidation, or hate speech.</li>
              <li>Sexual content or nudity during meetings.</li>
              <li>Scams, fraud, or financial solicitation.</li>
              <li>Impersonation or fake profiles.</li>
              <li>Recording or screenshots without consent.</li>
              <li>Sharing another member&apos;s private information.</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              6. Reporting and Moderation
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Reporting tools are available on profile and meeting surfaces.
              Reports are reviewed by the safety team and may lead to temporary
              or permanent account action.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              7. Privacy and Personal Boundaries
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Protect your privacy by avoiding home addresses or financial
              details, and by using in-platform communication until you are
              comfortable.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              8. Consequences for Violations
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Depending on severity, actions can include warnings, suspension,
              permanent removal, or referral to law enforcement for serious
              violations.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
