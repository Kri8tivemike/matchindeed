import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Learn how MatchIndeed uses cookies and similar technologies to support security, performance, and core platform features.",
};

const lastUpdated = "February 25, 2026";

export default function CookiePolicyPage() {
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
          <h1 className="text-3xl font-bold text-gray-900">Cookie Policy</h1>
          <p className="mt-2 text-sm text-gray-500">Last Updated: {lastUpdated}</p>

          <p className="mt-6 text-sm leading-7 text-gray-700">
            This Cookie Policy explains how matchindeed.com (&ldquo;we,&rdquo;
            &ldquo;us,&rdquo; &ldquo;our&rdquo;) uses cookies and similar
            technologies on our website. By using our platform, you agree to
            the use of cookies as described in this policy.
          </p>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              1. What Are Cookies
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Cookies are small text files stored on your device when you visit
              a website. They help websites function properly, improve
              performance, and provide insights into how users interact with the
              platform.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Session cookies: deleted when you close your browser.</li>
              <li>
                Persistent cookies: remain until they expire or are deleted.
              </li>
              <li>First-party cookies: set by matchindeed.com.</li>
              <li>
                Third-party cookies: set by external service providers.
              </li>
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              2. Why We Use Cookies
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We use cookies to support core platform functionality, improve
              reliability, and enhance your experience.
            </p>

            <h3 className="mt-4 text-base font-semibold text-gray-900">
              Essential Cookies
            </h3>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              Required for the website to function. These enable:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Account login.</li>
              <li>Security and authentication.</li>
              <li>Scheduling and video-meeting features.</li>
              <li>Chat unlock logic.</li>
              <li>Page navigation and basic functionality.</li>
            </ul>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              You cannot disable these cookies because the platform will not
              work without them.
            </p>

            <h3 className="mt-4 text-base font-semibold text-gray-900">
              Performance and Analytics Cookies
            </h3>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              Help us understand how users interact with the site so we can
              improve:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Page load times.</li>
              <li>Feature usage (for example, calendar and video meetings).</li>
              <li>Error tracking.</li>
              <li>User flow and navigation.</li>
            </ul>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              We may use trusted analytics providers (for example, Google
              Analytics) for this purpose.
            </p>

            <h3 className="mt-4 text-base font-semibold text-gray-900">
              Functionality Cookies
            </h3>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              Enhance your experience by remembering:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Profile preferences.</li>
              <li>Video settings.</li>
              <li>Language or region.</li>
              <li>Calendar availability.</li>
            </ul>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              These cookies are optional but improve usability.
            </p>

            <h3 className="mt-4 text-base font-semibold text-gray-900">
              Third-Party Cookies
            </h3>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              Used only when necessary for:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Video hosting and streaming.</li>
              <li>Fraud detection.</li>
              <li>Security services.</li>
              <li>Payment processing (if applicable).</li>
            </ul>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              We do not use third-party cookies for advertising or cross-site
              tracking.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              3. Cookies We Do Not Use
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              To protect your privacy, we do not use:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Advertising cookies.</li>
              <li>Behavioral tracking cookies.</li>
              <li>Social media tracking pixels.</li>
              <li>Cross-site retargeting cookies.</li>
            </ul>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              Your activity on matchindeed.com is not used to target ads on
              other platforms.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              4. Managing Cookies
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              You can control or delete cookies through your browser settings.
              Most browsers allow you to block cookies, delete existing cookies,
              and set preferences for specific sites.
            </p>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              However, blocking essential cookies may prevent the platform from
              functioning, including:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Logging in.</li>
              <li>Scheduling video dates.</li>
              <li>Joining video meetings.</li>
              <li>Unlocking chat.</li>
            </ul>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              For the best experience, we recommend allowing essential and
              functional cookies.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              5. Third-Party Providers
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We may use third-party services that set cookies to support:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-gray-700">
              <li>Video meeting infrastructure.</li>
              <li>Analytics.</li>
              <li>Security and fraud prevention.</li>
              <li>Load balancing and performance optimization.</li>
            </ul>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              These providers are contractually required to protect your data
              and comply with privacy laws.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              6. Changes to This Cookie Policy
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We may update this Cookie Policy from time to time. When we make
              changes, we will update the &ldquo;Last Updated&rdquo; date at the
              top of this page.
            </p>
            <p className="mt-2 text-sm leading-7 text-gray-700">
              Continued use of the platform after changes are posted means you
              accept the updated policy.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
