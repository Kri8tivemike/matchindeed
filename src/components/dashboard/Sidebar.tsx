"use client";
import NextLink from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, type ComponentProps } from "react";
import { ChevronRight, ChevronDown, HelpCircle, User, Users, Calendar, Heart, Search, Compass, Eye, Settings, Sliders, Bell, CreditCard, Info, LogOut, CalendarCheck, Wallet, MessageCircle, Home, History as HistoryIcon, Gift } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import { getSafeDisplayName } from "@/lib/name";
import { toStateCountryLabel } from "@/lib/location";
import {
  isAbortLikeError,
  isTransientRequestError,
  shouldSkipBackgroundRequest,
} from "@/lib/request-errors";
import {
  isRealtimeFailureStatus,
  noteRealtimeFailure,
  noteRealtimeSubscribed,
  removeRealtimeChannelSafely,
  shouldUseRealtime,
} from "@/lib/realtime-fallback";
import Image from "next/image";
import { useDashboardAccess } from "@/components/dashboard/DashboardAccessProvider";

type NextLinkProps = ComponentProps<typeof NextLink>;

function Link({ prefetch, ...props }: NextLinkProps) {
  return <NextLink {...props} prefetch={prefetch ?? false} />;
}

type SidebarProps = {
  active?: "home" | "profile" | "my-account" | "gender-preferences" | "preference" | "calendar" | "appointments" | "history" | "notifications" | "subscription" | "wallet" | "referrals" | "about" | "signout" | "edit" | "discover" | "likes" | "matches" | "search" | "messages";
};

type UserInfo = {
  name: string;
  age: number | null;
  location: string | null;
  photo: string | null;
};

