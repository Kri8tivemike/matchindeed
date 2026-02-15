"use client";

/**
 * MessagesPage — MatchIndeed
 *
 * Conversation list showing all matched conversations where messaging
 * is enabled. Features:
 * - Standard dashboard layout (header, sidebar)
 * - Brand-consistent colours (#1f419a)
 * - Partner avatar with online indicator (Supabase presence)
 * - Last-message preview, unread badge, relative time
 * - Search filter
 * - Real-time subscription for new messages
 * - Blocked-user filtering
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getBlockedUserIds } from "@/lib/blocked-users";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import {
  MessageCircle,
  Search,
  Loader2,
  Heart,
  ArrowRight,
  User,
  Inbox,
} from "lucide-react";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type Conversation = {
  match_id: string;
  partner_id: string;
  partner_name: string;
  partner_photo: string | null;
  partner_tier: string;
  matched_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  meeting_id: string | null;
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Relative time display */
function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  const min = Math.floor(ms / 60000);
  const hr = Math.floor(ms / 3600000);
  const day = Math.floor(ms / 86400000);

  if (min < 1) return "Now";
  if (min < 60) return `${min}m`;
  if (hr < 24) return `${hr}h`;
  if (day < 7) return `${day}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Subscription tier badge colours */
function tierColor(tier: string) {
  switch (tier) {
    case "vip":
      return "bg-purple-50 text-purple-700 ring-purple-200";
    case "premium":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "standard":
      return "bg-blue-50 text-blue-700 ring-blue-200";
    default:
      return "bg-gray-50 text-gray-600 ring-gray-200";
  }
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalUnread, setTotalUnread] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------
  // Fetch conversations
  // ---------------------------------------------------------------
  const fetchConversations = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const res = await fetch("/api/messages", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const blockedIds = await getBlockedUserIds();
        const filtered = (data.conversations || []).filter(
          (c: Conversation) => !blockedIds.has(c.partner_id),
        );
        setConversations(filtered);
        setTotalUnread(data.total_unread || 0);
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Initial load + 15-second poll
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // ---------------------------------------------------------------
  // Realtime: new messages + global presence
  // ---------------------------------------------------------------
  useEffect(() => {
    let msgChannel: ReturnType<typeof supabase.channel> | null = null;
    let presenceChannel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      msgChannel = supabase
        .channel("messages-list")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => fetchConversations())
        .subscribe();

      presenceChannel = supabase
        .channel("global-presence", { config: { presence: { key: user.id } } })
        .on("presence", { event: "sync" }, () => {
          setOnlineUsers(new Set(Object.keys(presenceChannel!.presenceState())));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") await presenceChannel!.track({ online_at: new Date().toISOString() });
        });
    };

    setup();
    return () => {
      if (msgChannel) supabase.removeChannel(msgChannel);
      if (presenceChannel) supabase.removeChannel(presenceChannel);
    };
  }, [fetchConversations]);

  // ---------------------------------------------------------------
  // Search filter
  // ---------------------------------------------------------------
  const filtered = conversations.filter((c) =>
    c.partner_name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

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
          <Sidebar active="messages" />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 space-y-5">
          {/* Title */}
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
              <MessageCircle className="h-7 w-7 text-[#1f419a]" />
              Messages
              {totalUnread > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                  {totalUnread}
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-gray-500">Chat with your matches</p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-[#1f419a] focus:outline-none focus:ring-1 focus:ring-[#1f419a]/20"
            />
          </div>

          {/* List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-white py-20 shadow-sm ring-1 ring-black/5">
              <Loader2 className="h-7 w-7 animate-spin text-[#1f419a]" />
              <p className="mt-3 text-sm text-gray-400">Loading conversations...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-black/5">
              {conversations.length === 0 ? (
                <>
                  <Inbox className="mx-auto mb-3 h-14 w-14 text-gray-200" />
                  <h3 className="font-semibold text-gray-900">No conversations yet</h3>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-gray-400">
                    When you and a match both say &quot;Yes&quot; after a video meeting, messaging will be enabled here.
                  </p>
                  <Link
                    href="/dashboard/discover"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-5 py-2.5 text-sm font-semibold text-white shadow-md"
                  >
                    Discover Matches
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <>
                  <Search className="mx-auto mb-3 h-10 w-10 text-gray-200" />
                  <h3 className="font-semibold text-gray-900">
                    No results for &quot;{searchQuery}&quot;
                  </h3>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
              {filtered.map((convo, idx) => {
                const isLast = idx === filtered.length - 1;
                const isOnline = onlineUsers.has(convo.partner_id);
                const hasUnread = convo.unread_count > 0;

                return (
                  <Link
                    key={convo.match_id}
                    href={`/dashboard/messages/${convo.match_id}`}
                    className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors ${
                      hasUnread ? "bg-[#eef2ff]" : "hover:bg-gray-50"
                    } ${!isLast ? "border-b border-gray-100" : ""}`}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {convo.partner_photo ? (
                        <div className="h-12 w-12 overflow-hidden rounded-full ring-2 ring-gray-100">
                          <Image
                            src={convo.partner_photo}
                            alt={convo.partner_name}
                            width={48}
                            height={48}
                            className="h-full w-full object-cover"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#1f419a] to-[#2a44a3] text-lg font-bold text-white">
                          {convo.partner_name.charAt(0)}
                        </div>
                      )}
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className={`truncate text-sm ${hasUnread ? "font-bold text-gray-900" : "font-semibold text-gray-700"}`}>
                          {convo.partner_name}
                        </h3>
                        {convo.partner_tier && convo.partner_tier !== "basic" && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${tierColor(convo.partner_tier)}`}>
                            {convo.partner_tier}
                          </span>
                        )}
                      </div>
                      <p className={`mt-0.5 truncate text-sm ${hasUnread ? "font-medium text-gray-900" : "text-gray-500"}`}>
                        {convo.last_message_preview || "Start a conversation!"}
                      </p>
                    </div>

                    {/* Meta: time + unread */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className="text-[11px] text-gray-400">
                        {formatTime(convo.last_message_at || convo.matched_at)}
                      </span>
                      {hasUnread && (
                        <span className="min-w-[20px] rounded-full bg-[#1f419a] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                          {convo.unread_count > 99 ? "99+" : convo.unread_count}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
