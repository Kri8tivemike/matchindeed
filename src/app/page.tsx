"use client";

/**
 * Landing Page — MatchIndeed
 *
 * Full marketing page with:
 * - Sticky header with working nav anchors
 * - Hero section with search form
 * - "How It Works" steps
 * - Features / benefits
 * - Testimonials / social proof
 * - Pricing overview
 * - FAQ accordion
 * - CTA banner
 * - Footer
 */

import Image from "next/image";
import NextLink from "next/link";
import {
  ChevronDown,
  Video,
  Shield,
  Heart,
  Users,
  Star,
  CheckCircle,
  MessageCircle,
  Calendar,
  Sparkles,
  ArrowRight,
  ChevronUp,
  LogIn,
  LogOut,
  UserCircle2,
} from "lucide-react";
import { useState, useEffect, useCallback, FormEvent, useRef, type ComponentProps, type SVGProps } from "react";
import { useRouter } from "next/navigation";
import AgeSelect from "@/components/AgeSelect";
import GooglePlacesAutocomplete from "@/components/GooglePlacesAutocomplete";
import { isLikelyGoogleSuggestedLocation, normalizeLocation } from "@/lib/location";
import { supabase } from "@/lib/supabase";

type NextLinkProps = ComponentProps<typeof NextLink>;

function Link({ prefetch, ...props }: NextLinkProps) {
  return <NextLink {...props} prefetch={prefetch ?? false} />;
}

// ---------------------------------------------------------------
// FAQ data
// ---------------------------------------------------------------
type FaqItem = {
  q: string;
  a: string | string[];
};

const SHOW_HOME_PRICING_SECTION = false;

type SocialIconProps = SVGProps<SVGSVGElement>;

const FacebookIcon = (props: SocialIconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" {...props}>
    <path d="M14.1 8.2V6.6c0-.8.3-1.2 1.2-1.2h1.6V2.6c-.8-.1-1.7-.2-2.5-.2-2.6 0-4.3 1.6-4.3 4.5v1.3H7.3v3.2h2.8v8.2h3.5v-8.2h2.8l.4-3.2h-3Z" />
  </svg>
);

const XIcon = (props: SocialIconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" {...props}>
    <path d="M14.3 10.3 22.1 1h-1.9l-6.8 8.1L8 1H1.8l8.2 12.1L1.8 23h1.9l7.2-8.6 5.8 8.6h6.2l-8.6-12.7Zm-2.5 3-1-.1L3.3 2.4h3.8l14.1 19.2h-3.8l-5.6-8.3Z" />
  </svg>
);

const TikTokIcon = (props: SocialIconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" {...props}>
    <path d="M16.6 2.4c.4 2.5 1.8 4 4.2 4.2v3.2c-1.4.1-2.7-.3-4.1-1.1v6.1c0 3.1-1.9 6.2-6.2 6.2-3.2 0-5.8-2.2-5.8-5.5 0-3.7 3.2-6.2 7.1-5.5v3.4c-1.8-.6-3.8.3-3.8 2.1 0 1.4 1.1 2.2 2.4 2.2 1.5 0 2.5-.9 2.5-2.9V2.4h3.7Z" />
  </svg>
);

const InstagramIcon = (props: SocialIconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const LinkedInIcon = (props: SocialIconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" {...props}>
    <path d="M5.3 8.9H2.1v12.2h3.2V8.9ZM3.7 3C2.6 3 1.8 3.8 1.8 4.8s.8 1.8 1.9 1.8 1.9-.8 1.9-1.8S4.8 3 3.7 3Zm17 11.2c0-3.3-1.8-5.5-4.6-5.5-1.6 0-2.7.9-3.2 1.8V8.9H9.8v12.2H13v-6.7c0-1.8 1-2.7 2.3-2.7s2.1.9 2.1 2.7v6.7h3.3v-6.9Z" />
  </svg>
);

const YouTubeIcon = (props: SocialIconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" {...props}>
    <path d="M22 7.5c-.2-1.5-1.2-2.6-2.7-2.8C17.2 4.4 12 4.4 12 4.4s-5.2 0-7.3.3C3.2 4.9 2.2 6 2 7.5 1.7 9.1 1.7 12 1.7 12s0 2.9.3 4.5c.2 1.5 1.2 2.6 2.7 2.8 2.1.3 7.3.3 7.3.3s5.2 0 7.3-.3c1.5-.2 2.5-1.3 2.7-2.8.3-1.6.3-4.5.3-4.5s0-2.9-.3-4.5ZM10 15.4V8.6l5.7 3.4-5.7 3.4Z" />
  </svg>
);

const socialLinks = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/share/1BB97ojT7q/",
    Icon: FacebookIcon,
  },
  {
    label: "X",
    href: "https://x.com/matchindeed",
    Icon: XIcon,
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@matchindeed",
    Icon: TikTokIcon,
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/matchindeed?igsh=MWRwaHBscWFmcHJldg==",
    Icon: InstagramIcon,
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/115991553/admin/dashboard/",
    Icon: LinkedInIcon,
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@Matchindeeddating",
    Icon: YouTubeIcon,
  },
];

