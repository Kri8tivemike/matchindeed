import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Learn about MatchIndeed, a digital booking and video-meeting platform owned and operated by Firstoutlook Ltd (UK).",
  alternates: {
    canonical: "/about-us",
  },
  openGraph: {
    title: "About Us | MatchIndeed",
    description:
      "Learn about MatchIndeed, a digital booking and video-meeting platform owned and operated by Firstoutlook Ltd (UK).",
    url: "/about-us",
  },
  twitter: {
    card: "summary",
    title: "About Us | MatchIndeed",
    description:
      "Learn about MatchIndeed, a digital booking and video-meeting platform owned and operated by Firstoutlook Ltd (UK).",
  },
};

const lastUpdated = "February 25, 2026";

export default function AboutUsPage() {
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
          <h1 className="text-3xl font-bold text-gray-900">About Us</h1>
          <p className="mt-2 text-sm text-gray-500">Last Updated: {lastUpdated}</p>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              Ownership and Operations
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              MatchIndeed is a digital booking and video‑meeting platform owned and
              operated by Firstoutlook Ltd (UK).
            </p>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              MatchIndeed is owned and operated by Firstoutlook Ltd, a
              UK‑registered business. DI‑YIELDCOM GLOBAL SERVICES provides additional
              technology development and operational support for the platform.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">Our Mission</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              matchindeed.com helps people form genuine connections by
              prioritizing real conversations over endless text. We believe
              chemistry is best discovered face-to-face, so we make video dating
              the first step.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">Who We Serve</h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We serve people who want serious and respectful dating experiences,
              including professionals, busy singles, and anyone who prefers a
              focused face-to-face environment for meeting new people.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold text-gray-900">
              What Makes Us Different
            </h2>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We reduce endless messaging by making the video date the primary
              interaction. Private messaging is only unlocked when both members
              mutually agree to continue.
            </p>
          </section>

          <hr className="my-10 border-gray-200" />

          <h2 className="text-2xl font-bold text-gray-900">Safety</h2>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              Verification and Moderation
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              We use profile verification and active moderation to reduce fake
              accounts and abusive behavior.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              Privacy Controls
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              You control what personal details you share. Video meetings are
              hosted in-platform and are not publicly accessible.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              Respectful Conduct
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              Harassment, threats, and abusive language are not tolerated during
              meetings and may result in suspension.
            </p>
          </section>

          <section className="mt-8">
            <h3 className="text-base font-semibold text-gray-900">
              Reporting and Support
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-700">
              If you encounter suspicious behavior during or after a meeting,
              report the profile immediately. Our support team reviews reports
              and takes action.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
