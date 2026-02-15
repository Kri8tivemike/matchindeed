/**
 * Custom 404 — Not Found Page
 * ----------------------------
 * Displayed when a user navigates to a route that doesn't exist.
 * Provides clear messaging and a quick way back to the dashboard.
 */

import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 text-center">
      {/* Logo */}
      <Link href="/" className="mb-8">
        <Image
          src="/matchindeed.svg"
          alt="Matchindeed"
          width={180}
          height={46}
          priority
          style={{ width: "auto", height: "auto" }}
        />
      </Link>

      {/* Illustration */}
      <div className="relative mb-8">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-[#1f419a]/10 to-[#2a44a3]/10">
          <span className="text-7xl font-bold bg-gradient-to-r from-[#1f419a] to-[#2a44a3] bg-clip-text text-transparent">
            404
          </span>
        </div>
        {/* Decorative hearts */}
        <span className="absolute -top-2 -right-4 text-2xl opacity-40 animate-bounce" style={{ animationDelay: "0s" }}>
          💔
        </span>
        <span className="absolute -bottom-2 -left-4 text-xl opacity-30 animate-bounce" style={{ animationDelay: "0.5s" }}>
          💔
        </span>
      </div>

      {/* Copy */}
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
        Page Not Found
      </h1>
      <p className="mt-3 max-w-md text-sm text-gray-500 sm:text-base">
        Looks like this page doesn&apos;t exist. Don&apos;t worry — your perfect
        match is still out there!
      </p>

      {/* Actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all hover:scale-105"
        >
          Go to Dashboard
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-all"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
