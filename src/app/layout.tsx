import type { Metadata } from "next";
import { Suspense, type CSSProperties } from "react";
import "./globals.css";
import { IdleSessionTimeout } from "@/components/auth/IdleSessionTimeout";
import { DevWarningFilter } from "@/components/DevWarningFilter";
import { ToastProvider } from "@/components/ToastProvider";
import FingerprintProvider from "@/components/FingerprintProvider";
import MarketingTrackingPixels from "@/components/tracking/MarketingTrackingPixels";

const fallbackFontVars = {
  "--font-geist-sans":
    "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  "--font-geist-mono":
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
} as CSSProperties;

export const metadata: Metadata = {
  title: {
    default: "MatchIndeed — Discover Singles Near You",
    template: "%s | MatchIndeed",
  },
  description:
    "MatchIndeed helps you discover and connect with compatible singles near you. Browse profiles, find your match, and request video meetings — all in one place.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://www.matchindeed.com"
  ),
  openGraph: {
    title: "MatchIndeed — Discover Singles Near You",
    description:
      "Browse profiles, find your match, and request video meetings.",
    siteName: "MatchIndeed",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "600x600" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "600x600", type: "image/png" }],
  },
  /** Google Search Console verification — replace with your actual tag */
  verification: {
    google: process.env.NEXT_PUBLIC_GSC_VERIFICATION || "",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" style={fallbackFontVars}>
        {/* Filters out known Next.js 16 dev warnings (params enumeration) */}
        <DevWarningFilter />
        <FingerprintProvider>
          <ToastProvider>
            <IdleSessionTimeout />
            <Suspense fallback={null}>
              <MarketingTrackingPixels />
            </Suspense>
            {children}
          </ToastProvider>
        </FingerprintProvider>
      </body>
    </html>
  );
}
