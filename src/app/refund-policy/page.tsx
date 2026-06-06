import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "Read MatchIndeed's refund and subscription policy, including billing, renewals, cancellations, and refund eligibility.",
  alternates: {
    canonical: "/refund-policy",
  },
  openGraph: {
    title: "Refund Policy | MatchIndeed",
    description:
      "Read MatchIndeed's refund and subscription policy, including billing, renewals, cancellations, and refund eligibility.",
    url: "/refund-policy",
  },
  twitter: {
    card: "summary",
    title: "Refund Policy | MatchIndeed",
    description:
      "Read MatchIndeed's refund and subscription policy, including billing, renewals, cancellations, and refund eligibility.",
  },
};

const lastUpdated = "February 25, 2026";

export default function RefundPolicyPage() {
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
            Refund and Subscription Policy
          </h1>
          <p className="mt-2 text-sm text-gray-500">Last Updated: {lastUpdated}</p>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              1. Subscription Overview
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              MatchIndeed offers paid subscription plans with enhanced features
              such as priority visibility, added meeting requests, expanded
              scheduling options, and premium profile tools. Plans may be billed
              monthly, quarterly, or annually.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              2. Billing and Payment
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Payments are processed by secure third-party providers. By
              subscribing, you authorize recurring charges until cancellation.
              Pricing may change with advance notice.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">3. Free Accounts</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Creating an account is free. Free accounts have limited access to
              some features. Upgrading to a paid plan is optional.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              4. Automatic Renewal
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Subscriptions renew automatically at the end of each billing cycle
              unless cancelled before renewal.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              5. Cancellation Policy
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              You can cancel at any time in account settings. Cancellation stops
              future billing and paid features remain active until the current
              period ends.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">6. Refund Policy</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Subscription fees are generally non-refundable because digital
              access starts immediately. Refunds may be considered for duplicate
              charges, verified platform-side technical failure, unauthorized
              transactions with evidence, or where local law requires it.
            </p>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              Refund requests should be submitted within 14 days of the charge.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              7. Cases Not Eligible for Refund
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Refunds are not provided for change of mind, lack of matches,
              scheduling conflicts, unused service time, local device/internet
              issues, or chat that remains locked due to non-mutual interest.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">8. Chargebacks</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              If a chargeback is initiated, account access may be limited while
              reviewed. Repeated chargebacks may result in account closure.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">9. Trial Periods</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              If trials are offered, billing begins at the end of the trial
              unless cancelled before expiry.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              10. Changes to Subscription Plans
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Plans and features may be changed or discontinued. When applicable,
              users will be notified and provided available transition options.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
