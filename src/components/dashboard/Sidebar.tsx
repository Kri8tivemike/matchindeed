"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown, HelpCircle, User, Users, Calendar, Heart, Search, Compass, Eye, Settings, Sliders, Bell, CreditCard, Info, LogOut, CalendarCheck, Wallet, MessageCircle, Home } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import Image from "next/image";

type SidebarProps = {
  active?: "home" | "profile" | "my-account" | "preference" | "calendar" | "appointments" | "notifications" | "subscription" | "wallet" | "about" | "signout" | "edit" | "discover" | "likes" | "matches" | "search" | "messages";
};

type UserInfo = {
  name: string;
  age: number | null;
  location: string | null;
  photo: string | null;
};

export default function Sidebar({ active }: SidebarProps) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [userInfo, setUserInfo] = useState<UserInfo>({
    name: "User",
    age: null,
    location: null,
    photo: null,
  });
  const [loading, setLoading] = useState(true);
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);
  const [isAppointmentsExpanded, setIsAppointmentsExpanded] = useState(false);
  const [isSubscriptionExpanded, setIsSubscriptionExpanded] = useState(false);
  // Unread notification count for the sidebar badge
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  // Unread message count for the messages badge
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  // Determine active state from pathname if not provided
  const getActiveState = (): SidebarProps["active"] => {
    if (active) return active;
    
    if (pathname?.includes("/profile/edit")) return "edit";
    if (pathname?.includes("/profile/my-account")) return "my-account";
    if (pathname?.includes("/profile/preferences")) return "preference";
    if (pathname?.includes("/profile/preferences/view")) return "preference";
    if (pathname?.includes("/dashboard/notifications") || pathname?.includes("/profile/notifications")) return "notifications";
    if (pathname?.includes("/profile/subscription")) return "subscription";
    if (pathname?.includes("/profile/wallet") || pathname?.includes("/wallet")) return "wallet";
    if (pathname?.includes("/profile")) return "profile";
    if (pathname?.includes("/calendar")) return "calendar";
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
    if (currentActive === "profile" || currentActive === "my-account" || currentActive === "preference" || currentActive === "edit") {
      setIsProfileExpanded(true);
    }
  }, [currentActive]);

  // Auto-expand appointments section if user is on appointments, calendar, or notifications page
  useEffect(() => {
    if (currentActive === "appointments" || currentActive === "calendar" || currentActive === "notifications") {
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
    const fetchUserInfo = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
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
          name: profile?.first_name || account?.display_name || user.email?.split("@")[0] || "User",
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

    const fetchUnreadCount = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Try with read_at column, fall back to total count
        let unread = 0;
        const { count, error: countError } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null);

        if (countError) {
          // If read_at doesn't exist, count all notifications
          const { count: totalCount } = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id);
          unread = totalCount || 0;
        } else {
          unread = count || 0;
        }

        setUnreadNotifCount(unread);

        // Subscribe to new notifications for real-time badge updates
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
              setUnreadNotifCount((prev) => prev + 1);
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
              // Refetch count when a notification is updated (marked as read)
              fetchUnreadCount();
            }
          )
          .subscribe();
      } catch (err) {
        console.error("Error fetching unread count:", err);
      }
    };

    fetchUnreadCount();

    // Also poll every 60 seconds as a fallback
    const interval = setInterval(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { count, error: pollError } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null);
        if (!pollError) {
          setUnreadNotifCount(count || 0);
        } else {
          // If read_at column doesn't exist, try without it
          const { count: totalCount } = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id);
          setUnreadNotifCount(totalCount || 0);
        }
      } catch {
        // Silent fail
      }
    }, 60000);

    return () => {
      clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Fetch unread message count
  useEffect(() => {
    const fetchUnreadMsgCount = async () => {
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

    fetchUnreadMsgCount();

    // Poll every 30 seconds for new messages
    const interval = setInterval(fetchUnreadMsgCount, 30000);

    // Real-time subscription for new messages
    let msgChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupMsgRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      msgChannel = supabase
        .channel("sidebar-msg-count")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          () => fetchUnreadMsgCount()
        )
        .subscribe();
    };

    setupMsgRealtime();

    return () => {
      clearInterval(interval);
      if (msgChannel) supabase.removeChannel(msgChannel);
    };
  }, []);

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
      } catch (e) {
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
  const locationString = userInfo.location 
    ? userInfo.age 
      ? `Age ${userInfo.age}, ${userInfo.location}`
      : userInfo.location
    : userInfo.age
    ? `Age ${userInfo.age}`
    : "";

  return (
    <aside className="flex h-full flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
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
      <div className="mt-3 space-y-2 text-sm">
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

        {/* Divider */}
        <div className="my-2 border-t border-gray-100"></div>

        {/* Profile Section - Collapsible */}
        <div className={isProfileExpanded ? "-mx-4" : ""}>
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
                ? "bg-[#1f419a] text-white" 
                : `rounded-xl ${
                    currentActive === "profile" || currentActive === "my-account" || currentActive === "preference" || currentActive === "edit"
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
              } ${!isProfileExpanded && (currentActive === "profile" || currentActive === "my-account" || currentActive === "preference" || currentActive === "edit") ? "text-[#1f419a]" : !isProfileExpanded ? "text-gray-400" : ""}`}
            />
          </button>
          
          {/* Collapsible Content */}
          <div 
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isProfileExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className={`pl-2 pt-1 space-y-1 ${isProfileExpanded ? "bg-[#1f419a] pb-2" : ""}`}>
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
        <div className={isAppointmentsExpanded ? "-mx-4" : ""}>
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
                ? "bg-[#1f419a] text-white" 
                : `rounded-xl ${
                    currentActive === "appointments" || currentActive === "calendar" || currentActive === "notifications"
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
              } ${!isAppointmentsExpanded && (currentActive === "appointments" || currentActive === "calendar" || currentActive === "notifications") ? "text-[#1f419a]" : !isAppointmentsExpanded ? "text-gray-400" : ""}`}
            />
          </button>
          
          {/* Collapsible Content */}
          <div 
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isAppointmentsExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className={`pl-2 pt-1 space-y-1 ${isAppointmentsExpanded ? "bg-[#1f419a] pb-2" : ""}`}>
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
        <div className={isSubscriptionExpanded ? "-mx-4" : ""}>
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
                ? "bg-[#1f419a] text-white" 
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
            <div className={`pl-2 pt-1 space-y-1 ${isSubscriptionExpanded ? "bg-[#1f419a] pb-2" : ""}`}>
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
              
              <Link 
                href="/dashboard/profile/wallet" 
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

      {/* Help Section */}
      <div className="mt-auto rounded-xl bg-white shadow ring-1 ring-black/5 p-3 text-sm text-[#1f419a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow ring-2 ring-[#1f419a]">
            <HelpCircle className="h-4 w-4 text-[#1f419a]"/>
          </span>
          <div>
            <div className="font-medium">Online Help</div>
            <div className="text-xs text-gray-600">Get support anytime</div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4"/>
      </div>
    </aside>
  );
}
