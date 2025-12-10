"use client";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Search as SearchIcon, User, Sparkles, EyeOff, Mail, Compass, SlidersHorizontal, Heart, MessageCircle, X, Lock, ChevronDown } from "lucide-react";

type CardProfile = {
  id: string;
  name: string;
  age: number;
  city: string;
  imageUrl: string;
  verified?: boolean;
  heightCm?: number;
};

export default function SearchPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(24);
  const [city, setCity] = useState("London");
  const [distance, setDistance] = useState(500);
  const [online, setOnline] = useState(true);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [advancedUnlocked, setAdvancedUnlocked] = useState(false);
  const [heightMin, setHeightMin] = useState(150);
  const [heightMax, setHeightMax] = useState(200);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedEthnicities, setSelectedEthnicities] = useState<string[]>([]);
  const [selectedEducations, setSelectedEducations] = useState<string[]>([]);
  const [selectedReligions, setSelectedReligions] = useState<string[]>([]);
  const [childrenPref, setChildrenPref] = useState<string>("any");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [smokerPref, setSmokerPref] = useState<string>("");
  const [showMoreInterests, setShowMoreInterests] = useState(false);
  const [showMoreSports, setShowMoreSports] = useState(false);
  const likesCount = 2;
  const singlesCountLabel = "+1000 singles";

  const profiles: CardProfile[] = useMemo(
    () => [
      {
        id: "rebecca-1",
        name: "Rebecca",
        age: 31,
        city: "London",
        imageUrl:
          "https://images.unsplash.com/photo-1517840933442-d2d1a05edb75?auto=format&fit=crop&w=1200&q=80",
        verified: true,
        heightCm: 168,
      },
      {
        id: "jessica-2",
        name: "Jessica",
        age: 24,
        city: "England",
        imageUrl:
          "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80",
        verified: true,
        heightCm: 162,
      },
      {
        id: "stacy-1",
        name: "Stacy",
        age: 29,
        city: "Peckham",
        imageUrl:
          "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80",
        verified: true,
        heightCm: 170,
      },
      {
        id: "natalie-1",
        name: "Natalie",
        age: 30,
        city: "Leeds",
        imageUrl:
          "https://images.unsplash.com/photo-1519085369420-43b51b66f6fc?auto=format&fit=crop&w=1200&q=80",
        heightCm: 165,
      },
      {
        id: "olivia-1",
        name: "Olivia",
        age: 28,
        city: "Bristol",
        imageUrl:
          "https://images.unsplash.com/photo-1544723795-6b5305a9c1f1?auto=format&fit=crop&w=1200&q=80",
        heightCm: 160,
      },
      {
        id: "mia-1",
        name: "Mia",
        age: 26,
        city: "Brighton",
        imageUrl:
          "https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?auto=format&fit=crop&w=1200&q=80",
        heightCm: 172,
      },
    ],
    []
  );

  const fallbacks = [
    "https://images.unsplash.com/photo-1517840933442-d2d1a05edb75?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80",
  ];
  const fbIdx = useRef(0);
  const [cardSrcs, setCardSrcs] = useState<string[]>(() => profiles.map((p) => p.imageUrl));
  const filteredProfiles = useMemo(
    () =>
      profiles.filter(
        (p) =>
          p.age >= minAge &&
          p.age <= maxAge &&
          (!verifiedOnly || !!p.verified) &&
          (!advancedUnlocked || p.heightCm === undefined || (p.heightCm >= heightMin && p.heightCm <= heightMax))
      ),
    [profiles, minAge, maxAge, verifiedOnly, advancedUnlocked, heightMin, heightMax]
  );

  

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#eaf0ff] to-[#f7f9ff]">
      <header className="sticky top-0 z-20 w-full border-b border-white/50 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2"><Image src="/matchindeed.svg" alt="Matchindeed" width={140} height={36} /></Link>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 rounded-full bg-[#1f419a] px-4 py-2 text-sm text-white shadow-sm"><Sparkles className="h-4 w-4"/>Boost</button>
            <button className="flex items-center gap-2 rounded-full border border-[#1f419a]/20 bg-white px-4 py-2 text-sm text-[#1f419a]"><EyeOff className="h-4 w-4"/>Incognito</button>
            <button className="flex items-center gap-2 rounded-full border border-[#1f419a]/20 bg-white px-4 py-2 text-sm text-[#1f419a]"><Mail className="h-4 w-4"/>Love Note</button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[240px_1fr]">
        <aside className="flex h-full flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <nav className="space-y-2">
            <a className="flex items-center gap-3 rounded-xl px-3 py-2 text-gray-700" href="/dashboard/discover"><Compass className="h-4 w-4"/>Discover</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2 text-gray-700" href="/dashboard/likes"><Heart className="h-4 w-4"/>Likes<span className="ml-auto rounded-full bg-[#1f419a] px-2 text-xs text-white">{likesCount}</span></a>
            <a className="flex items-center gap-3 rounded-xl bg-[#eef2ff] px-3 py-2 text-[#1f419a]" href="/dashboard/search"><SearchIcon className="h-4 w-4"/>Search</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2 text-gray-700" href="/dashboard/profile"><User className="h-4 w-4"/>My profile<span className="ml-auto rounded-full bg-gray-100 px-2 text-xs text-gray-700">99</span></a>
          </nav>
          <div className="mt-auto rounded-xl border border-gray-200 p-3 text-center text-sm text-gray-600">About me</div>
        </aside>

        <section className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2ff] text-[#1f419a]"><User className="h-5 w-5"/></div>
              <div className="text-sm text-gray-700">Complete your profile to get the best Matchindeed experience!</div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-lg ring-1 ring-black/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <span className="rounded-full bg-gray-100 px-3 py-1">{singlesCountLabel}</span>
              </div>
              <button type="button" onClick={() => setShowFilters(true)} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700">
                <SlidersHorizontal className="h-4 w-4"/>
                Filters
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProfiles.map((p) => (
                <div key={p.id} className="overflow-hidden rounded-3xl bg-white shadow ring-1 ring-black/5">
                  <div className="relative">
                    <Image
                      src={cardSrcs[profiles.findIndex((x) => x.id === p.id)]}
                      alt={`${p.name} photo`}
                      width={1200}
                      height={900}
                      sizes="(min-width:1024px) 360px, (min-width:640px) 50vw, 100vw"
                      className="h-60 w-full object-cover"
                      onError={() =>
                        setCardSrcs((prev) => {
                          const copy = [...prev];
                          const idx = profiles.findIndex((x) => x.id === p.id);
                          if (fbIdx.current < fallbacks.length) {
                            copy[idx] = fallbacks[fbIdx.current];
                            fbIdx.current += 1;
                          } else {
                            copy[idx] = "/globe.svg";
                          }
                          return copy;
                        })
                      }
                    />
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      <button type="button" className="rounded-full bg-white p-2 shadow ring-1 ring-black/5"><Heart className="h-4 w-4 text-[#1f419a]"/></button>
                      <button type="button" className="rounded-full bg-white p-2 shadow ring-1 ring-black/5"><MessageCircle className="h-4 w-4 text-[#1f419a]"/></button>
                    </div>
                  </div>
                  <div className="flex items-start justify-between border-t bg-white p-4">
                    <div>
                      <div className="text-lg font-semibold text-gray-900">
                        {p.name}
                        {p.verified && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-[#1f419a]"></span>}
                      </div>
                      <div className="text-sm text-gray-600">Age {p.age}, {p.city}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        {showFilters && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowFilters(false)} />
            <div className="relative max-h-[85vh] w-[92vw] max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-0 shadow-xl text-[var(--text-primary)] flex flex-col" style={{ boxShadow: "0 6px 20px var(--shadow)" }}>
              <div className="z-10 flex items-center justify-between rounded-t-2xl bg-[var(--surface-2)] px-5 py-3 border-b border-[var(--border)]">
                <div className="text-xl font-semibold">My Filters</div>
                <button type="button" onClick={() => setShowFilters(false)} className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--muted)]"><X className="h-4 w-4"/></button>
              </div>
              <div className="modal-scroll flex-1 overflow-y-auto px-5 py-4 space-y-6">
                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Age</div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <div>From <span className="font-medium">Age {minAge}</span> to <span className="font-medium">Age {maxAge}</span></div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <input type="range" min={18} max={70} value={minAge} onChange={(e) => setMinAge(Math.min(Number(e.target.value), maxAge))} className="range-brand h-2 w-full cursor-pointer" />
                    <input type="range" min={18} max={70} value={maxAge} onChange={(e) => setMaxAge(Math.max(Number(e.target.value), minAge))} className="range-brand h-2 w-full cursor-pointer" />
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Location</div>
                  <label className="mt-2 block text-xs text-[var(--text-secondary)]">Town/City</label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm bg-[var(--surface)]" placeholder="London" />
                  <div className="mt-3 text-sm">Up to {distance} mi</div>
                  <input type="range" min={5} max={500} value={distance} onChange={(e) => setDistance(Number(e.target.value))} className="range-brand mt-2 h-2 w-full cursor-pointer" />
                </div>
                <div className="border-t pt-4">
                  <div className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Option Match</div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--success)]"></span><span className="text-sm">Online</span></div>
                    <label className="inline-flex cursor-pointer items-center">
                      <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="peer sr-only" />
                      <span className="block h-5 w-9 rounded-full bg-[var(--muted)] peer-checked:bg-[var(--brand-secondary)]"></span>
                    </label>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--brand-secondary)]">✓</span><span className="text-sm">Verified profile</span></div>
                    <label className="inline-flex cursor-pointer items-center">
                      <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="peer sr-only" />
                      <span className="block h-5 w-9 rounded-full bg-[var(--muted)] peer-checked:bg-[var(--brand-secondary)]"></span>
                    </label>
                  </div>
                  <div className="mt-2 text-xs text-[var(--brand-secondary)]">Verify your profile to stand out and increase your chances of getting matches!</div>
                </div>
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">Advanced filters</div>
                    <button
                      type="button"
                      onClick={() => setAdvancedUnlocked((v) => !v)}
                      className={`rounded-full px-3 py-1 text-sm ${advancedUnlocked ? "bg-[var(--brand-secondary)] text-white" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"}`}
                    >
                      {advancedUnlocked ? "Unlocked" : "Unlock"}
                    </button>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm">Languages</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        "English",
                        "Spanish",
                        "French",
                        "Arabic",
                        "Hindi",
                        "Yoruba",
                      ].map((opt) => {
                        const selected = selectedLanguages.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              if (!advancedUnlocked) return;
                              setSelectedLanguages((prev) =>
                                prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                              );
                            }}
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${selected ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"} ${!advancedUnlocked ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm">Ethnicity</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["Black", "White", "Asian", "Hispanic", "Mixed", "Other"].map((opt) => {
                        const selected = selectedEthnicities.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              if (!advancedUnlocked) return;
                              setSelectedEthnicities((prev) =>
                                prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                              );
                            }}
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${selected ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"} ${!advancedUnlocked ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm">Education</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["High school", "Bachelor's", "Master's", "PhD"].map((opt) => {
                        const selected = selectedEducations.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              if (!advancedUnlocked) return;
                              setSelectedEducations((prev) =>
                                prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                              );
                            }}
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${selected ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"} ${!advancedUnlocked ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm">Religion</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["Christian", "Muslim", "Jewish", "Hindu", "Buddhist", "Non-religious"].map((opt) => {
                        const selected = selectedReligions.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              if (!advancedUnlocked) return;
                              setSelectedReligions((prev) =>
                                prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                              );
                            }}
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${selected ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"} ${!advancedUnlocked ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm">Height</div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">From {heightMin} cm to {heightMax} cm</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="range"
                        min={140}
                        max={220}
                        value={heightMin}
                        onChange={(e) => setHeightMin(Math.min(Number(e.target.value), heightMax))}
                        className={`range-brand h-2 w-full cursor-pointer ${!advancedUnlocked ? "opacity-50 cursor-not-allowed" : ""}`}
                        disabled={!advancedUnlocked}
                      />
                      <input
                        type="range"
                        min={140}
                        max={220}
                        value={heightMax}
                        onChange={(e) => setHeightMax(Math.max(Number(e.target.value), heightMin))}
                        className={`range-brand h-2 w-full cursor-pointer ${!advancedUnlocked ? "opacity-50 cursor-not-allowed" : ""}`}
                        disabled={!advancedUnlocked}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm">Want children</div>
                    <div className="mt-2 flex items-center gap-2">
                      {["any", "no-children", "has-children"].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            if (!advancedUnlocked) return;
                            setChildrenPref(opt);
                          }}
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${childrenPref === opt ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"} ${!advancedUnlocked ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {opt === "any" ? "Any" : opt === "no-children" ? "Doesn't want kids" : "Wants kids"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 text-xs uppercase tracking-wide text-[var(--text-secondary)]">Lifestyle</div>

                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-[var(--text-secondary)]" />
                      <div className="text-sm">Interests</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        "Dining out",
                        "Travel/sightseeing",
                        "Music",
                        "The outdoors",
                        "Cooking",
                        "Dancing",
                        ...(showMoreInterests ? ["Reading", "Art", "Movies", "Tech", "Gaming"] : []),
                      ].map((opt) => {
                        const selected = selectedInterests.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              if (!advancedUnlocked) return;
                              setSelectedInterests((prev) =>
                                prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                              );
                            }}
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${selected ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"} ${!advancedUnlocked ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMoreInterests((v) => !v)}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]"
                    >
                      {showMoreInterests ? "View less" : "View more"}
                      <ChevronDown className={`h-3 w-3 transition-transform ${showMoreInterests ? "rotate-180" : "rotate-0"}`} />
                    </button>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-[var(--text-secondary)]" />
                      <div className="text-sm">Sports</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        "Hiking / trekking",
                        "Fitness training",
                        "American football",
                        "Running",
                        "Dancing",
                        "Cycling",
                        ...(showMoreSports ? ["Basketball", "Soccer", "Tennis", "Swimming", "Yoga"] : []),
                      ].map((opt) => {
                        const selected = selectedSports.includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              if (!advancedUnlocked) return;
                              setSelectedSports((prev) =>
                                prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                              );
                            }}
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${selected ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"} ${!advancedUnlocked ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMoreSports((v) => !v)}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]"
                    >
                      {showMoreSports ? "View less" : "View more"}
                      <ChevronDown className={`h-3 w-3 transition-transform ${showMoreSports ? "rotate-180" : "rotate-0"}`} />
                    </button>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-[var(--text-secondary)]" />
                      <div className="text-sm">Smoker</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["Never smokes", "Socially smokes", "Smokes regularly", "Trying to quit"].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            if (!advancedUnlocked) return;
                            setSmokerPref(opt);
                          }}
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${smokerPref === opt ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]"} ${!advancedUnlocked ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="z-10 flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setMinAge(18);
                    setMaxAge(24);
                    setCity("London");
                    setDistance(500);
                    setOnline(true);
                    setVerifiedOnly(false);
                    setSelectedLanguages([]);
                    setSelectedEthnicities([]);
                    setSelectedEducations([]);
                    setSelectedReligions([]);
                    setChildrenPref("any");
                    setHeightMin(150);
                    setHeightMax(200);
                    setSelectedInterests([]);
                    setSelectedSports([]);
                    setSmokerPref("");
                    setShowMoreInterests(false);
                    setShowMoreSports(false);
                  }}
                  className="text-sm text-[var(--text-secondary)]"
                >
                  Reset
                </button>
                <button type="button" onClick={() => setShowFilters(false)} className="rounded-full bg-[var(--brand-primary)] px-5 py-2 text-sm text-white hover:bg-[var(--brand-primary-700)]">Confirm</button>
              </div>
            </div>
          </div>
        )}
        
      </main>
    </div>
  );
}
