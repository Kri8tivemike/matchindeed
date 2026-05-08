import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read MatchIndeed's terms of service for account eligibility, user conduct, platform rules, and legal terms.",
};

const lastUpdated = "February 25, 2026";

export default function TermsOfServicePage() {
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
          <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
          <p className="mt-2 text-sm text-gray-500">Last Updated: {lastUpdated}</p>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              1. Acceptance of Terms
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              By creating an account or using matchindeed.com, you agree to these
              Terms of Service. If you do not agree, do not use the platform.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">2. Eligibility</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              You must be at least 18 years old and legally able to enter a
              binding agreement. Users who were previously suspended or removed
              may not use the platform.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              3. Description of Service
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              matchindeed.com is an online dating service that allows members to
              create a profile, request and schedule video meetings, join
              in-platform video calls, and unlock chat only after mutual consent
              following a meeting.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              4. Account Registration
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              You must provide accurate information and keep your login details
              secure. You are responsible for all activity under your account.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">5. User Conduct</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              You agree not to harass others, impersonate another person, upload
              illegal or infringing content, bypass chat-unlock rules, record
              video meetings without consent, or use the platform for
              commercial/promotional activity.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              6. Scheduling and Video Meetings
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Meetings are requested through the platform calendar and are only
              confirmed when accepted by the other member.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              7. Chat Unlock System
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Chat is available only when both members confirm mutual interest
              after a video meeting. If either member declines, chat remains
              closed.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              8. Content Ownership
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              You retain ownership of your content. By uploading content, you
              grant matchindeed.com a non-exclusive, worldwide, royalty-free
              license to display and distribute content solely to operate the
              platform.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              9. Safety and Reporting
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We provide reporting tools and may review, suspend, or remove
              accounts that violate these terms.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">10. Privacy</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Your use of the platform is also governed by our{" "}
              <Link href="/privacy-policy" className="text-[#1f419a] hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              11. Third-Party Services
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              The platform may use third-party providers for video hosting,
              analytics, and payment processing.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">12. Termination</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We may suspend or terminate accounts that violate these terms or
              threaten user safety.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">13. Disclaimers</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              The platform is provided as-is. We do not guarantee matches,
              successful dates, or specific outcomes.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              14. Limitation of Liability
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              To the fullest extent allowed by law, matchindeed.com is not
              liable for indirect, incidental, or consequential damages arising
              from use of the platform.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">15. Governing Law</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              These terms are governed by applicable Nigerian law.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              16. Changes to Terms
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We may update these terms from time to time. Continued use of the
              platform after updates means you accept the revised terms.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
