import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Read MatchIndeed's privacy policy and data processing terms, including what data we collect, how we use it, and your rights.",
  alternates: {
    canonical: "/privacy-policy",
  },
  openGraph: {
    title: "Privacy Policy | MatchIndeed",
    description:
      "Read MatchIndeed's privacy policy and data processing terms, including what data we collect, how we use it, and your rights.",
    url: "/privacy-policy",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy | MatchIndeed",
    description:
      "Read MatchIndeed's privacy policy and data processing terms, including what data we collect, how we use it, and your rights.",
  },
};

const lastUpdated = "February 25, 2026";

export default function PrivacyPolicyPage() {
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
          <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-500">Last Updated: {lastUpdated}</p>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">1. Introduction</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              This Privacy Policy explains how matchindeed.com (&ldquo;we,&rdquo;
              &ldquo;us,&rdquo; &ldquo;our&rdquo;) collects, uses, and protects
              your personal information.
            </p>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Firstoutlook Ltd is the data controller for MatchIndeed.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              2. Information We Collect
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">We may collect:</p>
            <h3 className="mt-4 text-base font-semibold text-gray-900">
              Account Information
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Name.</li>
              <li>Email address.</li>
              <li>Profile photos.</li>
              <li>Age, gender, and location.</li>
            </ul>
            <h3 className="mt-4 text-base font-semibold text-gray-900">Usage Data</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Login activity.</li>
              <li>Pages visited.</li>
              <li>Interaction logs.</li>
              <li>Device and browser information.</li>
            </ul>
            <h3 className="mt-4 text-base font-semibold text-gray-900">
              Scheduling and Meeting Data
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Video meeting times.</li>
              <li>Participants.</li>
              <li>Post-meeting feedback (for example, yes/no for chat unlock).</li>
            </ul>
            <h3 className="mt-4 text-base font-semibold text-gray-900">
              Communication Data
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Chat messages (only after mutual unlock).</li>
              <li>Reports or safety submissions.</li>
            </ul>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Users cannot record video meetings themselves. matchindeed.com may
              record meetings for safety and moderation purposes.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              3. How We Use Your Information
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We use your information to:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Provide and operate the dating service.</li>
              <li>Schedule and host video meetings.</li>
              <li>Enable chat after mutual consent.</li>
              <li>Improve platform performance.</li>
              <li>Detect and prevent fraud or abuse.</li>
              <li>Respond to support requests.</li>
              <li>Comply with legal obligations.</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              4. Legal Basis for Processing
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We process your data based on consent, contractual necessity,
              legitimate interests (including safety and fraud prevention), and
              legal compliance.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              5. Sharing Your Information
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We may share limited data with video hosting providers, analytics
              providers, payment processors (if applicable), and moderation or
              safety partners. We do not sell your personal data.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">6. Data Retention</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We retain your data as long as necessary to provide the service or
              comply with legal obligations. You may request account deletion at
              any time.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">7. Your Rights</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Depending on your jurisdiction, you may have rights to access your
              data, correct inaccurate data, request deletion, restrict
              processing, withdraw consent, and request a copy of your data.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">8. Cookies</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We use cookies for authentication, analytics, and improving user
              experience. You may disable cookies in your browser settings. See
              our{" "}
              <Link href="/cookie-policy" className="text-[#1f419a] hover:underline">
                Cookie Policy
              </Link>{" "}
              for details.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">9. Security</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We use industry-standard measures to protect your data. No system
              is 100% secure, but we take reasonable steps to safeguard your
              information.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">10. Children</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Our service is not intended for individuals under 18. We do not
              knowingly collect data from minors.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              11. International Transfers
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Your data may be processed in countries outside your own. We use
              safeguards, including contractual clauses, to protect your
              information.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              12. Changes to This Policy
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We may update this Privacy Policy from time to time. Continued use
              of the platform indicates acceptance of the updated policy.
            </p>
          </section>

          <hr className="my-10 border-gray-200" />

          <h2 className="text-2xl font-bold text-gray-900">
            Data Processing Addendum (DPA)
          </h2>
          <p className="mt-2 text-sm text-gray-500">Last Updated: {lastUpdated}</p>
          <p className="mt-4 text-sm leading-7 text-gray-700">
            This Data Processing Addendum forms part of the Terms of Service and
            governs how matchindeed.com processes personal data when providing
            platform services.
          </p>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">1. Definitions</h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              In this DPA, Personal Data means any information relating to an
              identified or identifiable person, Processing means any operation
              performed on Personal Data, Controller means the entity that
              determines why and how data is processed, Processor means the
              entity that processes Personal Data on behalf of the Controller,
              and Sub-processor means any third party engaged by the Processor.
              Applicable laws include GDPR, UK GDPR, and relevant privacy laws.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              2. Roles of the Parties
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Firstoutlook Ltd is the Controller for MatchIndeed and determines the
              purpose and means of processing. matchindeed.com, acting as Processor
              where applicable, processes Personal Data only to provide the services
              under the Agreement.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              3. Subject Matter and Duration
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Processing occurs for the duration of the Agreement and only for
              service delivery, including account creation, profile
              verification, video-meeting scheduling, in-platform video
              hosting, mutual-consent chat unlocking, and support/safety
              operations.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              4. Nature and Purpose of Processing
            </h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Operating the dating platform.</li>
              <li>Authenticating users.</li>
              <li>Scheduling and hosting secure video sessions.</li>
              <li>Enabling chat after mutual consent.</li>
              <li>Fraud detection and safety monitoring.</li>
              <li>Technical support and troubleshooting.</li>
            </ul>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              Personal Data is not processed for unrelated purposes.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              5. Types of Personal Data Processed
            </h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Account information (name, email, age, profile photos).</li>
              <li>Verification data (selfies or ID checks where applicable).</li>
              <li>Scheduling data (availability and meeting times).</li>
              <li>Video metadata for platform operation.</li>
              <li>Chat messages (after mutual unlock).</li>
              <li>Technical data (IP address, device info, logs).</li>
              <li>User safety reports.</li>
            </ul>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              6. Processor Obligations
            </h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Process data only on documented instructions.</li>
              <li>Apply technical and organizational safeguards.</li>
              <li>Ensure confidentiality obligations for staff.</li>
              <li>Assist with data subject requests.</li>
              <li>Notify of breaches without undue delay.</li>
              <li>Maintain processing records.</li>
              <li>Delete or return data when required at termination.</li>
            </ul>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              matchindeed.com does not sell Personal Data.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              7. Sub-processors
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Sub-processors may be used for hosting, analytics, payments,
              security, and fraud prevention. They are contractually required to
              maintain protections equivalent to this DPA.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              8. International Transfers
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              If data is transferred outside the UK or EEA, safeguards such as
              Standard Contractual Clauses (SCCs), the UK International Data
              Transfer Addendum, or equivalent protections are applied.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              9. Data Subject Rights
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Assistance is provided for requests related to access,
              rectification, erasure, restriction, portability, and objection.
              Responses are handled according to legal role and applicable law.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              10. Security Measures
            </h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Encryption in transit and at rest.</li>
              <li>Access controls and authentication.</li>
              <li>Regular security audits.</li>
              <li>Incident response procedures.</li>
              <li>Data minimization practices.</li>
            </ul>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              11. Data Breach Notification
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              In the event of a personal data breach, appropriate parties are
              notified without undue delay and reasonable support is provided for
              mitigation and required reporting.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              12. Return or Deletion of Data
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Upon termination of services, Personal Data is deleted or returned
              as required, unless retention is legally required.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">13. Audit Rights</h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Compliance materials such as security documentation, reports, and
              applicable third-party audit summaries may be provided on request.
              On-site audits may be available with notice and confidentiality
              safeguards.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">14. Liability</h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Liability under this DPA follows the Agreement and does not expand
              or limit liability beyond agreed terms.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              15. Governing Law
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              This DPA is governed by the applicable laws stated in the
              Agreement.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
