"use client";

/**
 * NotificationsPage — MatchIndeed
 *
 * Full notification centre with:
 * - Standard dashboard layout (header, sidebar)
 * - Brand-consistent colours (#1f419a)
 * - Date-grouped sections (Today, Yesterday, This Week, Older)
 * - Filter tabs: All, Unread, Meetings, Activity, System
 * - Mark individual / all as read
 * - Delete read notifications
 * - "Load more" pagination
 * - Supabase real-time subscription for new notifications
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Heart,
  Video,
  ShieldAlert,
  CreditCard,
  Calendar,
  MessageCircle,
  Star,
  UserCheck,
  Loader2,
  ExternalLink,
  Filter,
  ChevronDown,
  Inbox,
  Cigarette,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, any> | null;
  read: boolean;
  read_at: string | null;
  created_at: string;
};

type FilterTab = "all" | "unread" | "meetings" | "activity" | "system";

// ---------------------------------------------------------------
// Helpers — icon / colour per type
// ---------------------------------------------------------------
function getNotificationStyle(type: string) {
  switch (type) {
    case "like":
    case "interested":
    case "wink":
      return { icon: <Heart className="h-5 w-5" />, bg: "bg-pink-50", text: "text-pink-600", ring: "ring-pink-100", label: "Activity" };
    case "mutual_match":
    case "match_created":
      return { icon: <Star className="h-5 w-5" />, bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100", label: "Match" };
    case "meeting_rules":
    case "meeting_reminder":
    case "meeting_finalized":
    case "meeting_response_submitted":
    case "meeting_responses_complete":
      return { icon: <Video className="h-5 w-5" />, bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-100", label: "Meeting" };
    case "meeting_pending_review":
    case "meeting_investigation":
      return { icon: <ShieldAlert className="h-5 w-5" />, bg: "bg-orange-50", text: "text-orange-600", ring: "ring-orange-100", label: "Review" };
    case "meeting_canceled":
      return { icon: <Calendar className="h-5 w-5" />, bg: "bg-red-50", text: "text-red-600", ring: "ring-red-100", label: "Canceled" };
    case "credit_refund":
    case "wallet_debit":
      return { icon: <CreditCard className="h-5 w-5" />, bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-100", label: "Wallet" };
    case "profile_reactivated":
      return { icon: <UserCheck className="h-5 w-5" />, bg: "bg-teal-50", text: "text-teal-600", ring: "ring-teal-100", label: "Profile" };
    default:
      return { icon: <MessageCircle className="h-5 w-5" />, bg: "bg-gray-50", text: "text-gray-500", ring: "ring-gray-100", label: "General" };
  }
}

// ---------------------------------------------------------------
// Helpers — routing & categorisation
// ---------------------------------------------------------------
function getNotificationLink(n: Notification): string | null {
  const data = n.data || {};
  if (data.meeting_id) {
    if (["meeting_response_submitted", "meeting_responses_complete", "match_created"].includes(n.type))
      return `/dashboard/meetings/${data.meeting_id}/response`;
    return "/dashboard/meetings";
  }
  if (["like", "wink", "interested", "mutual_match", "match_created"].includes(n.type)) return "/dashboard/likes";
  return null;
}

function getNotificationCategory(type: string): string {
  if (type.startsWith("meeting_")) return "meetings";
  if (["like", "wink", "interested", "mutual_match", "match_created"].includes(type)) return "activity";
  return "system";
}

// ---------------------------------------------------------------
// Helpers — date display
// ---------------------------------------------------------------
function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  const min = Math.floor(ms / 60000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

/** Determine which date bucket a notification falls into */
function dateBucket(iso: string): "today" | "yesterday" | "week" | "older" {
  const d = new Date(iso);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);

  if (d >= startOfToday) return "today";
  if (d >= startOfYesterday) return "yesterday";
  if (d >= startOfWeek) return "week";
  return "older";
}