const faqs = [
  {
    q: "What is MatchIndeed?",
    a: "MatchIndeed is a video-first dating platform where people meet through short video dates before chat unlocks. It is built for real, face-to-face connection rather than endless texting.",
  },
  {
    q: "Do I need to download an app?",
    a: "No. MatchIndeed works directly in your browser, so no app download is required.",
  },
  {
    q: "How do I create an account?",
    a: [
      "Sign up with your email address.",
      "Upload at least 2 real photos of yourself.",
      "Complete your profile and write a short bio.",
      "Set your video-date availability to start receiving requests.",
    ],
  },
  {
    q: "How do I schedule a video date?",
    a: [
      "Browse profiles and open the person you want to meet.",
      "Choose one of their available time slots.",
      "Send a booking request from their calendar.",
    ],
  },
  {
    q: "What happens after I send a booking request?",
    a: "The other user can accept or decline. If both sides complete the required confirmations, MatchIndeed finalizes the meeting and prepares the join details.",
  },
  {
    q: "What if the other person does not respond?",
    a: "Unanswered requests expire automatically after 24 hours. The slot is released again, and the meeting is not scheduled.",
  },
  {
    q: "Can I reschedule a video date?",
    a: "Yes, as long as the date has not started and the slot is still eligible under the scheduling rules in your account.",
  },
  {
    q: "How does time-zone alignment work?",
    a: "MatchIndeed automatically aligns times to each user's local country time zone, so both people see the correct local meeting time.",
  },
  {
    q: "What is the difference between a subscription, wallet, and credits?",
    a: "Your subscription activates your paid plan benefits. New signups can host one free starter slot before subscribing. Your wallet stores credit purchases, and credits are used for eligible booking-related actions while your subscription is active. Wallet access unlocks after your first successful subscription payment.",
  },
  {
    q: "What are calendar slot days?",
    a: "Calendar slot days are the number of days in a month that your profile can be open for booking video dates. Your plan controls how many availability days you can open.",
  },
  {
    q: "How many calendar slot days come with each plan?",
    a: [
      "Basic: 5 days per month",
      "Standard: 15 days per month",
      "Premium: 30 days per month",
      "VIP: Unlimited",
    ],
  },
  {
    q: "What happens when I use all my slot days?",
    a: "Once your slot-day allowance is fully used, you cannot open more availability days for that cycle. To open more days, you need to upgrade your plan. Credits do not create extra slot days on their own.",
  },
  {
    q: "Can I still book other people if my own slot days are finished?",
    a: "Yes. Your personal slot-day limit affects how available you are to others. You can still request or book other users while your subscription is active and you have enough credits for the action.",
  },
  {
    q: "When are credits charged?",
    a: [
      "When you send a booking request.",
      "When you accept a request where a confirmation fee applies.",
      "When extra booking or calendar actions require paid credits after included allowances are used.",
      "Late cancellation or no-show rules may also affect credit refunds or forfeits.",
    ],
  },
  {
    q: "Do credits expire?",
    a: "Credits do not expire unless a promotional offer specifically says otherwise. Unused credits can continue into your next active subscription cycle.",
  },
  {
    q: "Is my video date private or recorded?",
    a: "Video dates are private within MatchIndeed and are not publicly visible. Standard user video dates are not recorded by default.",
  },
  {
    q: "How does chat unlock after a video date?",
    a: "After the meeting, both users choose whether they want to continue. Chat opens only when both people say yes.",
  },
  {
    q: "What happens if my profile is hidden?",
    a: "When your profile is hidden, other users cannot book you and your availability is no longer visible. You can turn your profile back on from your dashboard whenever your account is eligible to go live.",
  },
  {
    q: "Can I hide or delete my account?",
    a: "Yes. You can hide your profile at any time, and you can also submit an account deletion request from your account settings.",
  },
  {
    q: "Why might a booking fail even if I have credits?",
    a: [
      "Your subscription may be inactive.",
      "The other user may have bookings turned off or no available slots.",
      "Your profile may be hidden or not yet eligible to go live.",
      "The selected slot may no longer be available.",
    ],
  },
  {
    q: "How do I contact MatchIndeed support?",
    a: "Use the support form on the Contact Us page or email support@matchindeed.com for account, booking, payment, or technical help.",
  },
] satisfies FaqItem[];

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function Home() {
  const router = useRouter();
  const signupFormId = "signup-start-form";

  // Search form state
  const [seeking, setSeeking] = useState<string>("");
  const [ageMin, setAgeMin] = useState<number | null>(35);
  const [ageMax, setAgeMax] = useState<number | null>(45);
  const [city, setCity] = useState<string>(
    process.env.NEXT_PUBLIC_DEFAULT_CITY ?? "London, United Kingdom"
  );
  const [cityPickedFromGoogle, setCityPickedFromGoogle] = useState<boolean>(
    isLikelyGoogleSuggestedLocation(
      process.env.NEXT_PUBLIC_DEFAULT_CITY ?? "London, United Kingdom"
    )
  );
  const [errors, setErrors] = useState<{
    seeking?: string;
    age?: string;
    city?: string;
  }>({});

  // UI state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<{ id: string; email: string | null } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const authMenuRef = useRef<HTMLDivElement | null>(null);

  // Pricing state — fetched from API, currency from IP (user can override via dropdown)
  const [pricing, setPricing] = useState<{
    basic: { ngn: number; usd: number; gbp: number };
    standard: { ngn: number; usd: number; gbp: number };
    premium: { ngn: number; usd: number; gbp: number };
    vip: { ngn: number; usd: number; gbp: number };
  } | null>(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [geoLoaded, setGeoLoaded] = useState(false);
  const [currency, setCurrency] = useState<"ngn" | "usd" | "gbp">("usd");
  const [currencySelectorOpen, setCurrencySelectorOpen] = useState(false);

  // Defensive: when Supabase's password-recovery email redirects users to the
  // site root instead of /reset-password (e.g. because the redirect URL is
  // missing from the auth allowlist), forward them to the reset page along
  // with the original auth params. The /reset-password page reads both the
  // implicit-hash and PKCE-code flows.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const queryParams = new URLSearchParams(search);

    const type = hashParams.get("type") || queryParams.get("type");
    const hasRecoveryToken =
      hashParams.has("access_token") || queryParams.has("code");

    if (type === "recovery" && hasRecoveryToken) {
      // Preserve both hash (implicit flow tokens) and search (PKCE code) on
      // redirect so the reset page can establish the session correctly.
      const target = `/reset-password${search}${hash}`;
      router.replace(target);
    }
  }, [router]);

  const scrollToSignupForm = useCallback(() => {
    const formRoot = document.getElementById(signupFormId);
    if (!formRoot) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    formRoot.scrollIntoView({ behavior: "smooth", block: "center" });

    const firstField = formRoot.querySelector("select, input, button") as
      | HTMLElement
      | null;
    window.setTimeout(() => {
      firstField?.focus();
    }, 350);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("focusSignup") !== "1") return;

    window.setTimeout(() => {
      scrollToSignupForm();
    }, 120);

    url.searchParams.delete("focusSignup");
    const cleanedSearch = url.searchParams.toString();
    const cleanedUrl = `${url.pathname}${cleanedSearch ? `?${cleanedSearch}` : ""}${url.hash}`;
    window.history.replaceState({}, "", cleanedUrl);
  }, [scrollToSignupForm]);

  useEffect(() => {
    let isMounted = true;

    const loadAuthState = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isMounted) return;
      setAuthUser(user ? { id: user.id, email: user.email || null } : null);
      setAuthLoading(false);
    };

    void loadAuthState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(
        session?.user
          ? { id: session.user.id, email: session.user.email || null }
          : null
      );
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authMenuOpen) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!authMenuRef.current) return;
      if (!authMenuRef.current.contains(event.target as Node)) {
        setAuthMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
    };
  }, [authMenuOpen]);

  const handleSignOut = useCallback(async () => {
    setAuthMenuOpen(false);
    setMobileMenuOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign out error:", error);
      return;
    }
    router.push("/");
  }, [router]);

  // Fetch pricing and detect currency from IP (client spec: Nigeria→NGN, UK→GBP, else USD)
  useEffect(() => {
    if (!SHOW_HOME_PRICING_SECTION) {
      return;
    }

    const deriveCurrency = (cc: string): "ngn" | "usd" | "gbp" => {
      const upper = (cc || "").toUpperCase();
      if (upper === "NG") return "ngn";
      if (upper === "GB" || upper === "UK") return "gbp";
      return "usd";
    };

    const load = async () => {
      try {
        const [pricingRes, geoRes] = await Promise.all([
          fetch("/api/subscription-pricing"),
          fetch("/api/geo"),
        ]);
        const pricingData = await pricingRes.json();
        const geoData = await geoRes.json();
        let c = (geoData.currency || "usd").toLowerCase();

        // If server returned USD with no country (e.g. Tailscale doesn't pass client IP), try client-side fallback
        if (c === "usd" && !geoData.country_code) {
          try {
            const fallback = await fetch("https://reallyfreegeoip.org/json/");
            if (fallback.ok) {
              const data = await fallback.json();
              const cc = data.country_code || data.countryCode;
              if (cc) c = deriveCurrency(cc);
            }
          } catch {
            // Ignore; keep USD
          }
        }

        setCurrency(c === "ngn" || c === "gbp" ? c : "usd");
        setGeoLoaded(true);
        if (pricingData.tiers) {
          const map: Record<string, { ngn: number; usd: number; gbp: number }> = {};
          for (const t of pricingData.tiers) {
            map[t.id] = t.pricing;
          }
          setPricing(map as { basic: { ngn: number; usd: number; gbp: number }; standard: { ngn: number; usd: number; gbp: number }; premium: { ngn: number; usd: number; gbp: number }; vip: { ngn: number; usd: number; gbp: number } });
        }
      } catch {
        // Fallback to client-spec defaults; keep USD if geo fails
        setGeoLoaded(true);
        setPricing({
          basic: { ngn: 7500, usd: 9.99, gbp: 7.99 },
          standard: { ngn: 15000, usd: 19.99, gbp: 16.99 },
          premium: { ngn: 27000, usd: 34.99, gbp: 29.99 },
          vip: { ngn: 1500000, usd: 1000, gbp: 800 },
        });
      } finally {
        setPricingLoading(false);
      }
    };
    load();
  }, []);

  /** Currency options for the selector dropdown */
  const currencyOptions = [
    { value: "ngn" as const, label: "₦ NGN", full: "Nigerian Naira" },
    { value: "usd" as const, label: "$ USD", full: "US Dollars" },
    { value: "gbp" as const, label: "£ GBP", full: "British Pounds" },
  ];

  /** Handle search form submission */
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    const newErrors: { seeking?: string; age?: string; city?: string } = {};
    if (!seeking) newErrors.seeking = "Please select who you're interested in";
    if (!ageMin || !ageMax) {
      newErrors.age = "Please select both minimum and maximum age";
    } else if (ageMin > ageMax) {
      newErrors.age = "Minimum age cannot be greater than maximum age";
    }
    const normalizedCity = normalizeLocation(city);
    if (!normalizedCity) {
      newErrors.city = "Please enter a location";
    } else if (
      !cityPickedFromGoogle ||
      !isLikelyGoogleSuggestedLocation(normalizedCity)
    ) {
      newErrors.city = "Please select a city or region from the suggestions";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    sessionStorage.setItem(
      "searchPreferences",
      JSON.stringify({ seeking, ageMin, ageMax, city: normalizedCity })
    );
    sessionStorage.setItem("signupStartedFromLanding", String(Date.now()));
    router.push("/register");
  };

  // ---------------------------------------------------------------
  // Nav items
  // ---------------------------------------------------------------
  const navItems = [
    { label: "Home", href: "#" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Features", href: "#features" },
    { label: "FAQ", href: "#faq" },
    { label: "About Us", href: "/about-us" },
  ];

  return (
    <div className="min-h-screen w-full bg-white">
      {/* ========================================================= */}
      {/* HEADER                                                     */}
      {/* ========================================================= */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-gradient-to-r from-[#1e2a78] to-[#2a44a3] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/matchindeed-logo-white.png"
              alt="MatchIndeed"
              width={112}
              height={28}
              priority
              style={{ width: "auto", height: "auto" }}
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-6 text-sm text-white/80 md:flex">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="transition-colors hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Auth */}
          <div className="flex items-center gap-2">
            {authLoading ? (
              <div className="h-9 w-9 rounded-full border border-white/20 bg-white/10" />
            ) : authUser ? (
              <div ref={authMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAuthMenuOpen((prev) => !prev)}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-white/30 px-3 text-sm text-white/90 transition-colors hover:bg-white/10"
                  aria-label="Open account menu"
                >
                  <UserCircle2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Account</span>
                </button>

                {authMenuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5">
                    <Link
                      href="/dashboard"
                      onClick={() => setAuthMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <UserCircle2 className="h-4 w-4" />
                      View account
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-white/30 px-3 text-sm text-white/90 transition-colors hover:bg-white/10"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Login</span>
              </Link>
            )}
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="ml-2 rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 md:hidden"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? "Close" : "Menu"}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="border-t border-white/10 px-6 py-4 md:hidden">
            <nav className="flex flex-col items-center gap-3 text-center text-sm text-white/80">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1 transition-colors hover:text-white"
                >
                  {item.label}
                </a>
              ))}
              {authLoading ? (
                <span className="mt-2 py-1 text-white/70">Loading...</span>
              ) : authUser ? (
                <>
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="mt-2 py-1 transition-colors hover:text-white"
                  >
                    View account
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-2 py-1 text-white/80 transition-colors hover:text-white"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="mt-2 py-1 transition-colors hover:text-white"
                >
                  Login
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* ========================================================= */}
      {/* HERO SECTION                                               */}
      {/* ========================================================= */}
      <section className="relative z-10 overflow-x-hidden overflow-y-visible bg-gradient-to-br from-[#1e2a78] via-[#2a44a3] to-[#4463cf] py-12 sm:py-16 md:py-24">
        {/* Decorative elements */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:gap-12 sm:px-6 md:grid-cols-2 md:items-center">
          {/* Hero Copy */}
          <div className="min-w-0 text-center md:text-left">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs text-white/90 sm:text-sm">
              <Sparkles className="h-4 w-4" />
              Meet real people face-to-face
            </div>
            <h1 className="mx-auto max-w-[20rem] text-3xl font-extrabold leading-[1.1] tracking-tight text-white sm:max-w-none sm:text-5xl lg:text-6xl md:mx-0">
              Meet Real People.
              <span className="block bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
                Face-to-Face.
              </span>
              <span className="block">Before You Match.</span>
            </h1>
            <p className="mx-auto mt-4 hidden max-w-md text-base text-white/75 sm:mt-5 sm:max-w-lg sm:text-lg md:mx-0 md:block md:text-xl">
              Skip the swiping, small talk, and disappointment. Meet on a short
              video date first, then decide if you want to keep talking.
            </p>

            {/* Trust badges */}
            <div className="mx-auto mt-6 hidden max-w-sm flex-wrap items-center justify-center gap-x-4 gap-y-3 text-sm text-white/60 sm:mt-8 md:mx-0 md:flex md:max-w-none md:justify-start md:gap-6">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4" />
                Verified Profiles
              </div>
              <div className="flex items-center gap-1.5">
                <Video className="h-4 w-4" />
                Secure Video Calls
              </div>
              <div className="flex items-center gap-1.5">
                <Heart className="h-4 w-4" />
                Real Connections
              </div>
            </div>
          </div>

          {/* Search Form Card */}
          <div id={signupFormId} className="relative z-30 mx-auto min-w-0 w-full max-w-sm px-1 sm:px-0">
            <div className="relative rounded-3xl bg-white/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm">
              <div className="flex items-center justify-center px-6 pt-7 sm:px-8 sm:pt-8">
                <Image
                  src="/matchindeed-logo-black-font.png"
                  alt="MatchIndeed"
                  width={118}
                  height={30}
                  priority
                  style={{ width: "auto", height: "auto" }}
                />
              </div>
              <h2 className="mt-4 text-center text-xl font-bold tracking-tight bg-gradient-to-r from-[#1f419a] to-[#2a44a3] bg-clip-text text-transparent sm:text-2xl">
                Get Started - It&apos;s Free
              </h2>

              <form onSubmit={handleSubmit} className="px-4 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-5">
                {/* Seeking */}
                <div className="mb-5">
                  <div className="relative">
                    <select
                      id="seeking"
                      value={seeking}
                      onChange={(e) => setSeeking(e.target.value)}
                      className={`w-full appearance-none border-b bg-transparent py-3 pr-8 text-gray-700 placeholder-gray-400 focus:outline-none ${
                        errors.seeking
                          ? "border-red-400 focus:border-red-500"
                          : "border-gray-300 focus:border-[#1f419a]"
                      }`}
                      required
                    >
                      <option value="" disabled>
                        Who are you interested in?
                      </option>
                      <option value="man-woman">
                        I&apos;m a man seeking a woman
                      </option>
                      <option value="woman-man">
                        I&apos;m a woman seeking a man
                      </option>
                      <option value="man-man">
                        I&apos;m a man seeking a man
                      </option>
                      <option value="woman-woman">
                        I&apos;m a woman seeking a woman
                      </option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  </div>
                  {errors.seeking && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.seeking}
                    </p>
                  )}
                </div>

                {/* Age Range */}
                <div className="mb-5">
                  <div className="mb-2 text-sm text-gray-700">
                    Between Ages:
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                    <AgeSelect
                      value={ageMin}
                      onChange={setAgeMin}
                      min={18}
                      max={100}
                      placeholder="Min"
                    />
                    <span className="w-full text-center text-sm text-gray-500 sm:w-auto sm:text-left">
                      and
                    </span>
                    <AgeSelect
                      value={ageMax}
                      onChange={setAgeMax}
                      min={18}
                      max={100}
                      placeholder="Max"
                    />
                  </div>
                  {errors.age && (
                    <p className="mt-1 text-xs text-red-500">{errors.age}</p>
                  )}
                </div>

                {/* City */}
                <div className="mb-6">
                  <GooglePlacesAutocomplete
                    value={city}
                    onChange={(v, prediction) => {
                      setCity(normalizeLocation(v));
                      setCityPickedFromGoogle(Boolean(prediction));
                    }}
                    requireSuggestion
                    placeholder="Search city or region"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Search by city or region, for example Sydney, Australia or Lagos, Nigeria.
                  </p>
                  {errors.city && (
                    <p className="mt-1 text-xs text-red-500">{errors.city}</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
                >
                  View Singles
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>

          <p className="mx-auto -mt-3 max-w-md px-4 text-center text-base text-white/75 md:hidden">
            Skip the swiping, small talk, and disappointment. Meet on a short
            video date first, then decide if you want to keep talking.
          </p>

          <div className="mx-auto -mt-3 flex max-w-sm flex-wrap items-center justify-center gap-x-4 gap-y-3 px-4 text-sm text-white/60 md:hidden">
            <div className="flex items-center gap-1.5">
              <Shield className="h-4 w-4" />
              Verified Profiles
            </div>
            <div className="flex items-center gap-1.5">
              <Video className="h-4 w-4" />
              Secure Video Calls
            </div>
            <div className="flex items-center gap-1.5">
              <Heart className="h-4 w-4" />
              Real Connections
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* STATS BAR                                                  */}
      {/* ========================================================= */}
      <section className="relative z-0 border-b border-gray-100 bg-gray-50 py-8">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 px-4 text-center sm:flex sm:flex-nowrap sm:items-center sm:justify-center sm:gap-8 sm:px-6 md:gap-16">
          {[
            { value: "50K+", label: "Active Members" },
            { value: "12K+", label: "Matches Made" },
            { value: "8K+", label: "Video Dates" },
            { value: "4.8/5", label: "User Rating" },
          ].map((stat) => (
            <div key={stat.label} className="min-w-0 sm:shrink-0">
              <div className="text-lg font-bold text-[#1f419a] sm:text-2xl md:text-3xl">
                {stat.value}
              </div>
              <div className="mt-0.5 text-xs text-gray-500 sm:mt-1 sm:text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================= */}
      {/* HOW IT WORKS                                               */}
      {/* ========================================================= */}
      <section id="how-it-works" className="relative overflow-hidden py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-[#1f419a]/10 blur-3xl" />
          <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-sky-200/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f419a]/70">
              The MatchIndeed Journey
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              How It Works
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">
              From sign-up to video date and mutual chat unlock, everything is
              designed for meaningful connections.
            </p>
          </div>

          <div className="relative mt-14">
            <div className="absolute left-1/2 top-5 hidden h-[calc(100%-2.5rem)] w-px -translate-x-1/2 bg-gradient-to-b from-[#1f419a]/10 via-[#1f419a]/40 to-[#1f419a]/10 lg:block" />
            <div className="space-y-6">
              {[
                {
                  step: "01",
                  icon: Users,
                  title: "Sign Up",
                  desc: "Create your profile in minutes with photos, a short bio, and your video-date availability.",
                  color: "from-blue-500 to-indigo-600",
                },
                {
                  step: "02",
                  icon: Calendar,
                  title: "Book a Video Date",
                  desc: "Browse members and request a video meeting using the integrated calendar.",
                  color: "from-pink-500 to-rose-600",
                },
                {
                  step: "03",
                  icon: CheckCircle,
                  title: "Invitation Accepted",
                  desc: "Once accepted, your video date is automatically confirmed inside the platform.",
                  color: "from-emerald-500 to-green-600",
                },
                {
                  step: "04",
                  icon: Video,
                  title: "Meet Face-to-Face",
                  desc: "Join directly from your dashboard. No downloads and no extra apps required.",
                  color: "from-purple-500 to-violet-600",
                },
                {
                  step: "05",
                  icon: MessageCircle,
                  title: "Chat Unlocks If It Clicks",
                  desc: "Private chat opens only when both members say yes after the video date.",
                  color: "from-amber-500 to-orange-600",
                },
              ].map((item, index) => (
                <article
                  key={item.step}
                  className={`relative rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_14px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_48px_rgba(31,65,154,0.16)] lg:w-[calc(50%-1.5rem)] ${index % 2 === 0 ? "lg:mr-auto" : "lg:ml-auto"}`}
                >
                  <div
                    className={`absolute top-10 hidden h-3 w-3 rounded-full border-4 border-white bg-[#1f419a] shadow lg:block ${index % 2 === 0 ? "right-[-1.85rem]" : "left-[-1.85rem]"}`}
                  />
                  <div className="flex items-start gap-4">
                    <div
                      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} text-white shadow-md ring-4 ring-white`}
                    >
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="mb-2 inline-flex items-center rounded-full border border-[#1f419a]/15 bg-[#1f419a]/5 px-3 py-1 text-xs font-semibold text-[#1f419a]">
                        Step {item.step}
                      </div>
                      <h3 className="text-2xl font-semibold leading-tight text-slate-900">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-base leading-7 text-slate-600">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* FEATURES                                                   */}
      {/* ========================================================= */}
      <section id="features" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Why Singles and Serious Daters Love It
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">
              Real conversations. Real chemistry. Real people.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Video,
                title: "Authentic Connections",
                desc: "No filters, no surprises. Video-first dating helps reduce catfishing and misrepresentation.",
              },
              {
                icon: MessageCircle,
                title: "Zero Endless Texting",
                desc: "Skip long chat threads and quickly see if you actually vibe in real conversation.",
              },
              {
                icon: Star,
                title: "Instant Chemistry Check",
                desc: "Know in minutes whether the connection is worth pursuing.",
              },
              {
                icon: Shield,
                title: "Serious Daters Only",
                desc: "Built for members who value intentional, respectful interaction.",
              },
              {
                icon: Calendar,
                title: "Built-in Scheduling",
                desc: "No scheduling headaches. Set availability and book dates inside the platform.",
              },
              {
                icon: CheckCircle,
                title: "Time-Saving Flow",
                desc: "Avoid dead-end chats and focus only on promising connections.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 transition-all hover:shadow-md"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#1f419a]/10 text-[#1f419a]">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-gray-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* TESTIMONIALS                                               */}
      {/* ========================================================= */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Real Connections, Real Stories
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">
              What early members are saying.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {[
              {
                name: "A Satisfied Member",
                location: "Early Member",
                quote:
                  "Finally, a dating platform that actually leads to real dates. The video date format is a game changer.",
                stars: 5,
              },
              {
                name: "Early Member",
                location: "Verified User",
                quote:
                  "I met someone who actually wanted to talk, not just text. The video date made all the difference.",
                stars: 5,
              },
              {
                name: "Founding User",
                location: "MatchIndeed Community",
                quote:
                  "I met someone amazing within my first week. It feels human again compared to swipe-only apps.",
                stars: 5,
              },
            ].map((testimonial) => (
              <div
                key={testimonial.name}
                className="rounded-2xl bg-gradient-to-br from-[#1f419a]/5 to-purple-50 p-6 ring-1 ring-[#1f419a]/10"
              >
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: testimonial.stars }).map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-amber-400 text-amber-400"
                    />
                  ))}
                </div>
                <p className="text-sm leading-relaxed text-gray-700 italic">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#1f419a] to-[#2a44a3] text-sm font-bold text-white">
                    {testimonial.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {testimonial.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {testimonial.location}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* PRICING — Client spec: credits, calendar slots, IP-based currency */}
      {/* ========================================================= */}
      {SHOW_HOME_PRICING_SECTION && (
      <section id="pricing" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Simple, Transparent Pricing
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">
              Start with Basic and upgrade when you&apos;re ready for more.
            </p>
            <p className="mx-auto mt-2 max-w-3xl text-sm text-gray-500">
              No paid plan is auto-activated at signup. New signups get one host-only starter slot to test the platform, and wallet access unlocks after the first successful subscription payment.
            </p>
            {/* Currency selector — user can override IP-detected currency */}
            <div className="relative mt-4 inline-block">
              <button
                type="button"
                onClick={() => geoLoaded && setCurrencySelectorOpen((o) => !o)}
                onBlur={() => setTimeout(() => setCurrencySelectorOpen(false), 150)}
                disabled={!geoLoaded}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-80"
                aria-expanded={currencySelectorOpen}
                aria-haspopup="listbox"
                aria-label="Select currency"
              >
                {geoLoaded ? (
                  <>
                    <span>Prices in</span>
                    <span className="font-medium text-gray-900">
                      {currencyOptions.find((o) => o.value === currency)?.label ?? "USD"}
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${currencySelectorOpen ? "rotate-180" : ""}`} />
                  </>
                ) : (
                  <>
                    <span className="animate-pulse">Detecting currency…</span>
                  </>
                )}
              </button>
              {currencySelectorOpen && (
                <ul
                  role="listbox"
                  className="absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                >
                  {currencyOptions.map((opt) => (
                    <li
                      key={opt.value}
                      role="option"
                      aria-selected={currency === opt.value}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setCurrency(opt.value);
                          setCurrencySelectorOpen(false);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                          currency === opt.value ? "bg-[#1f419a]/10 font-medium text-[#1f419a]" : "text-gray-700"
                        }`}
                      >
                        {opt.label} — {opt.full}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {pricingLoading ? (
            <div className="mt-14 grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100"
                >
                  <div className="h-4 w-16 rounded bg-gray-200" />
                  <div className="mt-4 h-8 w-24 rounded bg-gray-200" />
                  <div className="mt-5 space-y-2.5">
                    {[1, 2, 3, 4].map((j) => (
                      <div key={j} className="h-4 rounded bg-gray-100" />
                    ))}
                  </div>
                  <div className="mt-6 h-10 rounded-full bg-gray-200" />
                </div>
              ))}
            </div>
          ) : (
          <div className="mt-14 grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                {
                  id: "basic",
                  name: "Basic",
                  features: [
                    "5 credits per month (Group only)",
                    "Send requests to Basic users only",
                    "Receive requests from all tiers",
                    "One-on-one meetings not included",
                    "Extra group meetings via paid add-on",
                  ],
                  cta: "Get Started",
                  popular: false,
                },
                {
                  id: "standard",
                  name: "Standard",
                  features: [
                    "10 credits per month",
                    "Send requests to Basic & Standard",
                    "Receive requests from all tiers",
                    "One-on-one meetings via paid add-on",
                    "3 group credits included monthly",
                    "Extra group meetings via paid add-on",
                  ],
                  cta: "Choose Standard",
                  popular: false,
                },
                {
                  id: "premium",
                  name: "Premium",
                  features: [
                    "30 credits per month",
                    "Send requests to Basic, Standard & Premium",
                    "Receive requests from all tiers",
                    "One-on-one meetings via paid add-on",
                    "Multi-booking: 3x/month (free)",
                    "Anonymous mode + Hide location",
                  ],
                  cta: "Choose Premium",
                  popular: true,
                },
                {
                  id: "vip",
                  name: "VIP",
                  features: [
                    "Unlimited credits",
                    "Send requests to all tiers (including VIP)",
                    "Receive requests from all tiers",
                    "Top match queue + Visibility boost (free)",
                    "Faster scheduling (free)",
                    "Match retry: 3x/month (free)",
                    "Priority support",
                  ],
                  cta: "Go VIP",
                  popular: false,
                },
              ] as const
            ).map((plan) => {
              const p =
                pricing?.[plan.id] ??
                {
                  basic: { ngn: 7500, usd: 9.99, gbp: 7.99 },
                  standard: { ngn: 15000, usd: 19.99, gbp: 16.99 },
                  premium: { ngn: 27000, usd: 34.99, gbp: 29.99 },
                  vip: { ngn: 1500000, usd: 1000, gbp: 800 },
                }[plan.id];
              const fmt =
                currency === "ngn"
                  ? (n: number) => `₦${n.toLocaleString()}`
                  : currency === "gbp"
                    ? (n: number) => `£${n.toLocaleString()}`
                    : (n: number) => `$${n.toLocaleString()}`;
              const priceStr = fmt(p[currency]);
              const period = "/month";
              return (
              <div
                key={plan.name}
                className={`relative min-w-0 rounded-2xl p-6 transition-all hover:shadow-lg ${
                  plan.popular
                    ? "bg-gradient-to-br from-[#1f419a] to-[#2a44a3] text-white shadow-xl ring-2 ring-[#1f419a] sm:scale-[1.03]"
                    : "bg-white shadow-sm ring-1 ring-gray-100"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-0.5 text-xs font-bold text-gray-900">
                    Most Popular
                  </div>
                )}
                <div
                  className={`text-sm font-medium ${plan.popular ? "text-white/70" : "text-gray-500"}`}
                >
                  {plan.name}
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-1">
                  <span className="break-words text-2xl font-bold sm:text-3xl">{priceStr}</span>
                  {period && (
                    <span
                      className={`shrink-0 text-sm ${plan.popular ? "text-white/60" : "text-gray-400"}`}
                    >
                      {period}
                    </span>
                  )}
                </div>
                <ul className="mt-5 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex min-w-0 items-start gap-2 text-sm">
                      <CheckCircle
                        className={`mt-0.5 h-4 w-4 flex-shrink-0 ${plan.popular ? "text-amber-300" : "text-green-500"}`}
                      />
                      <span
                        className={`min-w-0 break-words ${plan.popular ? "text-white/90" : "text-gray-600"}`}
                      >
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={scrollToSignupForm}
                  className={`mt-6 flex w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] ${
                    plan.popular
                      ? "bg-white text-[#1f419a] shadow-md"
                      : "bg-[#1f419a] text-white shadow-sm"
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            );
            })}
          </div>
          )}
        </div>
      </section>
      )}

      {/* ========================================================= */}
      {/* FAQ                                                        */}
      {/* ========================================================= */}
      <section id="faq" className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-gray-500">
              Got questions? We&apos;ve got answers.
            </p>
          </div>

          <div className="mt-12 space-y-3">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="rounded-xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenFaq(openFaq === index ? null : index)
                  }
                  className="flex w-full items-center justify-between px-6 py-4 text-left"
                >
                  <span className="font-medium text-gray-900">{faq.q}</span>
                  {openFaq === index ? (
                    <ChevronUp className="h-5 w-5 flex-shrink-0 text-[#1f419a]" />
                  ) : (
                    <ChevronDown className="h-5 w-5 flex-shrink-0 text-gray-400" />
                  )}
                </button>
                {openFaq === index && (
                  <div className="border-t border-gray-100 px-6 py-4 text-sm leading-relaxed text-gray-600">
                    {Array.isArray(faq.a) ? (
                      <ul className="space-y-2">
                        {faq.a.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#1f419a]" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>{faq.a}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* CTA BANNER                                                 */}
      {/* ========================================================= */}
      <section className="bg-gradient-to-r from-[#1e2a78] to-[#4463cf] py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Join Free and Start Meeting Face-to-Face
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-white/70">
            Founding members get early access benefits while spots remain.
            Create your account and start real conversations today.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              type="button"
              onClick={scrollToSignupForm}
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3 text-sm font-semibold text-[#1f419a] shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
            >
              Join Free Now
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              I Already Have an Account
            </Link>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* FOOTER                                                     */}
      {/* ========================================================= */}
      <footer className="border-t border-gray-100 bg-white py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand */}
            <div>
              <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={132} height={34} style={{ width: "auto", height: "auto" }} />
              <p className="mt-3 text-sm text-gray-500">
                Connecting hearts through meaningful video dates. Find genuine
                connections, not just swipes.
              </p>
              <div className="mt-5 flex items-center gap-3">
                {socialLinks.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Visit MatchIndeed on ${label}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-[#1f419a] hover:bg-[#1f419a] hover:text-white"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold text-gray-900">Quick Links</h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-500">
                <li>
                  <a href="#how-it-works" className="hover:text-[#1f419a]">
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-[#1f419a]">
                    Features
                  </a>
                </li>
                {SHOW_HOME_PRICING_SECTION && (
                  <li>
                    <a href="#pricing" className="hover:text-[#1f419a]">
                      Pricing
                    </a>
                  </li>
                )}
                <li>
                  <a href="#faq" className="hover:text-[#1f419a]">
                    FAQ
                  </a>
                </li>
                <li>
                  <Link href="/about-us" className="hover:text-[#1f419a]">
                    About Us
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold text-gray-900">Legal</h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-500">
                <li>
                  <Link href="/privacy-policy" className="hover:text-[#1f419a]">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms-of-service" className="hover:text-[#1f419a]">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/cookie-policy" className="hover:text-[#1f419a]">
                    Cookie Policy
                  </Link>
                </li>
                <li>
                  <Link href="/refund-policy" className="hover:text-[#1f419a]">
                    Refund Policy
                  </Link>
                </li>
                <li>
                  <Link href="/community-safety" className="hover:text-[#1f419a]">
                    Community Safety
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold text-gray-900">Contact</h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-500">
                <li>
                  <Link href="/contact-us" className="font-medium text-[#1f419a] hover:underline">
                    Contact MatchIndeed Support
                  </Link>
                </li>
                <li>
                  <a href="mailto:support@matchindeed.com" className="hover:text-[#1f419a] hover:underline">
                    support@matchindeed.com
                  </a>
                </li>
                <li>London, United Kingdom</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-gray-100 pt-6 text-center text-xs text-gray-400">
            <p>&copy; 2026 MatchIndeed. Operated by Firstoutlook Ltd (UK).</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
