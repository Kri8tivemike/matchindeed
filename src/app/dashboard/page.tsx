"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Compass, Search, Heart, MessageCircle, Calendar, Video,
  Users, CreditCard, TrendingUp, Loader2, ChevronRight,
  Bell, Wallet, Star, User
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";
import { supabase } from "@/lib/supabase";

/** Time-based greeting helper */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "time ago" helper */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/** Activity type to emoji+label */
function activityLabel(type: string): { emoji: string; label: string } {
  switch (type) {
    case "wink": return { emoji: "😉", label: "winked at you" };
    case "like": return { emoji: "❤️", label: "liked you" };
    case "interested": return { emoji: "💬", label: "is interested in you" };
    default: return { emoji: "👋", label: "interacted with you" };
  }
}

type DashboardStats = {
  matches: number;
  unreadMessages: number;
  upcomingMeetings: number;
  credits: number;
  walletBalance: number;
  profileViews: number;
  totalLikes: number;
};

type RecentActivity = {
  id: string;
  user_id: string;
  user_name: string;
  user_photo: string | null;
  activity_type: string;
  created_at: string;
};

type UpcomingMeeting = {
  id: string;
  title: string;
  scheduled_at: string;
  status: string;
  partner_name: string;
  partner_photo: string | null;
};

export default function DashboardHomePage() {
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("User");
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    matches: 0,
    unreadMessages: 0,
    upcomingMeetings: 0,
    credits: 0,
    walletBalance: 0,
    profileViews: 0,
    totalLikes: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<UpcomingMeeting[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch user profile
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("first_name, profile_photo_url, photos")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profile) {
          setUserName(profile.first_name || "User");
          const photo = (profile.photos && profile.photos.length > 0)
            ? profile.photos[0]
            : profile.profile_photo_url;
          setUserPhoto(photo || null);
        }

        // Fetch stats in parallel
        const [
          matchesRes,
          messagesRes,
          meetingsRes,
          creditsRes,
          walletRes,
          likesRes,
        ] = await Promise.all([
          // Mutual matches count
          supabase
            .from("user_matches")
            .select("id", { count: "exact", head: true })
            .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`),
          // Unread messages count
          supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("receiver_id", user.id)
            .is("read_at", null),
          // Upcoming meetings count
          supabase
            .from("meetings")
            .select("id", { count: "exact", head: true })
            .in("status", ["confirmed", "pending"])
            .gte("scheduled_at", new Date().toISOString()),
          // Credits
          supabase
            .from("credits")
            .select("total, used, rollover")
            .eq("user_id", user.id)
            .maybeSingle(),
          // Wallet
          supabase
            .from("wallets")
            .select("balance_cents")
            .eq("user_id", user.id)
            .maybeSingle(),
          // Total likes/winks/interested received
          supabase
            .from("user_activities")
            .select("id", { count: "exact", head: true })
            .eq("target_user_id", user.id)
            .in("activity_type", ["like", "wink", "interested"]),
        ]);

        // Compute available credits safely
        const creditsData = creditsRes.data as { total?: number; used?: number; rollover?: number } | null;
        const availableCredits = creditsData
          ? (creditsData.total || 0) - (creditsData.used || 0) + (creditsData.rollover || 0)
          : 0;

        setStats({
          matches: (matchesRes as any)?.count || 0,
          unreadMessages: (messagesRes as any)?.count || 0,
          upcomingMeetings: (meetingsRes as any)?.count || 0,
          credits: availableCredits,
          walletBalance: (walletRes.data as any)?.balance_cents ? (walletRes.data as any).balance_cents / 100 : 0,
          profileViews: 0, // placeholder for future feature
          totalLikes: (likesRes as any)?.count || 0,
        });

        // Fetch recent activity (last 5 interactions received)
        const { data: activityData } = await supabase
          .from("user_activities")
          .select("id, user_id, activity_type, created_at")
          .eq("target_user_id", user.id)
          .in("activity_type", ["like", "wink", "interested"])
          .order("created_at", { ascending: false })
          .limit(5);

        if (activityData && activityData.length > 0) {
          // Get names for activity users
          const activityUserIds = [...new Set(activityData.map((a: any) => a.user_id))];
          const { data: activityProfiles } = await supabase
            .from("user_profiles")
            .select("user_id, first_name, profile_photo_url, photos")
            .in("user_id", activityUserIds);

          const profileMap = new Map(
            (activityProfiles || []).map((p: any) => [p.user_id, p])
          );

          setRecentActivity(
            activityData.map((a: any) => {
              const p = profileMap.get(a.user_id);
              return {
                id: a.id,
                user_id: a.user_id,
                user_name: p?.first_name || "Someone",
                user_photo: (p?.photos && p.photos.length > 0) ? p.photos[0] : p?.profile_photo_url || null,
                activity_type: a.activity_type,
                created_at: a.created_at,
              };
            })
          );
        }

        // Fetch upcoming meetings (next 3)
        const { data: meetingData } = await supabase
          .from("meetings")
          .select(`
            id, scheduled_at, status,
            meeting_participants(user_id)
          `)
          .in("status", ["confirmed", "pending"])
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(3);

        if (meetingData && meetingData.length > 0) {
          // Find partner info for each meeting
          const partnerIds = meetingData.flatMap((m: any) =>
            (m.meeting_participants || [])
              .map((p: any) => p.user_id)
              .filter((uid: string) => uid !== user.id)
          );

          const { data: partnerProfiles } = await supabase
            .from("user_profiles")
            .select("user_id, first_name, profile_photo_url, photos")
            .in("user_id", partnerIds);

          const partnerMap = new Map(
            (partnerProfiles || []).map((p: any) => [p.user_id, p])
          );

          setUpcomingMeetings(
            meetingData.map((m: any) => {
              const partnerId = (m.meeting_participants || [])
                .map((p: any) => p.user_id)
                .find((uid: string) => uid !== user.id);
              const partner = partnerId ? partnerMap.get(partnerId) : null;
              return {
                id: m.id,
                title: "Video Meeting",
                scheduled_at: m.scheduled_at,
                status: m.status,
                partner_name: partner?.first_name || "Someone",
                partner_photo: (partner?.photos && partner.photos.length > 0) ? partner.photos[0] : partner?.profile_photo_url || null,
              };
            })
          );
        }
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  /** Quick action shortcut items */
  const quickActions = [
    { href: "/dashboard/discover", icon: Compass, label: "Discover", color: "bg-blue-50 text-blue-600", desc: "Find new matches" },
    { href: "/dashboard/search", icon: Search, label: "Search", color: "bg-purple-50 text-purple-600", desc: "Advanced search" },
    { href: "/dashboard/matches", icon: Users, label: "Matches", color: "bg-pink-50 text-pink-600", desc: "Your matches" },
    { href: "/dashboard/messages", icon: MessageCircle, label: "Messages", color: "bg-green-50 text-green-600", desc: "Chat with matches" },
    { href: "/dashboard/calendar", icon: Calendar, label: "Calendar", color: "bg-orange-50 text-orange-600", desc: "Manage availability" },
    { href: "/dashboard/meetings", icon: Video, label: "Meetings", color: "bg-indigo-50 text-indigo-600", desc: "Video meetings" },
    { href: "/dashboard/likes", icon: Heart, label: "Likes", color: "bg-red-50 text-red-600", desc: "Who likes you" },
    { href: "/dashboard/notifications", icon: Bell, label: "Notifications", color: "bg-amber-50 text-amber-600", desc: "Stay updated" },
  ];

  return (
    <div className="min-h-screen w-full bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/matchindeed.svg" alt="Matchindeed" width={140} height={36} style={{ width: "auto", height: "auto" }} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 flex-shrink-0 space-y-4">
          <Sidebar active="home" />
          <ProfileCompletenessCard variant="compact" />
        </aside>

        {/* Main Content */}
        <section className="min-w-0 flex-1 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
            </div>
          ) : (
            <>
              {/* Welcome Banner */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] p-6 text-white shadow-lg">
                <div className="absolute right-0 top-0 h-full w-1/3 opacity-10">
                  <svg viewBox="0 0 200 200" className="h-full w-full">
                    <circle cx="100" cy="100" r="80" fill="white" />
                    <circle cx="160" cy="60" r="40" fill="white" />
                    <circle cx="50" cy="160" r="30" fill="white" />
                  </svg>
                </div>
                <div className="relative flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white/20 ring-2 ring-white/40 flex-shrink-0">
                    {userPhoto ? (
                      <Image
                        src={userPhoto}
                        alt="Profile"
                        width={56}
                        height={56}
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-profile.svg"; }}
                      />
                    ) : (
                      <User className="h-7 w-7 text-white/70" />
                    )}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">{getGreeting()}, {userName}!</h1>
                    <p className="mt-1 text-sm text-white/80">
                      {stats.totalLikes > 0
                        ? `You have ${stats.totalLikes} like${stats.totalLikes !== 1 ? "s" : ""} — go check them out!`
                        : "Ready to find your match today?"
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Link href="/dashboard/matches" className="group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-pink-600 group-hover:bg-pink-100 transition-colors">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{stats.matches}</div>
                      <div className="text-xs text-gray-500">Matches</div>
                    </div>
                  </div>
                </Link>

                <Link href="/dashboard/messages" className="group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600 group-hover:bg-green-100 transition-colors">
                      <MessageCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">
                        {stats.unreadMessages}
                        {stats.unreadMessages > 0 && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-green-500"></span>}
                      </div>
                      <div className="text-xs text-gray-500">Unread</div>
                    </div>
                  </div>
                </Link>

                <Link href="/dashboard/meetings" className="group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
                      <Video className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{stats.upcomingMeetings}</div>
                      <div className="text-xs text-gray-500">Meetings</div>
                    </div>
                  </div>
                </Link>

                <Link href="/dashboard/profile/wallet" className="group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{stats.credits}</div>
                      <div className="text-xs text-gray-500">Credits</div>
                    </div>
                  </div>
                </Link>
              </div>

              {/* Two-column layout: Activity + Meetings */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

                {/* Recent Activity */}
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-[#1f419a]" />
                      Recent Activity
                    </h2>
                    <Link href="/dashboard/likes" className="text-xs text-[#1f419a] hover:underline">View all</Link>
                  </div>
                  {recentActivity.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Heart className="h-10 w-10 text-gray-200 mb-3" />
                      <p className="text-sm text-gray-500">No recent activity yet</p>
                      <p className="text-xs text-gray-400 mt-1">Complete your profile to attract more interest!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recentActivity.map((activity) => {
                        const { emoji, label } = activityLabel(activity.activity_type);
                        return (
                          <div key={activity.id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-gray-50 transition-colors">
                            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gray-100 flex-shrink-0">
                              {activity.user_photo ? (
                                <Image
                                  src={activity.user_photo}
                                  alt={activity.user_name}
                                  width={40}
                                  height={40}
                                  className="h-full w-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-profile.svg"; }}
                                />
                              ) : (
                                <User className="h-5 w-5 text-gray-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 truncate">
                                <span className="font-medium">{activity.user_name}</span>{" "}
                                <span className="text-gray-500">{label}</span>{" "}
                                <span>{emoji}</span>
                              </p>
                              <p className="text-xs text-gray-400">{timeAgo(activity.created_at)}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Upcoming Meetings */}
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-[#1f419a]" />
                      Upcoming Meetings
                    </h2>
                    <Link href="/dashboard/meetings" className="text-xs text-[#1f419a] hover:underline">View all</Link>
                  </div>
                  {upcomingMeetings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Video className="h-10 w-10 text-gray-200 mb-3" />
                      <p className="text-sm text-gray-500">No upcoming meetings</p>
                      <p className="text-xs text-gray-400 mt-1">Request a video meeting from someone you like!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {upcomingMeetings.map((meeting) => (
                        <Link
                          key={meeting.id}
                          href="/dashboard/meetings"
                          className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gray-100 flex-shrink-0">
                            {meeting.partner_photo ? (
                              <Image
                                src={meeting.partner_photo}
                                alt={meeting.partner_name}
                                width={40}
                                height={40}
                                className="h-full w-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-profile.svg"; }}
                              />
                            ) : (
                              <User className="h-5 w-5 text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {meeting.title} with {meeting.partner_name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(meeting.scheduled_at).toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                              {" at "}
                              {new Date(meeting.scheduled_at).toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            meeting.status === "confirmed"
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {meeting.status === "confirmed" ? "Confirmed" : "Pending"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Actions Grid */}
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Star className="h-5 w-5 text-[#1f419a]" />
                  Quick Actions
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {quickActions.map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="group flex flex-col items-center gap-2 rounded-xl border border-gray-100 p-4 hover:border-[#1f419a]/30 hover:bg-[#1f419a]/5 transition-all"
                    >
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.color} group-hover:scale-110 transition-transform`}>
                        <action.icon className="h-5 w-5" />
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-medium text-gray-900">{action.label}</div>
                        <div className="text-[10px] text-gray-500">{action.desc}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Wallet Summary */}
              {(stats.credits > 0 || stats.walletBalance > 0) && (
                <Link href="/dashboard/profile/wallet" className="block rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm ring-1 ring-amber-200/50 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                        <Wallet className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">Your Balance</div>
                        <div className="text-xs text-gray-500">Credits & wallet</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">{stats.credits} credits</div>
                      {stats.walletBalance > 0 && (
                        <div className="text-xs text-gray-500">${(stats.walletBalance / 100).toFixed(2)} wallet</div>
                      )}
                    </div>
                  </div>
                </Link>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
