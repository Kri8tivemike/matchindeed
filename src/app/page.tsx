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
import Link from "next/link";
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
  Menu,
  X,
  ChevronUp,
} from "lucide-react";
import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import AgeSelect from "@/components/AgeSelect";
import GooglePlacesAutocomplete from "@/components/GooglePlacesAutocomplete";

// ---------------------------------------------------------------
// FAQ data
// ---------------------------------------------------------------
const faqs = [
  {
    q: "How does MatchIndeed work?",
    a: "Create your profile, set your preferences, and browse compatible matches. When you find someone interesting, send a wink or express interest. If it's mutual, you can message each other and schedule a video date — all within the platform.",
  },
  {
    q: "Is MatchIndeed free to use?",
    a: null, // Rendered dynamically based on selected currency
  },
  {
    q: "How are video dates conducted?",
    a: "Video dates happen through secure, integrated video calls right inside MatchIndeed. Once both parties agree, a meeting link is generated automatically. No need for external apps or sharing personal contact information.",
  },
  {
    q: "Is my information safe?",
    a: "Absolutely. We use bank-level encryption, verified profiles, and strict moderation. Your personal data is never shared with other users or third parties. You can also block and report any user at any time.",
  },
  {
    q: "Can I block or report someone?",
    a: "Yes. You can block any user from their profile — they won't be able to see you or contact you. You can also report inappropriate behavior, which our moderation team reviews promptly.",
  },
  {
    q: "What makes MatchIndeed different from other dating apps?",
    a: "We focus on meaningful connections through video dating rather than endless swiping. Our compatibility algorithm, verified profiles, and structured meeting system help you find genuine matches faster.",
  },
];

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function Home() {
  const router = useRouter();

  // Search form state
  const [seeking, setSeeking] = useState<string>("");
  const [ageMin, setAgeMin] = useState<number | null>(35);
  const [ageMax, setAgeMax] = useState<number | null>(45);
  const [city, setCity] = useState<string>(
    process.env.NEXT_PUBLIC_DEFAULT_CITY ?? "London, United Kingdom"
  );
  const [errors, setErrors] = useState<{
    seeking?: string;
    age?: string;
    city?: string;
  }>({});

  // UI state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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

  // Fetch pricing and detect currency from IP (client spec: Nigeria→NGN, UK→GBP, else USD)
  useEffect(() => {
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
          basic: { ngn: 10000, usd: 7, gbp: 5.5 },
          standard: { ngn: 31500, usd: 20, gbp: 16 },
          premium: { ngn: 63000, usd: 43, gbp: 34 },
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
    if (!city || city.trim() === "") newErrors.city = "Please enter a location";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    sessionStorage.setItem(
      "searchPreferences",
      JSON.stringify({ seeking, ageMin, ageMax, city })
    );
    router.push("/register");
  };

  // ---------------------------------------------------------------
  // Nav items
  // ---------------------------------------------------------------
  const navItems = [
    { label: "Home", href: "#" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <div className="min-h-screen w-full bg-white">
      {/* ========================================================= */}
      {/* HEADER                                                     */}
      {/* ========================================================= */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-gradient-to-r from-[#1e2a78] to-[#2a44a3] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/matchindeed.svg"
              alt="MatchIndeed"
              width={140}
              height={36}
              priority
              className="brightness-0 invert"
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

          {/* Auth Buttons */}
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-full border border-white/30 px-4 py-1.5 text-sm text-white/90 transition-colors hover:bg-white/10 sm:inline-flex"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-[#1f419a] shadow-sm transition-colors hover:bg-white/90"
            >
              Sign Up Free
            </Link>
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="ml-2 rounded-lg p-1.5 text-white/80 hover:bg-white/10 md:hidden"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="border-t border-white/10 px-6 py-4 md:hidden">
            <nav className="flex flex-col gap-3 text-sm text-white/80">
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
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 py-1 transition-colors hover:text-white"
              >
                Login
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* ========================================================= */}
      {/* HERO SECTION                                               */}
      {/* ========================================================= */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1e2a78] via-[#2a44a3] to-[#4463cf] py-16 md:py-24">
        {/* Decorative elements */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 md:grid-cols-2 md:items-center">
          {/* Hero Copy */}
          <div className="text-center md:text-left">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-white/90">
              <Sparkles className="h-4 w-4" />
              Video dating reimagined
            </div>
            <h1 className="text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
              Find Your{" "}
              <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
                Perfect Match
              </span>
              <br />
              Face to Face
            </h1>
            <p className="mt-5 max-w-lg text-lg text-white/70 md:text-xl">
              Skip the endless texting. MatchIndeed connects you through real
              video dates with compatible singles — so you can feel the chemistry
              before you meet.
            </p>

            {/* Trust badges */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-white/60 md:justify-start">
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
          <div className="mx-auto w-full max-w-sm">
            <div className="rounded-3xl bg-white/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm">
              <div className="flex items-center justify-center px-8 pt-8">
                <Image
                  src="/matchindeed.svg"
                  alt="MatchIndeed"
                  width={140}
                  height={36}
                  priority
                  style={{ width: "auto", height: "auto" }}
                />
              </div>
              <p className="mt-2 text-center text-sm text-gray-500">
                Start your journey today
              </p>

              <form onSubmit={handleSubmit} className="px-8 pb-8 pt-5">
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
                  <div className="flex items-center gap-3">
                    <AgeSelect
                      value={ageMin}
                      onChange={setAgeMin}
                      min={18}
                      max={100}
                      placeholder="Min"
                    />
                    <span className="text-gray-500">and</span>
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
                    onChange={(v) => setCity(v)}
                    placeholder="Enter your city"
                  />
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
        </div>
      </section>

      {/* ========================================================= */}
      {/* STATS BAR                                                  */}
      {/* ========================================================= */}
      <section className="border-b border-gray-100 bg-gray-50 py-8">
        <div className="mx-auto flex max-w-5xl flex-nowrap items-center justify-center gap-4 px-4 text-center sm:gap-8 sm:px-6 md:gap-16">
          {[
            { value: "50K+", label: "Active Members" },
            { value: "12K+", label: "Matches Made" },
            { value: "8K+", label: "Video Dates" },
            { value: "4.8/5", label: "User Rating" },
          ].map((stat) => (
            <div key={stat.label} className="shrink-0">
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
      <section id="how-it-works" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              How It Works
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">
              Finding meaningful connections has never been easier. Three simple
              steps to meet your perfect match.
            </p>
          </div>

          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "01",
                icon: Users,
                title: "Create Your Profile",
                desc: "Sign up in minutes. Add photos, tell your story, and set your preferences to find compatible matches.",
                color: "from-blue-500 to-indigo-600",
              },
              {
                step: "02",
                icon: Heart,
                title: "Discover & Connect",
                desc: "Browse profiles matched to your preferences. Send winks, express interest, and start conversations with people you like.",
                color: "from-pink-500 to-rose-600",
              },
              {
                step: "03",
                icon: Video,
                title: "Video Date",
                desc: "Schedule a secure video date right within the app. See real chemistry before meeting in person — no external apps needed.",
                color: "from-purple-500 to-violet-600",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group relative rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100 transition-all hover:shadow-lg hover:-translate-y-1"
              >
                <div className="absolute -top-4 left-6 text-5xl font-black text-gray-100 group-hover:text-[#1f419a]/10 transition-colors">
                  {item.step}
                </div>
                <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} text-white shadow-md`}
                >
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  {item.desc}
                </p>
              </div>
            ))}
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
              Why Choose MatchIndeed
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">
              We&apos;re not just another dating app. We&apos;re built for real
              connections.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Video,
                title: "Integrated Video Dates",
                desc: "No need for Zoom links or phone numbers. Our built-in video calling lets you date face-to-face safely.",
              },
              {
                icon: Shield,
                title: "Verified & Safe",
                desc: "Email verification, profile moderation, and user reporting keep our community safe and genuine.",
              },
              {
                icon: Star,
                title: "Smart Matching",
                desc: "Our algorithm considers your preferences, personality, and compatibility to suggest your best matches.",
              },
              {
                icon: Calendar,
                title: "Easy Scheduling",
                desc: "Set your availability, accept meeting requests, and let our calendar system handle the rest.",
              },
              {
                icon: MessageCircle,
                title: "Real-Time Chat",
                desc: "Message your matches with typing indicators, read receipts, and real-time delivery. Stay connected.",
              },
              {
                icon: CheckCircle,
                title: "Transparent Pricing",
                desc: "No hidden fees. Our free tier is generous, and premium features are clearly priced with real value.",
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
              Love Stories Start Here
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">
              Real people, real connections, real results.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {[
              {
                name: "Sarah & James",
                location: "London, UK",
                quote:
                  "We matched on MatchIndeed and had our first video date within a week. The chemistry was instant — we've been together for 8 months now!",
                stars: 5,
              },
              {
                name: "Michael & Priya",
                location: "New York, US",
                quote:
                  "I love that you can actually see and talk to someone before committing to a date. It saved so much time and I found exactly who I was looking for.",
                stars: 5,
              },
              {
                name: "Emma & David",
                location: "Sydney, AU",
                quote:
                  "The video dating feature is a game changer. No more catfishing, no more awkward first dates. We knew we were compatible from the very first call.",
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
      <section id="pricing" className="bg-gray-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Simple, Transparent Pricing
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-500">
              Start with Basic and upgrade when you&apos;re ready for more.
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
                    <li key={opt.value} role="option">
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
                    "5 credits per month",
                    "5-day calendar slot (outgoing only)",
                    "Free incoming requests from all tiers",
                    "Browse profiles & send winks",
                  ],
                  cta: "Get Started",
                  popular: false,
                },
                {
                  id: "standard",
                  name: "Standard",
                  features: [
                    "Everything in Basic",
                    "15 credits per month",
                    "15-day calendar slot",
                    "Unlimited incoming requests",
                    "5 private custom slots",
                    "Preferred location setting",
                  ],
                  cta: "Choose Standard",
                  popular: false,
                },
                {
                  id: "premium",
                  name: "Premium",
                  features: [
                    "Everything in Standard",
                    "30 credits per month",
                    "30-day calendar slot",
                    "Preferred location for invitations",
                    "Request to Premium & VIP holders",
                  ],
                  cta: "Choose Premium",
                  popular: true,
                },
                {
                  id: "vip",
                  name: "VIP",
                  features: [
                    "Everything in Premium",
                    "Unlimited services",
                    "Full control over scheduling",
                    "Tell us when, date & time you want",
                    "Dedicated support",
                  ],
                  cta: "Go VIP",
                  popular: false,
                },
              ] as const
            ).map((plan) => {
              const p =
                pricing?.[plan.id] ??
                {
                  basic: { ngn: 10000, usd: 7, gbp: 5.5 },
                  standard: { ngn: 31500, usd: 20, gbp: 16 },
                  premium: { ngn: 63000, usd: 43, gbp: 34 },
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
                <Link
                  href="/register"
                  className={`mt-6 flex items-center justify-center rounded-full py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] ${
                    plan.popular
                      ? "bg-white text-[#1f419a] shadow-md"
                      : "bg-[#1f419a] text-white shadow-sm"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            );
            })}
          </div>
          )}
        </div>
      </section>

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
                    {faq.a === null ? (
                      (() => {
                        const p = pricing?.basic ?? { ngn: 10000, usd: 7, gbp: 5.5 };
                        const fmt =
                          currency === "ngn"
                            ? (n: number) => `₦${n.toLocaleString()}`
                            : currency === "gbp"
                              ? (n: number) => `£${n.toLocaleString()}`
                              : (n: number) => `$${n.toLocaleString()}`;
                        return `Basic tier starts at ${fmt(p[currency])}/month with 5 credits and 5-day calendar slots. You can browse profiles, send winks, and receive free incoming requests from higher tiers. Standard, Premium, and VIP tiers unlock more credits, calendar slots, and features.`;
                      })()
                    ) : (
                      faq.a
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
            Ready to Find Your Match?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-white/70">
            Join thousands of singles who are finding meaningful connections
            through video dating. Your perfect match could be one click away.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3 text-sm font-semibold text-[#1f419a] shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]"
            >
              Create Free Account
              <ArrowRight className="h-4 w-4" />
            </Link>
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
              <Image
                src="/matchindeed.svg"
                alt="MatchIndeed"
                width={130}
                height={34}
                style={{ width: "auto", height: "auto" }}
              />
              <p className="mt-3 text-sm text-gray-500">
                Connecting hearts through meaningful video dates. Find genuine
                connections, not just swipes.
              </p>
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
                <li>
                  <a href="#pricing" className="hover:text-[#1f419a]">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#faq" className="hover:text-[#1f419a]">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold text-gray-900">Legal</h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-500">
                <li>
                  <span className="cursor-default">Privacy Policy</span>
                </li>
                <li>
                  <span className="cursor-default">Terms of Service</span>
                </li>
                <li>
                  <span className="cursor-default">Cookie Policy</span>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold text-gray-900">Contact</h4>
              <ul className="mt-3 space-y-2 text-sm text-gray-500">
                <li>support@matchindeed.com</li>
                <li>London, United Kingdom</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-gray-100 pt-6 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} MatchIndeed. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