export default function Sidebar({ active }: SidebarProps) {
  const { toast } = useToast();
  const { walletAccessEnabled } = useDashboardAccess();
  const router = useRouter();
  const pathname = usePathname();
  const [userInfo, setUserInfo] = useState<UserInfo>({
    name: "User",
    age: null,
    location: null,
    photo: null,
  });
  const [, setLoading] = useState(true);
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);
  const [isAppointmentsExpanded, setIsAppointmentsExpanded] = useState(false);
  const [isSubscriptionExpanded, setIsSubscriptionExpanded] = useState(false);
  // Unread notification count for the sidebar badge
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  // Unread message count for the messages badge
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  // Determine active state from pathname if not provided
  const getActiveState = (): SidebarProps["active"] => {
    if (active) return active;
    
    if (pathname?.includes("/profile/edit")) return "edit";
    if (pathname?.includes("/profile/gender-preferences")) return "gender-preferences";
    if (pathname?.includes("/profile/my-account")) return "my-account";
    if (pathname?.includes("/profile/preferences")) return "preference";
    if (pathname?.includes("/profile/preferences/view")) return "preference";
    if (pathname?.includes("/dashboard/notifications") || pathname?.includes("/profile/notifications")) return "notifications";
    if (pathname?.includes("/profile/subscription")) return "subscription";
    if (pathname?.includes("/profile/wallet") || pathname?.includes("/wallet")) return "wallet";
    if (pathname?.includes("/dashboard/referrals")) return "referrals";
    if (pathname?.includes("/profile")) return "profile";
    if (pathname?.includes("/calendar")) return "calendar";
    if (pathname?.includes("/dashboard/history")) return "history";
    if (pathname?.includes("/meetings")) return "appointments";
    if (pathname?.includes("/messages")) return "messages";
    if (pathname?.includes("/likes")) return "likes";
    if (pathname?.includes("/search")) return "search";
    if (pathname?.includes("/discover")) return "discover";
    if (pathname === "/dashboard") return "home";
    
    return undefined;
  };

  const currentActive = getActiveState();

  // Auto-expand profile section if user is on a profile-related page
  useEffect(() => {
    if (currentActive === "profile" || currentActive === "my-account" || currentActive === "gender-preferences" || currentActive === "preference" || currentActive === "edit") {
      setIsProfileExpanded(true);
    }
  }, [currentActive]);

  // Auto-expand appointments section if user is on appointments, calendar, or notifications page
  useEffect(() => {
    if (
      currentActive === "appointments" ||
      currentActive === "history" ||
      currentActive === "calendar" ||
      currentActive === "notifications"
    ) {
      setIsAppointmentsExpanded(true);
    }
  }, [currentActive]);

  // Auto-expand subscription section if user is on subscription or wallet page
  useEffect(() => {
    if (currentActive === "subscription" || currentActive === "wallet") {
      setIsSubscriptionExpanded(true);
    }
  }, [currentActive]);

  // Fetch user information
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateViewport = () => setIsDesktopViewport(mediaQuery.matches);
    updateViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateViewport);
      return () => mediaQuery.removeEventListener("change", updateViewport);
    }

    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (!user) {
          setLoading(false);
          return;
        }

        // Fetch user profile data
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("first_name, date_of_birth, location, photos, profile_photo_url")
          .eq("user_id", user.id)
          .maybeSingle();

        // Fetch account data for display name
        const { data: account } = await supabase
          .from("accounts")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();

        // Calculate age from date_of_birth
        let age: number | null = null;
        if (profile?.date_of_birth) {
          const birthDate = new Date(profile.date_of_birth);
          const today = new Date();
          let calculatedAge = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            calculatedAge--;
          }
          age = calculatedAge;
        }

        // Get primary photo
        const primaryPhoto = profile?.photos && profile.photos.length > 0
          ? profile.photos[0]
          : profile?.profile_photo_url || null;

        setUserInfo({
          name: getSafeDisplayName(
            profile?.first_name,
            account?.display_name || user.email?.split("@")[0] || null
          ),
          age,
          location: profile?.location || null,
          photo: primaryPhoto,
        });
      } catch (error) {
        console.error("Error fetching user info:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserInfo();
  }, []);

  // Fetch unread notification count and subscribe to real-time updates
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isMounted = true;
    let disposed = false;

    const fetchUnreadCount = async () => {
      if (shouldSkipBackgroundRequest()) {
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch("/api/notifications?summary=true&unread_only=true", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const unread = typeof data?.unread_count === "number" ? data.unread_count : 0;
        if (isMounted) {
          setUnreadNotifCount(unread);
        }
      } catch (err) {
        if (isTransientRequestError(err)) {
          return;
        }
        console.error("Error fetching unread count:", err);
      }
    };

    const setupRealtime = async () => {
      if (!shouldUseRealtime()) {
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user || disposed) return;

      channel = supabase
        .channel("sidebar-notif-count")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchUnreadCount();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchUnreadCount();
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            noteRealtimeSubscribed();
            return;
          }

          if (isRealtimeFailureStatus(status) && noteRealtimeFailure(status)) {
            removeRealtimeChannelSafely(supabase, channel);
          }
        });
    };

    fetchUnreadCount();
    setupRealtime();

    // Poll every 60 seconds as a fallback.
    const interval = setInterval(fetchUnreadCount, 60000);

    return () => {
      disposed = true;
      isMounted = false;
      clearInterval(interval);
      removeRealtimeChannelSafely(supabase, channel);
    };
  }, []);

  // Fetch unread message count
  useEffect(() => {
    if (!isDesktopViewport || pathname?.startsWith("/dashboard/messages")) {
      return;
    }

    let isMounted = true;
    let currentController: AbortController | null = null;

    const fetchUnreadMsgCount = async () => {
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

        if (res.ok && isMounted) {
          const data = await res.json();
          setUnreadMsgCount(data.total_unread || 0);
        }
      } catch (error) {
        if (isAbortLikeError(error) || isTransientRequestError(error)) {
          return;
        }
      }
    };

    fetchUnreadMsgCount();

    // Poll every 60 seconds as a fallback to realtime updates.
    const interval = setInterval(fetchUnreadMsgCount, 60000);

    // Real-time subscription for new messages
    let msgChannel: ReturnType<typeof supabase.channel> | null = null;
    let disposed = false;

    const setupMsgRealtime = async () => {
      if (!shouldUseRealtime()) {
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user || disposed) return;

      msgChannel = supabase
        .channel("sidebar-msg-count")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          () => fetchUnreadMsgCount()
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            noteRealtimeSubscribed();
            return;
          }

          if (isRealtimeFailureStatus(status) && noteRealtimeFailure(status)) {
            removeRealtimeChannelSafely(supabase, msgChannel);
          }
        });
    };

    setupMsgRealtime();

    return () => {
      disposed = true;
      isMounted = false;
      currentController?.abort();
      clearInterval(interval);
      removeRealtimeChannelSafely(supabase, msgChannel);
    };
  }, [isDesktopViewport, pathname]);

  const itemClass = (key: SidebarProps["active"]) =>
    `flex items-center justify-between rounded-xl px-3 py-2 transition-colors ${
      currentActive === key 
        ? "bg-[#eef2ff] text-[#1f419a]" 
        : "text-gray-700 hover:bg-gray-50"
    }`;

  const handleSignOut = async () => {
    try {
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error("Error signing out:", error);
        toast.error("Failed to sign out. Please try again.");
        return;
      }
      
      // Clear any form drafts from localStorage
      try {
        localStorage.removeItem("form_draft_profile_edit");
        localStorage.removeItem("form_draft_preferences_edit");
      } catch {
        // Ignore localStorage errors
      }
      
      // Redirect to login page
      router.push("/login");
    } catch (error) {
      console.error("Error during sign out:", error);
      toast.error("An error occurred while signing out. Please try again.");
    }
  };

  // Build location string
  const safeLocation = toStateCountryLabel(userInfo.location);
  const locationString = safeLocation
    ? userInfo.age 
      ? `Age ${userInfo.age}, ${safeLocation}`
      : safeLocation
    : userInfo.age
    ? `Age ${userInfo.age}`
    : "";

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 lg:sticky lg:top-20 lg:h-[calc(100dvh-5.5rem)]">
      {/* User Info Section */}
      <div className="flex items-center gap-3 rounded-xl bg-[#eef2ff] px-3 py-2 text-[#1f419a]">
        {userInfo.photo ? (
          <div className="relative h-9 w-9 rounded-full overflow-hidden ring-2 ring-[#1f419a] flex-shrink-0">
            <Image
              src={userInfo.photo}
              alt={userInfo.name}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          <div className="h-9 w-9 rounded-full bg-white shadow ring-2 ring-[#1f419a] flex items-center justify-center flex-shrink-0">
            <User className="h-4 w-4 text-[#1f419a]"/>
          </div>
        )}
        <div className="text-sm min-w-0 flex-1">
          <div className="font-medium text-gray-900 truncate">{userInfo.name}</div>
          {locationString && (
            <div className="text-gray-600 truncate">{locationString}</div>
          )}
        </div>
      </div>

      {/* Main Navigation */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 text-sm [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
        <div className="space-y-2">
        <Link href="/dashboard" className={itemClass("home")}>
          <span className="flex items-center gap-2">
            <Home className="h-4 w-4" />
            Home
          </span>
          <ChevronRight className={`h-4 w-4 ${currentActive === "home" ? "text-[#1f419a]" : "text-gray-400"}`}/>
        </Link>

        <Link href="/dashboard/discover" className={itemClass("discover")}>
          <span className="flex items-center gap-2">
            <Compass className="h-4 w-4" />
            Discover
          </span>
          <ChevronRight className={`h-4 w-4 ${currentActive === "discover" ? "text-[#1f419a]" : "text-gray-400"}`}/>
        </Link>
        
        <Link href="/dashboard/likes" className={itemClass("likes")}>
          <span className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Likes
          </span>
          <ChevronRight className={`h-4 w-4 ${currentActive === "likes" ? "text-[#1f419a]" : "text-gray-400"}`}/>
        </Link>

        <Link href="/dashboard/matches" className={itemClass("matches")}>
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Matches
          </span>
          <ChevronRight className={`h-4 w-4 ${currentActive === "matches" ? "text-[#1f419a]" : "text-gray-400"}`}/>
        </Link>
        
        <Link href="/dashboard/search" className={itemClass("search")}>
          <span className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search
          </span>
          <ChevronRight className={`h-4 w-4 ${currentActive === "search" ? "text-[#1f419a]" : "text-gray-400"}`}/>
        </Link>

        <Link href="/dashboard/messages" className={itemClass("messages")}>
          <span className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Messages
            {unreadMsgCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#1f419a] text-white">
                {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
              </span>
            )}
          </span>
          <ChevronRight className={`h-4 w-4 ${currentActive === "messages" ? "text-[#1f419a]" : "text-gray-400"}`}/>
        </Link>

        <Link href="/dashboard/referrals" className={itemClass("referrals")}>
          <span className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Invite & Earn
          </span>
          <ChevronRight className={`h-4 w-4 ${currentActive === "referrals" ? "text-[#1f419a]" : "text-gray-400"}`}/>
        </Link>

        {/* Divider */}
        <div className="my-2 border-t border-gray-100"></div>

        {/* Profile Section - Collapsible */}
        <div className={isProfileExpanded ? "rounded-xl bg-[#1f419a] p-1 shadow-inner ring-1 ring-white/15" : ""}>
          <button
            onClick={() => {
              if (!isProfileExpanded) {
                setIsAppointmentsExpanded(false);
                setIsSubscriptionExpanded(false);
              }
              setIsProfileExpanded(!isProfileExpanded);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 transition-all duration-300 ease-in-out ${
              isProfileExpanded
                ? "rounded-lg bg-[#1f419a] text-white" 
                : `rounded-xl ${
                    currentActive === "profile" || currentActive === "my-account" || currentActive === "gender-preferences" || currentActive === "preference" || currentActive === "edit"
                      ? "bg-[#eef2ff] text-[#1f419a]" 
                      : "text-gray-700 hover:bg-gray-50"
                  }`
            }`}
            type="button"
          >
            <span className="flex items-center gap-2">
              <User className="h-4 w-4" />
              My profile
            </span>
            <ChevronDown 
              className={`h-4 w-4 transition-all duration-300 ${
                isProfileExpanded ? "rotate-180 text-white" : "rotate-0"
              } ${!isProfileExpanded && (currentActive === "profile" || currentActive === "my-account" || currentActive === "gender-preferences" || currentActive === "preference" || currentActive === "edit") ? "text-[#1f419a]" : !isProfileExpanded ? "text-gray-400" : ""}`}
            />
          </button>
          
          {/* Collapsible Content */}
          <div 
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isProfileExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="space-y-1 px-1 pb-1 pt-1">
              <Link 
                href="/dashboard/profile" 
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                  currentActive === "profile"
                    ? isProfileExpanded 
                      ? "bg-white/10 text-white hover:bg-white/20" 
                      : "bg-[#eef2ff] text-[#1f419a]" 
                    : isProfileExpanded
                    ? "text-white/90 hover:bg-white/10"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  View Profile
                </span>
                <ChevronRight className={`h-3 w-3 ${currentActive === "profile" && !isProfileExpanded ? "text-[#1f419a]" : isProfileExpanded ? "text-white/80" : "text-gray-400"}`}/>
              </Link>
              
              <Link 
                href="/dashboard/profile/my-account" 
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                  currentActive === "my-account"
                    ? isProfileExpanded 
                      ? "bg-white/10 text-white hover:bg-white/20" 
                      : "bg-[#eef2ff] text-[#1f419a]" 
                    : isProfileExpanded
                    ? "text-white/90 hover:bg-white/10"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5" />
                  My account
                </span>
                <ChevronRight className={`h-3 w-3 ${currentActive === "my-account" && !isProfileExpanded ? "text-[#1f419a]" : isProfileExpanded ? "text-white/80" : "text-gray-400"}`}/>
              </Link>

              <Link
                href="/dashboard/profile/gender-preferences"
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                  currentActive === "gender-preferences"
                    ? isProfileExpanded
                      ? "bg-white/10 text-white hover:bg-white/20"
                      : "bg-[#eef2ff] text-[#1f419a]"
                    : isProfileExpanded
                    ? "text-white/90 hover:bg-white/10"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  Gender & Preferences
                </span>
                <ChevronRight className={`h-3 w-3 ${currentActive === "gender-preferences" && !isProfileExpanded ? "text-[#1f419a]" : isProfileExpanded ? "text-white/80" : "text-gray-400"}`}/>
              </Link>
              
              <Link 
                href="/dashboard/profile/preferences/view" 
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                  currentActive === "preference"
                    ? isProfileExpanded 
                      ? "bg-white/10 text-white hover:bg-white/20" 
                      : "bg-[#eef2ff] text-[#1f419a]" 
                    : isProfileExpanded
                    ? "text-white/90 hover:bg-white/10"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Sliders className="h-3.5 w-3.5" />
                  My preference
                </span>
                <ChevronRight className={`h-3 w-3 ${currentActive === "preference" && !isProfileExpanded ? "text-[#1f419a]" : isProfileExpanded ? "text-white/80" : "text-gray-400"}`}/>
              </Link>
            </div>
          </div>
        </div>
        
        {/* Appointments Section - Collapsible */}
        <div className={isAppointmentsExpanded ? "rounded-xl bg-[#1f419a] p-1 shadow-inner ring-1 ring-white/15" : ""}>
          <button
            onClick={() => {
              if (!isAppointmentsExpanded) {
                setIsProfileExpanded(false);
                setIsSubscriptionExpanded(false);
              }
              setIsAppointmentsExpanded(!isAppointmentsExpanded);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 transition-all duration-300 ease-in-out ${
              isAppointmentsExpanded
                ? "rounded-lg bg-[#1f419a] text-white" 
                : `rounded-xl ${
                    currentActive === "appointments" || currentActive === "history" || currentActive === "calendar" || currentActive === "notifications"
                      ? "bg-[#eef2ff] text-[#1f419a]" 
                      : "text-gray-700 hover:bg-gray-50"
                  }`
            }`}
            type="button"
          >
            <span className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4" />
              My appointments
            </span>
            <ChevronDown 
              className={`h-4 w-4 transition-all duration-300 ${
                isAppointmentsExpanded ? "rotate-180 text-white" : "rotate-0"
              } ${!isAppointmentsExpanded && (currentActive === "appointments" || currentActive === "history" || currentActive === "calendar" || currentActive === "notifications") ? "text-[#1f419a]" : !isAppointmentsExpanded ? "text-gray-400" : ""}`}
            />
          </button>
          
          {/* Collapsible Content */}
          <div 
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isAppointmentsExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="space-y-1 px-1 pb-1 pt-1">
              <Link 
                href="/dashboard/calendar" 
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                  currentActive === "calendar"
                    ? isAppointmentsExpanded 
                      ? "bg-white/10 text-white hover:bg-white/20" 
                      : "bg-[#eef2ff] text-[#1f419a]" 
                    : isAppointmentsExpanded
                    ? "text-white/90 hover:bg-white/10"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  My Calendar
                </span>
                <ChevronRight className={`h-3 w-3 ${currentActive === "calendar" && !isAppointmentsExpanded ? "text-[#1f419a]" : isAppointmentsExpanded ? "text-white/80" : "text-gray-400"}`}/>
              </Link>
              
              <Link 
                href="/dashboard/meetings" 
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                  currentActive === "appointments"
                    ? isAppointmentsExpanded 
                      ? "bg-white/10 text-white hover:bg-white/20" 
                      : "bg-[#eef2ff] text-[#1f419a]" 
                    : isAppointmentsExpanded
                    ? "text-white/90 hover:bg-white/10"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <CalendarCheck className="h-3.5 w-3.5" />
                  Appointments
                </span>
                <ChevronRight className={`h-3 w-3 ${currentActive === "appointments" && !isAppointmentsExpanded ? "text-[#1f419a]" : isAppointmentsExpanded ? "text-white/80" : "text-gray-400"}`}/>
              </Link>

              <Link
                href="/dashboard/history"
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                  currentActive === "history"
                    ? isAppointmentsExpanded
                      ? "bg-white/10 text-white hover:bg-white/20"
                      : "bg-[#eef2ff] text-[#1f419a]"
                    : isAppointmentsExpanded
                    ? "text-white/90 hover:bg-white/10"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <HistoryIcon className="h-3.5 w-3.5" />
                  History
                </span>
                <ChevronRight className={`h-3 w-3 ${currentActive === "history" && !isAppointmentsExpanded ? "text-[#1f419a]" : isAppointmentsExpanded ? "text-white/80" : "text-gray-400"}`}/>
              </Link>
              
              <Link 
                href="/dashboard/notifications" 
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                  currentActive === "notifications"
                    ? isAppointmentsExpanded 
                      ? "bg-white/10 text-white hover:bg-white/20" 
                      : "bg-[#eef2ff] text-[#1f419a]" 
                    : isAppointmentsExpanded
                    ? "text-white/90 hover:bg-white/10"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5" />
                  Notifications
                  {unreadNotifCount > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isAppointmentsExpanded
                        ? "bg-white text-[#1f419a]"
                        : "bg-red-500 text-white"
                    }`}>
                      {unreadNotifCount > 99 ? "99+" : unreadNotifCount}
                    </span>
                  )}
                </span>
                <ChevronRight className={`h-3 w-3 ${currentActive === "notifications" && !isAppointmentsExpanded ? "text-[#1f419a]" : isAppointmentsExpanded ? "text-white/80" : "text-gray-400"}`}/>
              </Link>
            </div>
          </div>
        </div>
        
        {/* Subscription Section - Collapsible */}
        <div className={isSubscriptionExpanded ? "rounded-xl bg-[#1f419a] p-1 shadow-inner ring-1 ring-white/15" : ""}>
          <button
            onClick={() => {
              if (!isSubscriptionExpanded) {
                setIsProfileExpanded(false);
                setIsAppointmentsExpanded(false);
              }
              setIsSubscriptionExpanded(!isSubscriptionExpanded);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 transition-all duration-300 ease-in-out ${
              isSubscriptionExpanded
                ? "rounded-lg bg-[#1f419a] text-white" 
                : `rounded-xl ${
                    currentActive === "subscription" || currentActive === "wallet"
                      ? "bg-[#eef2ff] text-[#1f419a]" 
                      : "text-gray-700 hover:bg-gray-50"
                  }`
            }`}
            type="button"
          >
            <span className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              My subscription
            </span>
            <ChevronDown 
              className={`h-4 w-4 transition-all duration-300 ${
                isSubscriptionExpanded ? "rotate-180 text-white" : "rotate-0"
              } ${!isSubscriptionExpanded && (currentActive === "subscription" || currentActive === "wallet") ? "text-[#1f419a]" : !isSubscriptionExpanded ? "text-gray-400" : ""}`}
            />
          </button>
          
          {/* Collapsible Content */}
          <div 
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isSubscriptionExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="space-y-1 px-1 pb-1 pt-1">
              <Link 
                href="/dashboard/profile/subscription" 
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                  currentActive === "subscription"
                    ? isSubscriptionExpanded 
                      ? "bg-white/10 text-white hover:bg-white/20" 
                      : "bg-[#eef2ff] text-[#1f419a]" 
                    : isSubscriptionExpanded
                    ? "text-white/90 hover:bg-white/10"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="h-3.5 w-3.5" />
                  Subscription
                </span>
                <ChevronRight className={`h-3 w-3 ${currentActive === "subscription" && !isSubscriptionExpanded ? "text-[#1f419a]" : isSubscriptionExpanded ? "text-white/80" : "text-gray-400"}`}/>
              </Link>
              
              {walletAccessEnabled && (
                <Link 
                  href="/dashboard/wallet" 
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                    currentActive === "wallet"
                      ? isSubscriptionExpanded 
                        ? "bg-white/10 text-white hover:bg-white/20"
                        : "bg-[#eef2ff] text-[#1f419a]"
                      : isSubscriptionExpanded
                      ? "text-white/90 hover:bg-white/10"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5" />
                    My wallet
                  </span>
                  <ChevronRight className={`h-3 w-3 ${currentActive === "wallet" && !isSubscriptionExpanded ? "text-[#1f419a]" : isSubscriptionExpanded ? "text-white/80" : "text-gray-400"}`}/>
                </Link>
              )}
            </div>
          </div>
        </div>
        
        <Link href="#" className={itemClass("about")}>
          <span className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            About
          </span>
          <ChevronRight className="h-4 w-4 text-gray-400"/>
        </Link>
        
        <button 
          onClick={handleSignOut}
          className={`w-full ${itemClass("signout")} cursor-pointer text-left`}
          type="button"
        >
          <span className="flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            Sign out
          </span>
          <ChevronRight className="h-4 w-4 text-gray-400"/>
        </button>
        </div>
      </div>

      {/* Help Section */}
      <Link
        href="/contact-us"
        className="mt-3 shrink-0 rounded-xl bg-white shadow ring-1 ring-black/5 p-3 text-sm text-[#1f419a] flex items-center justify-between transition hover:bg-[#f8faff]"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow ring-2 ring-[#1f419a]">
            <HelpCircle className="h-4 w-4 text-[#1f419a]"/>
          </span>
          <div>
            <div className="font-medium">Online Help</div>
            <div className="text-xs text-gray-600">Contact support anytime</div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4"/>
      </Link>
    </aside>
  );
}