const bucketLabels: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  older: "Older",
};

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [markingAll, setMarkingAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  // ---------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------
  const fetchNotifications = useCallback(
    async (append = false) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push("/login"); return; }

        const currentOffset = append ? offset : 0;
        const params = new URLSearchParams({ limit: String(LIMIT), offset: String(currentOffset) });
        if (activeFilter === "unread") params.set("unread_only", "true");

        const res = await fetch(`/api/notifications?${params}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        let filtered: Notification[] = data.notifications || [];

        // Client-side category filter
        if (activeFilter === "meetings") filtered = filtered.filter((n) => getNotificationCategory(n.type) === "meetings");
        else if (activeFilter === "activity") filtered = filtered.filter((n) => getNotificationCategory(n.type) === "activity");
        else if (activeFilter === "system") filtered = filtered.filter((n) => getNotificationCategory(n.type) === "system");

        if (append) setNotifications((prev) => [...prev, ...filtered]);
        else setNotifications(filtered);

        setTotal(data.total || 0);
        setUnreadCount(data.unread_count || 0);
        setOffset(currentOffset + LIMIT);
      } catch (err) {
        console.error("Error fetching notifications:", err);
      }
    },
    [activeFilter, offset, router],
  );

  // Fetch on mount + filter change
  useEffect(() => {
    setLoading(true);
    setOffset(0);
    fetchNotifications(false).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  const loadMore = async () => { setLoadingMore(true); await fetchNotifications(true); setLoadingMore(false); };

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------
  const markAsRead = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ notification_ids: [id] }),
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) { console.error("Error marking as read:", err); }
  };

  const markAllAsRead = async () => {
    setMarkingAll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ mark_all_read: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) { console.error("Error marking all as read:", err); } finally { setMarkingAll(false); }
  };

  const deleteAllRead = async () => {
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ delete_all_read: true }),
      });
      const readCount = notifications.filter((n) => n.read).length;
      setNotifications((prev) => prev.filter((n) => !n.read));
      setTotal((prev) => prev - readCount);
    } catch (err) { console.error("Error deleting read:", err); } finally { setDeleting(false); }
  };

  const handleClick = (n: Notification) => {
    if (!n.read) markAsRead(n.id);
    const link = getNotificationLink(n);
    if (link) router.push(link);
  };

  // ---------------------------------------------------------------
  // Real-time
  // ---------------------------------------------------------------
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase
        .channel("notifications-page")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
          const newN = payload.new as Notification;
          setNotifications((prev) => [newN, ...prev]);
          setUnreadCount((c) => c + 1);
          setTotal((c) => c + 1);
        })
        .subscribe();
    };
    setup();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  // ---------------------------------------------------------------
  // Group notifications by date bucket
  // ---------------------------------------------------------------
  const grouped = useMemo(() => {
    const buckets: Record<string, Notification[]> = { today: [], yesterday: [], week: [], older: [] };
    notifications.forEach((n) => buckets[dateBucket(n.created_at)].push(n));
    return (["today", "yesterday", "week", "older"] as const).filter((k) => buckets[k].length > 0).map((k) => ({ key: k, label: bucketLabels[k], items: buckets[k] }));
  }, [notifications]);

  // ---------------------------------------------------------------
  // Filter tabs
  // ---------------------------------------------------------------
  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread", count: unreadCount },
    { key: "meetings", label: "Meetings" },
    { key: "activity", label: "Activity" },
    { key: "system", label: "System" },
  ];

  const hasMore = notifications.length < total;

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/dashboard">
            <Image src="/matchindeed.svg" alt="MatchIndeed" width={130} height={34} style={{ width: "auto", height: "auto" }} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 flex-shrink-0">
          <Sidebar active="notifications" />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 space-y-5">
          {/* Page title + actions */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
                <Bell className="h-7 w-7 text-[#1f419a]" />
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </h1>
              <p className="mt-1 text-sm text-gray-500">Stay updated on activity, meetings, and matches</p>
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  disabled={markingAll}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#1f419a]/20 px-3 py-2 text-xs font-semibold text-[#1f419a] transition-colors hover:bg-[#1f419a]/5 disabled:opacity-50"
                >
                  {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                  Mark all read
                </button>
              )}
              <button
                onClick={deleteAllRead}
                disabled={deleting || notifications.filter((n) => n.read).length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Clear read
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  activeFilter === tab.key
                    ? "bg-[#1f419a] text-white shadow-sm"
                    : "bg-white text-gray-600 ring-1 ring-black/5 hover:bg-gray-100"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${activeFilter === tab.key ? "bg-white/20 text-white" : "bg-red-100 text-red-600"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-white py-20 shadow-sm ring-1 ring-black/5">
              <Loader2 className="h-7 w-7 animate-spin text-[#1f419a]" />
              <p className="mt-3 text-sm text-gray-400">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-white py-20 shadow-sm ring-1 ring-black/5">
              <Inbox className="mb-3 h-14 w-14 text-gray-200" />
              <h3 className="font-semibold text-gray-700">
                {activeFilter === "unread" ? "All caught up!" : "No notifications yet"}
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                {activeFilter === "unread"
                  ? "You have no unread notifications."
                  : "Notifications will appear here when there's new activity."}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map((group) => (
                <section key={group.key}>
                  {/* Date group label */}
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 pl-1">
                    {group.label}
                  </h2>

                  <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
                    {group.items.map((notif, idx) => {
                      const style = getNotificationStyle(notif.type);
                      const link = getNotificationLink(notif);
                      const isLast = idx === group.items.length - 1;

                      return (
                        <div
                          key={notif.id}
                          onClick={() => handleClick(notif)}
                          className={`flex items-start gap-3.5 px-4 py-3.5 transition-colors ${
                            !notif.read ? "bg-[#eef2ff]" : "hover:bg-gray-50"
                          } ${link ? "cursor-pointer" : ""} ${!isLast ? "border-b border-gray-100" : ""}`}
                        >
                          {/* Icon badge */}
                          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${style.bg} ${style.text} ring-1 ${style.ring}`}>
                            {style.icon}
                          </div>

                          {/* Body */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className={`text-sm leading-snug ${!notif.read ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                                    {notif.title}
                                  </p>
                                  {!notif.read && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#1f419a]" />}
                                </div>
                                <p className="mt-0.5 text-sm leading-relaxed text-gray-500 line-clamp-2">
                                  {notif.message}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  <span className="text-[11px] text-gray-400">{formatTime(notif.created_at)}</span>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.bg} ${style.text}`}>
                                    {style.label}
                                  </span>
                                  {link && (
                                    <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
                                      <ExternalLink className="h-3 w-3" /> View
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Mark as read button */}
                              {!notif.read && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                                  className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white hover:text-[#1f419a]"
                                  title="Mark as read"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              {/* Load more */}
              {hasMore && (
                <div className="pt-1 text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#1f419a]/15 px-5 py-2.5 text-sm font-semibold text-[#1f419a] transition-colors hover:bg-[#1f419a]/5 disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Loading...</>
                    ) : (
                      <><ChevronDown className="h-4 w-4" /> Load More</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Settings link */}
          <Link
            href="/dashboard/profile/notifications"
            className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5 text-sm text-gray-500 transition-colors hover:text-[#1f419a]"
          >
            <span className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Manage notification preferences
            </span>
            <ChevronDown className="h-4 w-4 -rotate-90" />
          </Link>
        </main>
      </div>
    </div>
  );
}
