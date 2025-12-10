"use client";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Heart, Search, User, Sparkles, EyeOff, Mail, ChevronLeft, Compass } from "lucide-react";

type LikeProfile = {
  id: string;
  name: string;
  age: number;
  city: string;
  imageUrl: string;
};

export default function LikesPage() {
  const [activeTab, setActiveTab] = useState<"received" | "mine">("received");
  const likes: LikeProfile[] = useMemo(
    () => [
      {
        id: "anabelle-1",
        name: "Anabelle",
        age: 32,
        city: "London",
        imageUrl:
          "https://images.unsplash.com/photo-1519085369420-43b51b66f6fc?auto=format&fit=crop&w=1200&q=80",
      },
      {
        id: "jessica-1",
        name: "Jessica",
        age: 32,
        city: "London",
        imageUrl:
          "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80",
      },
    ],
    []
  );

  const fallbacks = [
    "https://images.unsplash.com/photo-1517840933442-d2d1a05edb75?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80",
  ];
  const fallbackIdxRef = useRef(0);
  const [cardSrcs, setCardSrcs] = useState<string[]>(() => likes.map((l) => l.imageUrl));

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

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[240px_1fr_300px]">
        <aside className="flex h-full flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <nav className="space-y-2">
            <a className="flex items-center gap-3 rounded-xl px-3 py-2 text-gray-700" href="/dashboard/discover"><Compass className="h-4 w-4"/>Discover</a>
            <a className="flex items-center gap-3 rounded-xl bg-[#eef2ff] px-3 py-2 text-[#1f419a]" href="/dashboard/likes"><Heart className="h-4 w-4"/>Likes<span className="ml-auto rounded-full bg-[#1f419a] px-2 text-xs text-white">{likes.length}</span></a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2 text-gray-700" href="/dashboard/search"><Search className="h-4 w-4"/>Search</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2 text-gray-700" href="/dashboard/profile"><User className="h-4 w-4"/>My profile<span className="ml-auto rounded-full bg-gray-100 px-2 text-xs text-gray-700">99</span></a>
          </nav>
          <div className="mt-auto rounded-xl border border-gray-200 p-3 text-center text-sm text-gray-600">About me</div>
        </aside>

        <section className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-[#1f419a]">
            <Link href="/dashboard/discover" className="inline-flex items-center gap-2"><ChevronLeft className="h-4 w-4"/>Back</Link>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center justify-center px-2">
              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => setActiveTab("received")}
                  className={`relative text-lg font-semibold ${activeTab === "received" ? "text-gray-900" : "text-gray-400"}`}
                >
                  Likes received
                  {activeTab === "received" && (
                    <span className="absolute -bottom-2 left-0 h-[3px] w-32 rounded-full bg-[#1f419a]"></span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("mine")}
                  className={`relative text-lg font-semibold ${activeTab === "mine" ? "text-gray-900" : "text-gray-400"}`}
                >
                  My likes
                  {activeTab === "mine" && (
                    <span className="absolute -bottom-2 left-0 h-[3px] w-24 rounded-full bg-[#1f419a]"></span>
                  )}
                </button>
              </div>
            </div>

            {activeTab === "received" && (
              <div className="mt-6">
                <div className="px-2">
                  <div className="text-3xl font-bold text-gray-900">Likes received ({likes.length})</div>
                </div>
                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  {likes.map((l, i) => (
                    <div key={l.id} className="overflow-hidden rounded-3xl bg-white shadow ring-1 ring-black/5">
                      <Image
                        src={cardSrcs[i]}
                        alt={`${l.name} photo`}
                        width={1200}
                        height={900}
                        sizes="(min-width:768px) 600px, 100vw"
                        className="h-72 w-full object-cover"
                        onError={() =>
                          setCardSrcs((prev) => {
                            const copy = [...prev];
                            if (fallbackIdxRef.current < fallbacks.length) {
                              copy[i] = fallbacks[fallbackIdxRef.current];
                              fallbackIdxRef.current += 1;
                            } else {
                              copy[i] = "/globe.svg";
                            }
                            return copy;
                          })
                        }
                      />
                      <div className="flex items-start justify-between border-t bg-white p-4">
                        <div>
                          <div className="text-xl font-semibold text-gray-900">{l.name}</div>
                          <div className="text-sm text-gray-600">Age {l.age}, {l.city}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="sticky bottom-0 mt-6 flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-4 text-sm text-gray-700">
                  <div>See who’s liked you with a Pass</div>
                  <button className="rounded-full bg-green-600 px-5 py-2 text-white shadow">Continue</button>
                </div>
              </div>
            )}

            {activeTab === "mine" && (
              <div className="mt-8 space-y-6">
                <div className="text-2xl font-bold text-gray-900">The members you’ve Liked are shown here.</div>
                <div className="text-sm text-gray-600">And if you get a Like back, then the feeling’s mutual! Get yourself noticed by sending some Likes yourself</div>
                <div>
                  <Link href="/dashboard/discover" className="inline-block rounded-full bg-[#1f419a] px-6 py-3 text-white shadow-md">Send some likes</Link>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 md:block">
          <Image
            src="https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=800&q=80"
            alt="Promo"
            width={600}
            height={800}
            className="h-full w-full rounded-xl object-cover"
            sizes="300px"
          />
        </aside>
      </main>
    </div>
  );
}
