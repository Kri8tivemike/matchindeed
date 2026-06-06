import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact MatchIndeed support for account, profile, subscription, safety, or technical help.",
  alternates: {
    canonical: "/contact-us",
  },
  openGraph: {
    title: "Contact Us | MatchIndeed",
    description:
      "Contact MatchIndeed support for account, profile, subscription, safety, or technical help.",
    url: "/contact-us",
  },
  twitter: {
    card: "summary",
    title: "Contact Us | MatchIndeed",
    description:
      "Contact MatchIndeed support for account, profile, subscription, safety, or technical help.",
  },
};

export default function ContactUsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
