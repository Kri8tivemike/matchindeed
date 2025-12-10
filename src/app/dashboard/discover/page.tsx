"use client";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Search, User, Sparkles, EyeOff, ChevronRight, ChevronLeft, Mail, X, Compass, Star } from "lucide-react";

type Profile = {
  id: string;
  name: string;
  age: number;
  city: string;
  imageUrl: string;
  heightLabel: string;
  tags: string[];
  similaritiesLabel: string;
};

export default function DiscoverPage() {
  const profiles: Profile[] = useMemo(
    () => [
      {
        id: "tati-1",
        name: "Tati",
        age: 32,
        city: "London",
        imageUrl:
          "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80",
        heightLabel: "5'5\" • 164 cm",
        tags: ["Masters", "Have kids", "Don't want kids", "True love"],
        similaritiesLabel: "You have 1 similarity",
      },
      {
        id: "tati-2",
        name: "Tati",
        age: 32,
        city: "London",
        imageUrl:
          "https://images.unsplash.com/photo-1517840933442-d2d1a05edb75?auto=format&fit=crop&w=1200&q=80",
        heightLabel: "5'6\" • 168 cm",
        tags: ["Masters", "Have kids", "Looking for something serious"],
        similaritiesLabel: "You have 2 similarities",
      },
    ],
    []
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"discover" | "topPicks">("discover");
  const promoCandidates = [
    "https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1497493292307-31c376b6e479?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1468430771625-ffb4f2f2cc3a?auto=format&fit=crop&w=800&q=80"
  ];
  const [promoIndex, setPromoIndex] = useState(0);
  const promoSrc = promoCandidates[promoIndex];
  const [avatar1, setAvatar1] = useState(
    "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80"
  );
  const [avatar2, setAvatar2] = useState(
    "https://images.unsplash.com/photo-1544723795-6b5305a9c1f1?auto=format&fit=crop&w=160&q=80"
  );
  const profileFallbacks = [
    "https://images.unsplash.com/photo-1517840933442-d2d1a05edb75?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1519085369420-43b51b66f6fc?auto=format&fit=crop&w=1200&q=80"
  ];
  const profileFallbackIdxRef = useRef(0);
  const [profileImgSrc, setProfileImgSrc] = useState<string | null>(null);

  type TopPick = {
    id: string;
    name: string;
    age: number;
    city: string;
    imageUrl: string;
    blurbTitle: string;
    blurbDesc: string;
  };

  const topPicks: TopPick[] = useMemo(
    () => [
      {
        id: "holly-1",
        name: "Holly",
        age: 32,
        city: "London",
        imageUrl:
          "https://images.unsplash.com/photo-1519085369420-43b51b66f6fc?auto=format&fit=crop&w=800&q=80",
        blurbTitle: "I'll stay up late for…",
        blurbDesc: "Deep conversations and that extra margaritas",
      },
      {
        id: "sara-1",
        name: "Sara",
        age: 29,
        city: "Manchester",
        imageUrl:
          "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80",
        blurbTitle: "Weekend plans",
        blurbDesc: "Hikes, coffee tastings, and books",
      },
      {
        id: "mia-1",
        name: "Mia",
        age: 27,
        city: "Bristol",
        imageUrl:
          "https://images.unsplash.com/photo-1544723795-6b5305a9c1f1?auto=format&fit=crop&w=800&q=80",
        blurbTitle: "Favorite city",
        blurbDesc: "Barcelona — beach + art",
      },
      {
        id: "olivia-1",
        name: "Olivia",
        age: 30,
        city: "Leeds",
        imageUrl:
          "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=80",
        blurbTitle: "Music",
        blurbDesc: "Soul, jazz, and indie",
      },
      {
        id: "nina-1",
        name: "Nina",
        age: 33,
        city: "London",
        imageUrl:
          "https://images.unsplash.com/photo-1517840933442-d2d1a05edb75?auto=format&fit=crop&w=800&q=80",
        blurbTitle: "Go-to meal",
        blurbDesc: "Tacos with homemade salsa",
      },
    ],
    []
  );

  const [topPickIndex, setTopPickIndex] = useState(0);
  const topPick = topPicks[topPickIndex] ?? null;
  const fallbackPeople = [
    "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1517840933442-d2d1a05edb75?auto=format&fit=crop&w=800&q=80"
  ];
  const topImageIdxRef = useRef(0);
  const [topImageSrc, setTopImageSrc] = useState<string>(topPick ? topPick.imageUrl : fallbackPeople[0]);
  const [topAvatarSrcs, setTopAvatarSrcs] = useState<string[]>(() => topPicks.map(p => p.imageUrl));

  const [countdown, setCountdown] = useState("00:00:00");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const diff = Math.max(0, end.getTime() - now.getTime());
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      setCountdown(`${h}:${m}:${s}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const currentProfile = profiles[currentIndex] ?? null;

  const showPrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? profiles.length - 1 : prev - 1));
    profileFallbackIdxRef.current = 0;
    setProfileImgSrc(null);
  };

  const showNext = () => {
    setCurrentIndex((prev) => (prev + 1) % profiles.length);
    profileFallbackIdxRef.current = 0;
    setProfileImgSrc(null);
  };

  const handleAnswer = (answer: "yes" | "no") => {
    // TODO: integrate with Supabase to persist like/pass
    void answer;
    showNext();
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#eaf0ff] to-[#f7f9ff]">
      <header className="sticky top-0 z-20 w-full border-b border-white/50 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Image src="/matchindeed.svg" alt="Matchindeed" width={140} height={36} />
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 rounded-full bg-[#1f419a] px-4 py-2 text-sm text-white shadow-sm"><Sparkles className="h-4 w-4"/>Boost</button>
            <button className="flex items-center gap-2 rounded-full border border-[#1f419a]/20 bg-white px-4 py-2 text-sm text-[#1f419a]"><EyeOff className="h-4 w-4"/>Incognito</button>
            <button className="flex items-center gap-2 rounded-full border border-[#1f419a]/20 bg-white px-4 py-2 text-sm text-[#1f419a]"><Mail className="h-4 w-4"/>Love Note</button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[240px_1fr_300px]">
        <aside className="flex h-full flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <nav className="space-y-2">
            <a className="flex items-center gap-3 rounded-xl bg-[#eef2ff] px-3 py-2 text-[#1f419a]" href="/dashboard/discover"><Compass className="h-4 w-4"/>Discover</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2 text-gray-700" href="/dashboard/likes"><Heart className="h-4 w-4"/>Likes<span className="ml-auto rounded-full bg-[#1f419a] px-2 text-xs text-white">1</span></a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2 text-gray-700" href="/dashboard/search"><Search className="h-4 w-4"/>Search</a>
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
            <div className="flex items-center justify-center px-2">
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => setActiveTab("discover")}
                className={`relative text-lg font-semibold ${
                  activeTab === "discover" ? "text-gray-900" : "text-gray-500"
                }`}
              >
                <span className="inline-flex items-center gap-2"><Compass className="h-4 w-4"/>Discover</span>
                {activeTab === "discover" && (
                  <span className="absolute -bottom-2 left-0 h-[3px] w-16 rounded-full bg-[#1f419a]"></span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("topPicks")}
                className={`relative text-lg font-semibold ${
                  activeTab === "topPicks" ? "text-gray-900" : "text-gray-500"
                }`}
              >
                <span className="inline-flex items-center gap-2"><Star className="h-4 w-4"/>Top picks</span>
                {activeTab === "topPicks" && (
                  <span className="absolute -bottom-2 left-0 h-[3px] w-20 rounded-full bg-[#1f419a]"></span>
                )}
              </button>
            </div>
            </div>

            {activeTab === "discover" && (
              <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[1fr_1px_1fr]">
                <div className="relative overflow-hidden rounded-3xl ring-1 ring-black/5">
                  <div className="grid grid-cols-1">
                    <div className="relative">
                      <Image
                        src={profileImgSrc ?? currentProfile.imageUrl}
                        alt={`${currentProfile.name} profile photo`}
                        width={800}
                        height={600}
                        sizes="(min-width:768px) 600px, 100vw"
                        className="h-full w-full rounded-3xl object-cover"
                        onError={() => {
                          if (profileFallbackIdxRef.current < profileFallbacks.length) {
                            setProfileImgSrc(profileFallbacks[profileFallbackIdxRef.current]);
                            profileFallbackIdxRef.current += 1;
                          } else {
                            setProfileImgSrc("/globe.svg");
                          }
                        }}
                      />
                      <div className="absolute right-6 top-6 flex items-center gap-2">
                        <div className="h-9 w-9 rounded-full bg-white shadow ring-2 ring-[#1f419a] flex items-center justify-center">
                          <Heart className="h-4 w-4 text-[#1f419a]" />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={showPrev}
                        aria-label="Previous profile"
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={showNext}
                        aria-label="Next profile"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2 text-xs text-white">
                        {currentIndex + 1}/{profiles.length}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="hidden bg-gray-200 md:block" />
                <div className="p-5 rounded-3xl bg-white shadow-sm">
                  <div className="text-2xl font-semibold text-gray-900">{currentProfile.name}</div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow ring-2 ring-[#1f419a]">
                      <User className="h-3 w-3 text-[#1f419a]" />
                    </span>
                    <span>{currentProfile.age}, {currentProfile.city}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-800 shadow-sm">
                      <span>📏</span>
                      <span>{currentProfile.heightLabel}</span>
                    </span>
                    {currentProfile.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-800 shadow-sm"
                      >
                        {tag === "Masters" && <span>🎓</span>}
                        {tag === "Have kids" && <span>👶</span>}
                        {tag === "Don't want kids" && <span>🚫👶</span>}
                        {tag === "True love" && <span>🔎</span>}
                        <span>{tag}</span>
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex items-center">
                      <Image
                        src={avatar1}
                        alt="profile similarity 1"
                        width={40}
                        height={40}
                        sizes="40px"
                        className="h-10 w-10 rounded-full object-cover shadow ring-2 ring-white"
                        onError={() =>
                          setAvatar1(
                            "https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?auto=format&fit=crop&w=160&q=80"
                          )
                        }
                      />
                      <Image
                        src={avatar2}
                        alt="profile similarity 2"
                        width={40}
                        height={40}
                        sizes="40px"
                        className="h-10 w-10 -ml-3 rounded-full object-cover shadow ring-2 ring-[#1f419a]"
                        onError={() =>
                          setAvatar2(
                            "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=160&q=80"
                          )
                        }
                      />
                    </div>
                    <div className="text-sm">
                      <div className="text-gray-700">{currentProfile.similaritiesLabel}</div>
                      <div className="text-gray-800">Do you like {currentProfile.name}?</div>
                    </div>
                  </div>
                  <div className="mt-6 flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleAnswer("no")}
                      className="h-11 flex-1 rounded-full bg-black text-sm text-white shadow-lg flex items-center justify-center gap-2"
                    >
                      <X className="h-4 w-4" />
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAnswer("yes")}
                      className="h-11 flex-1 rounded-full bg-[#1f419a] text-sm text-white shadow-lg flex items-center justify-center gap-2"
                    >
                      <Heart className="h-4 w-4" />
                      Yes
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "topPicks" && (
              <div className="mt-4 space-y-4">
                <div className="text-center text-sm text-gray-600">
                  A selection of 5 relevant profiles suggested to you every day
                  <div className="mt-1 text-[#1f419a]">Only {countdown} left to chat with these users</div>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-[90px_1fr]">
                  <div className="flex flex-col items-center gap-4">
                    {topPicks.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setTopPickIndex(i); setTopImageSrc(topPicks[i].imageUrl); topImageIdxRef.current = 0; }}
                        className={`rounded-full p-[2px] ${i === topPickIndex ? "ring-2 ring-[#1f419a]" : "ring-0"}`}
                        aria-label={`Select ${p.name}`}
                      >
                        <Image
                          src={topAvatarSrcs[i]}
                          alt={`${p.name} avatar`}
                          width={56}
                          height={56}
                          sizes="56px"
                          className="h-14 w-14 rounded-full object-cover shadow"
                          onError={() =>
                            setTopAvatarSrcs((prev) => {
                              const copy = [...prev];
                              copy[i] = "/globe.svg";
                              return copy;
                            })
                          }
                        />
                      </button>
                    ))}
                  </div>
                  <div className="overflow-hidden rounded-3xl bg-white shadow ring-1 ring-black/5">
                    <div className="grid grid-cols-2">
                      <Image
                        src={topImageSrc}
                        alt={`${topPick?.name ?? "Profile"} large photo`}
                        width={800}
                        height={600}
                        sizes="(min-width:768px) 600px, 100vw"
                        className="h-full w-full object-cover"
                        onError={() => {
                          if (topImageIdxRef.current < fallbackPeople.length) {
                            setTopImageSrc(fallbackPeople[topImageIdxRef.current]);
                            topImageIdxRef.current += 1;
                          } else {
                            setTopImageSrc("/globe.svg");
                          }
                        }}
                      />
                      <div className="p-6">
                        <div className="text-2xl font-semibold text-gray-900">{topPick?.name}</div>
                        <div className="mt-1 text-sm text-gray-600">Age {topPick?.age}, {topPick?.city}</div>
                        <div className="mt-4 rounded-2xl bg-[#f5f7ff] p-4 text-sm text-gray-800">
                          <div className="font-medium text-[#1f419a]">{topPick?.blurbTitle}</div>
                          <div className="mt-1">{topPick?.blurbDesc}</div>
                        </div>
                        <div className="mt-6 text-right">
                          <a href="#" className="inline-flex items-center gap-2 text-[#1f419a]">
                            View profile <ChevronRight className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 md:block">
          <Image
            src={promoSrc}
            alt="New York City at night"
            width={600}
            height={800}
            className="h-full w-full rounded-xl object-cover"
            sizes="300px"
            onError={() => {
              setPromoIndex((i) => (i < promoCandidates.length - 1 ? i + 1 : i));
            }}
          />
        </aside>
      </main>
    </div>
  );
}
