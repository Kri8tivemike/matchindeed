/**
 * Mobile Bottom Navigation Bar
 * ----------------------------
 * Fixed bottom bar visible only on mobile (< md breakpoint).
 * Provides quick access to the 5 most-used sections:
 * Home, Discover, Messages, Likes, Profile.
 *
 * Hides automatically on desktop where the full Sidebar is visible.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Compass,
  MessageCircle,
  Heart,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type NavItem = {
  href: string;
  icon: typeof Home;
  label: string;
  /** Match function — returns true if the given pathname belongs to this tab */
  match: (p: string) => boolean;
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    icon: Home,
    label: "Home",
    match: (p) => p === "/dashboard",
  },
  {
    href: "/dashboard/discover",
    icon: Compass,
    label: "Discover",
    match: (p) => p.startsWith("/dashboard/discover") || p.startsWith("/dashboard/search"),
  },
  {
    href: "/dashboard/messages",
    icon: MessageCircle,
    label: "Messages",
    match: (p) => p.startsWith("/dashboard/messages"),
  },
  {
    href: "/dashboard/likes",
    icon: Heart,
    label: "Likes",
    match: (p) => p.startsWith("/dashboard/likes") || p.startsWith("/dashboard/matches"),
  },
  {
    href: "/dashboard/profile",
    icon: User,
    label: "Profile",
    match: (p) => p.startsWith("/dashboard/profile"),
  },
];

export default function MobileNav() {
  const pathname = usePathname() || "";
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  // Fetch unread message count for the badge
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch("/api/messages", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setUnreadMsgCount(data.total_unread || 0);
        }
      } catch {
        // Silent fail
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur-lg md:hidden safe-area-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        {navItems.map((item) => {
          const isActive = item.match(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 transition-colors ${
                isActive
                  ? "text-[#1f419a]"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`h-5 w-5 transition-transform ${
                    isActive ? "scale-110" : ""
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {/* Unread badge for Messages */}
                {item.label === "Messages" && unreadMsgCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1f419a] px-1 text-[9px] font-bold text-white">
                    {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-medium leading-none ${
                  isActive ? "text-[#1f419a]" : "text-gray-400"
                }`}
              >
                {item.label}
              </span>
              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute -top-0.5 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-[#1f419a]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
