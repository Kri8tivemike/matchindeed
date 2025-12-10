"use client";
import Link from "next/link";
import Image from "next/image";
import Sidebar from "../components/Sidebar";
import { Bell, ChevronDown, MessageCircle, Heart, Eye, Mail, Compass, Search as SearchIcon } from "lucide-react";
import { useState } from "react";

export default function NotificationsPage() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setOpen((p) => ({ ...p, [key]: !p[key] }));
  const items = [
    { key: "messages", label: "Messages received", desc: "Site, push, e-mail", icon: MessageCircle },
    { key: "views", label: "Profile views", desc: "Site, push, e-mail", icon: Eye },
    { key: "likes", label: "Likes received", desc: "Site, push, e-mail", icon: Heart },
    { key: "mutual", label: "New mutual like", desc: "E-mail", icon: Mail },
  ];
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#eaf0ff] to-[#f7f9ff]">
      <header className="sticky top-0 z-20 w-full border-b border-white/50 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2"><Image src="/matchindeed.svg" alt="Matchindeed" width={140} height={36} /></Link>
          </div>
          <div className="flex items-center gap-3 text-[#1f419a]">
            <Bell className="h-5 w-5" />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[64px_260px_1fr]">
        <div className="hidden md:flex h-full flex-col items-center rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          <nav className="flex flex-col items-center gap-4 text-[#1f419a]">
            <a href="/dashboard/discover" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2ff]"><Compass className="h-4 w-4"/></a>
            <a href="/dashboard/likes" className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2ff]"><Heart className="h-4 w-4"/>
              <span className="absolute -right-1 -top-1 rounded-full bg-[#1f419a] px-1 text-[10px] text-white">15</span>
            </a>
            <a href="/dashboard/search" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2ff]"><SearchIcon className="h-4 w-4"/></a>
            <a href="#" className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2ff]"><MessageCircle className="h-4 w-4"/>
              <span className="absolute -right-2 -top-2 rounded-full bg-pink-500 px-1 text-[10px] text-white">+99</span>
            </a>
            <a href="/dashboard/profile" className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full ring-2 ring-[#1f419a] bg-white">
              <Image src="/matchindeed.svg" alt="Avatar" width={20} height={20} />
            </a>
          </nav>
        </div>

        <Sidebar active="notifications" />

        <section>
          <div className="rounded-3xl bg-white p-6 shadow ring-1 ring-black/5">
            <div className="flex items-center gap-2 text-2xl font-semibold text-gray-900"><Bell className="h-6 w-6"/><span>Notifications</span></div>
            <div className="mt-1 text-sm text-gray-600">Choose the types of notifications you want to receive about your profile activity, things you&apos;re interested in and our recommendations.</div>
            <div className="mt-6 space-y-3">
              {items.map(({ key, label, desc, icon: Icon }) => (
                <div key={key} className="rounded-2xl border border-gray-200 bg-white">
                  <button type="button" onClick={() => toggle(key)} className="flex w-full items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-[#1f419a]"/>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{label}</div>
                        <div className="text-xs text-gray-500">{desc}</div>
                      </div>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open[key] ? "rotate-180" : "rotate-0"}`}/>
                  </button>
                  {open[key] && (
                    <div className="border-t border-gray-200 px-4 py-3">
                      <div className="flex flex-wrap gap-3 text-sm">
                        {desc.split(", ").map((ch) => (
                          <label key={ch} className="inline-flex items-center gap-2">
                            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-[#1f419a] focus:ring-[#1f419a]" defaultChecked />
                            <span className="text-gray-700 capitalize">{ch}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
