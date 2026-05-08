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

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Compass,
  MessageCircle,
  Heart,
  User,
  CalendarCheck,
  Wallet,
  Bell,
} from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import { supabase } from "@/lib/supabase";
import {
  isAbortLikeError,
  isTransientRequestError,
  shouldSkipBackgroundRequest,
} from "@/lib/request-errors";
import { getVisibleReceivedActivityCount } from "@/lib/like-counters";
import { useDashboardAccess } from "@/components/dashboard/DashboardAccessProvider";

type NextLinkProps = ComponentProps<typeof NextLink>;

function Link({ prefetch, ...props }: NextLinkProps) {
  return <NextLink {...props} prefetch={prefetch ?? false} />;
}

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

const quickActions: NavItem[] = [
  {
    href: "/dashboard/meetings",
    icon: CalendarCheck,
    label: "Meetings",
    match: (p) => p.startsWith("/dashboard/meetings"),
  },
  {
    href: "/dashboard/wallet",
    icon: Wallet,
    label: "Wallet",
    match: (p) => p.startsWith("/dashboard/wallet") || p.startsWith("/dashboard/profile/wallet"),
  },
  {
    href: "/dashboard/notifications",
    icon: Bell,
    label: "Alerts",
    match: (p) => p.startsWith("/dashboard/notifications") || p.startsWith("/dashboard/profile/notifications"),
  },
];

export default function MobileNav() {
  const pathname = usePathname() || "";
  const { walletAccessEnabled } = useDashboardAccess();
  const visibleQuickActions = quickActions.filter(
    (item) => walletAccessEnabled || item.label !== "Wallet"
  );
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateViewport);
      return () => mediaQuery.removeEventListener("change", updateViewport);
    }

    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

  // Fetch unread message count for the badge
  useEffect(() => {
    if (!isMobileViewport || pathname.startsWith("/dashboard/messages")) {
      return;
    }

    let currentController: AbortController | null = null;

    const fetchUnread = async () => {
      if (shouldSkipBackgroundRequest()) {
        return;
      }

      currentController?.abort();
      currentController = new AbortController();

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch("/api/messages?summary=true", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: currentController.signal,
        });

        if (res.ok) {
          const data = await res.json();
          setUnreadMsgCount(data.total_unread || 0);
        }
      } catch (error) {
        if (isAbortLikeError(error) || isTransientRequestError(error)) {
          return;
        }
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => {
      currentController?.abort();
      clearInterval(interval);
    };
  }, [isMobileViewport, pathname]);

  // Fetch received likes/winks/interested count for the Likes badge
  useEffect(() => {
    const fetchLikesCount = async () => {
      if (shouldSkipBackgroundRequest()) {
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (!user) return;

        const count = await getVisibleReceivedActivityCount(user.id);
        setLikesCount(count || 0);
      } catch {
        // Silent fail
      }
    };

    fetchLikesCount();
    const interval = setInterval(fetchLikesCount, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur-lg md:hidden safe-area-bottom">
      <div className="mx-auto max-w-lg border-b border-gray-100 px-2 pt-1 pb-1.5">
        <div className={`grid gap-1.5 ${visibleQuickActions.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {visibleQuickActions.map((item) => {
            const isActive = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors ${
                  isActive
                    ? "bg-[#1f419a]/10 text-[#1f419a]"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
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
                {/* Badge for Likes */}
                {item.label === "Likes" && likesCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1f419a] px-1 text-[9px] font-bold text-white">
                    {likesCount > 99 ? "99+" : likesCount}
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
