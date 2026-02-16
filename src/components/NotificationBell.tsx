"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  X,
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
  Eye,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Notification item type matching the database schema
 */
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

/**
 * Map notification types to icons and colors
 */
function getNotificationStyle(type: string): {
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
} {
  switch (type) {
    case "like":
    case "interested":
    case "wink":
      return {
        icon: <Heart className="h-4 w-4" />,
        bgColor: "bg-pink-100",
        textColor: "text-pink-600",
      };
    case "mutual_match":
    case "match_created":
      return {
        icon: <Star className="h-4 w-4" />,
        bgColor: "bg-amber-100",
        textColor: "text-amber-600",
      };
    case "meeting_rules":
    case "meeting_reminder":
    case "meeting_finalized":
    case "meeting_response_submitted":
    case "meeting_responses_complete":
      return {
        icon: <Video className="h-4 w-4" />,
        bgColor: "bg-blue-100",
        textColor: "text-blue-600",
      };
    case "meeting_pending_review":
    case "meeting_investigation":
      return {
        icon: <ShieldAlert className="h-4 w-4" />,
        bgColor: "bg-orange-100",
        textColor: "text-orange-600",
      };
    case "meeting_canceled":
      return {
        icon: <Calendar className="h-4 w-4" />,
        bgColor: "bg-red-100",
        textColor: "text-red-600",
      };
    case "credit_refund":
    case "wallet_debit":
      return {
        icon: <CreditCard className="h-4 w-4" />,
        bgColor: "bg-green-100",
        textColor: "text-green-600",
      };
    case "profile_reactivated":
      return {
        icon: <UserCheck className="h-4 w-4" />,
        bgColor: "bg-teal-100",
        textColor: "text-teal-600",
      };
    default:
      return {
        icon: <MessageCircle className="h-4 w-4" />,
        bgColor: "bg-gray-100",
        textColor: "text-gray-600",
      };
  }
}

/**
 * Get the link a notification should navigate to
 */
function getNotificationLink(notif: Notification): string | null {
  const data = notif.data || {};

  if (data.meeting_id) {
    if (
      notif.type === "meeting_response_submitted" ||
      notif.type === "meeting_responses_complete" ||
      notif.type === "match_created"
    ) {
      return `/dashboard/meetings/${data.meeting_id}/response`;
    }
    return "/dashboard/meetings";
  }

  if (notif.type === "like" || notif.type === "wink" || notif.type === "interested") {
    return "/dashboard/likes";
  }

  if (notif.type === "mutual_match" || notif.type === "match_created") {
    return "/dashboard/likes";
  }

  return null;
}

/**
 * Format a relative time string (e.g., "2 hours ago", "just now")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * NotificationBell - Bell icon with unread badge and dropdown panel
 *
 * Features:
 * - Shows unread count badge
 * - Dropdown panel with recent notifications
 * - Mark individual or all as read
 * - Click notification to navigate
 * - Real-time updates via Supabase Realtime subscription
 * - "View All" link to full notifications page
 */
export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /**
   * Fetch notifications from the API
   */
  const fetchNotifications = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/notifications?limit=10", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) return;

      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  }, []);

  /**
   * Fetch unread count only (lightweight poll)
   */
  const fetchUnreadCount = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/notifications?limit=1&unread_only=true", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) return;

      const data = await res.json();
      setUnreadCount(data.unread_count || 0);
    } catch (err) {
      // Silent fail for polling
    }
  }, []);

  /**
   * Mark a single notification as read
   */
  const markAsRead = async (notifId: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ notification_ids: [notifId] }),
      });

      // Update local state
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notifId
            ? { ...n, read: true, read_at: new Date().toISOString() }
            : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = async () => {
    setMarkingAll(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ mark_all_read: true }),
      });

      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          read: true,
          read_at: new Date().toISOString(),
        }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error("Error marking all as read:", err);
    } finally {
      setMarkingAll(false);
    }
  };

  /**
   * Handle clicking a notification — mark as read & navigate
   */
  const handleNotificationClick = (notif: Notification) => {
    if (!notif.read) {
      markAsRead(notif.id);
    }

    const link = getNotificationLink(notif);
    if (link) {
      setOpen(false);
      router.push(link);
    }
  };

  // Fetch on mount and set up polling
  useEffect(() => {
    fetchNotifications();

    // Poll every 30 seconds for unread count
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications, fetchUnreadCount]);

  // Refetch when dropdown opens
  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchNotifications().finally(() => setLoading(false));
    }
  }, [open, fetchNotifications]);

  // Set up Supabase Realtime subscription for instant updates
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtime = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel("user-notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // New notification arrived — add to top of list and increment count
            const newNotif = payload.new as Notification;
            setNotifications((prev) => [newNotif, ...prev].slice(0, 10));
            setUnreadCount((prev) => prev + 1);
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-white/80 text-gray-600 hover:bg-white hover:text-gray-900 transition-colors shadow-sm"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[360px] sm:w-[400px] max-h-[80vh] rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-[#1f419a]/5 to-[#2a44a3]/5">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-[#1f419a]" />
              <h3 className="font-bold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  disabled={markingAll}
                  className="text-xs text-[#1f419a] hover:underline font-medium flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#1f419a]/5 transition-colors disabled:opacity-50"
                  title="Mark all as read"
                >
                  {markingAll ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3 w-3" />
                  )}
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto max-h-[60vh]">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Bell className="h-10 w-10 mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">
                  No notifications yet
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  You&apos;ll see activity here
                </p>
              </div>
            ) : (
              <div>
                {notifications.map((notif) => {
                  const style = getNotificationStyle(notif.type);
                  const link = getNotificationLink(notif);

                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`
                        flex items-start gap-3 px-4 py-3 border-b border-gray-50 transition-colors
                        ${!notif.read ? "bg-blue-50/50" : "bg-white"}
                        ${link ? "cursor-pointer hover:bg-gray-50" : ""}
                      `}
                    >
                      {/* Icon */}
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${style.bgColor} ${style.textColor}`}
                      >
                        {style.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm leading-tight ${
                              !notif.read
                                ? "font-semibold text-gray-900"
                                : "text-gray-700"
                            }`}
                          >
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <span className="w-2 h-2 rounded-full bg-[#1f419a] flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-400">
                            {formatRelativeTime(notif.created_at)}
                          </span>
                          {link && (
                            <ExternalLink className="h-2.5 w-2.5 text-gray-300" />
                          )}
                        </div>
                      </div>

                      {/* Read action */}
                      {!notif.read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notif.id);
                          }}
                          className="p-1 rounded-lg hover:bg-white transition-colors text-gray-400 hover:text-[#1f419a] flex-shrink-0"
                          title="Mark as read"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50/50">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/dashboard/notifications");
              }}
              className="w-full text-center text-sm font-medium text-[#1f419a] hover:text-[#17357b] transition-colors flex items-center justify-center gap-1"
            >
              <Eye className="h-4 w-4" />
              View All Notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
