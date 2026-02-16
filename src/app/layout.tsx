import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DevWarningFilter } from "@/components/DevWarningFilter";
import { ToastProvider } from "@/components/ToastProvider";
import FingerprintProvider from "@/components/FingerprintProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Filters out known Next.js 16 dev warnings (params enumeration) */}
        <DevWarningFilter />
        <FingerprintProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </FingerprintProvider>
      </body>
    </html>
  );
}
