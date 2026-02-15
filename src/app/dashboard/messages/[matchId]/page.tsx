"use client";

/**
 * ChatPage — MatchIndeed
 *
 * Individual conversation with a matched user. Features:
 * - Real-time messaging via Supabase Realtime (postgres_changes)
 * - Optimistic send + rollback on failure
 * - Load-older-messages pagination
 * - Read receipts (double-tick)
 * - Typing indicator (broadcast)
 * - Partner online / offline presence
 * - Date separators between message groups
 * - Brand-consistent colours (#1f419a)
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  Send,
  Loader2,
  CheckCheck,
  Check,
  ChevronUp,
  Heart,
  Shield,
} from "lucide-react";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type Message = {
  id: string;
  sender_id: string;
  content: string;
  message_type: string;
  read_at: string | null;
  created_at: string;
};

type PartnerInfo = {
  id: string;
  name: string;
  photo: string | null;
  tier: string;
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function needsDateSep(idx: number, msgs: Message[]): boolean {
  if (idx === 0) return true;
  return new Date(msgs[idx - 1].created_at).toDateString() !== new Date(msgs[idx].created_at).toDateString();
}

function tierColor(t: string): string {
  switch (t) {
    case "vip": return "bg-purple-50 text-purple-700 ring-purple-200";
    case "premium": return "bg-amber-50 text-amber-700 ring-amber-200";
    case "standard": return "bg-blue-50 text-blue-700 ring-blue-200";
    default: return "bg-gray-50 text-gray-600 ring-gray-200";
  }
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.matchId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [partner, setPartner] = useState<PartnerInfo | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldScrollRef = useRef(true);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingBroadcast = useRef<number>(0);

  // ---------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------
  const fetchMessages = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      setCurrentUserId(session.user.id);

      const res = await fetch(`/api/messages?match_id=${matchId}&limit=50`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to load messages");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setMessages(data.messages || []);
      setHasMore(data.has_more || false);

      // Partner info
      const { data: match } = await supabase.from("user_matches").select("user1_id, user2_id").eq("id", matchId).single();
      if (match) {
        const pid = match.user1_id === session.user.id ? match.user2_id : match.user1_id;
        const { data: profile } = await supabase.from("user_profiles").select("first_name, last_name, profile_photo_url, photos").eq("user_id", pid).single();
        const { data: account } = await supabase.from("accounts").select("tier").eq("id", pid).single();
        setPartner({
          id: pid,
          name: profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "User" : "User",
          photo: profile?.profile_photo_url || (profile?.photos?.[0] ?? null),
          tier: account?.tier || "basic",
        });
      }

      // Mark read
      await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ match_id: matchId }),
      });
    } catch (err) {
      console.error("Error fetching messages:", err);
      setError("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [matchId, router]);

  const loadOlderMessages = async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    shouldScrollRef.current = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const oldest = messages[0];
      const res = await fetch(`/api/messages?match_id=${matchId}&limit=50&before=${oldest.created_at}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...(data.messages || []), ...prev]);
        setHasMore(data.has_more || false);
      }
    } catch (err) { console.error("Error loading older:", err); }
    finally { setLoadingMore(false); }
  };

  // ---------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------
  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (shouldScrollRef.current && messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    shouldScrollRef.current = true;
  }, [messages]);

  // Realtime: messages, read receipts, typing, presence
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`chat-${matchId}`, { config: { presence: { key: currentUserId } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${matchId}` }, (payload) => {
        const n = payload.new as Message;
        setMessages((prev) => (prev.some((m) => m.id === n.id) ? prev : [...prev, n]));
        if (n.sender_id !== currentUserId) {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ match_id: matchId }) });
          });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `match_id=eq.${matchId}` }, (payload) => {
        const u = payload.new as Message;
        setMessages((prev) => prev.map((m) => (m.id === u.id ? u : m)));
      })
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload?.user_id && payload.payload.user_id !== currentUserId) {
          setPartnerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 3000);
        }
      })
      .on("broadcast", { event: "stop_typing" }, (payload) => {
        if (payload.payload?.user_id && payload.payload.user_id !== currentUserId) setPartnerTyping(false);
      })
      .on("presence", { event: "sync" }, () => {
        setPartnerOnline(Object.keys(channel.presenceState()).some((k) => k !== currentUserId));
      })
      .on("presence", { event: "join" }, ({ key }) => { if (key !== currentUserId) setPartnerOnline(true); })
      .on("presence", { event: "leave" }, ({ key }) => { if (key !== currentUserId) setPartnerOnline(false); })
      .subscribe(async (status) => { if (status === "SUBSCRIBED") await channel.track({ online_at: new Date().toISOString() }); });

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [matchId, currentUserId]);

  // ---------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------
  const broadcastTyping = useCallback(() => {
    if (Date.now() - lastTypingBroadcast.current < 1000) return;
    lastTypingBroadcast.current = Date.now();
    supabase.channel(`chat-${matchId}`).send({ type: "broadcast", event: "typing", payload: { user_id: currentUserId } });
  }, [matchId, currentUserId]);

  const broadcastStopTyping = useCallback(() => {
    supabase.channel(`chat-${matchId}`).send({ type: "broadcast", event: "stop_typing", payload: { user_id: currentUserId } });
  }, [matchId, currentUserId]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    const text = newMessage.trim();
    setNewMessage("");
    setSending(true);
    broadcastStopTyping();

    const opt: Message = { id: `temp-${Date.now()}`, sender_id: currentUserId || "", content: text, message_type: "text", read_at: null, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, opt]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ match_id: matchId, content: text }) });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => prev.map((m) => (m.id === opt.id ? data.message : m)));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== opt.id));
      }
    } catch { setMessages((prev) => prev.filter((m) => m.id !== opt.id)); }
    finally { setSending(false); inputRef.current?.focus(); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ---------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
          <Shield className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <h2 className="font-semibold text-gray-900">Unable to Load Chat</h2>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
          <Link href="/dashboard/messages" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#1f419a] hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to Messages
          </Link>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Chat header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/dashboard/messages" className="-ml-2 rounded-lg p-2 transition-colors hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>

          {partner ? (
            <>
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {partner.photo ? (
                  <div className="h-10 w-10 overflow-hidden rounded-full ring-2 ring-gray-100">
                    <Image src={partner.photo} alt={partner.name} width={40} height={40} className="h-full w-full object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#1f419a] to-[#2a44a3] font-bold text-white">
                    {partner.name.charAt(0)}
                  </div>
                )}
                {partnerOnline && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" />}
              </div>

              {/* Name + status */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-semibold text-gray-900">{partner.name}</h2>
                  {partner.tier && partner.tier !== "basic" && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${tierColor(partner.tier)}`}>
                      {partner.tier}
                    </span>
                  )}
                </div>
                <p className="text-xs">
                  {partnerTyping ? (
                    <span className="flex items-center gap-1 font-medium text-[#1f419a]">
                      typing
                      <span className="flex gap-0.5">
                        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-[#1f419a]" style={{ animationDelay: "0ms" }} />
                        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-[#1f419a]" style={{ animationDelay: "150ms" }} />
                        <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-[#1f419a]" style={{ animationDelay: "300ms" }} />
                      </span>
                    </span>
                  ) : partnerOnline ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" /> Online
                    </span>
                  ) : (
                    <span className="text-gray-400">Offline</span>
                  )}
                </p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
              <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
            </div>
          )}
        </div>
      </header>

      {/* Messages area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl">
          {/* Load older */}
          {hasMore && (
            <div className="mb-4 text-center">
              <button onClick={loadOlderMessages} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-[#1f419a] transition hover:bg-gray-50 disabled:opacity-50">
                {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronUp className="h-3.5 w-3.5" />}
                Load older messages
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-[#1f419a]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="py-20 text-center">
              <Heart className="mx-auto mb-3 h-14 w-14 text-pink-200" />
              <h3 className="font-semibold text-gray-900">You&apos;re Matched!</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-gray-500">
                Say hello to {partner?.name || "your match"}! Start a conversation and get to know each other.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {messages.map((msg, idx) => {
                const isOwn = msg.sender_id === currentUserId;
                const showDate = needsDateSep(idx, messages);

                return (
                  <div key={msg.id}>
                    {/* Date separator */}
                    {showDate && (
                      <div className="my-4 flex items-center justify-center">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-500">
                          {formatDateSeparator(msg.created_at)}
                        </span>
                      </div>
                    )}

                    {/* Bubble */}
                    <div className={`mb-1 flex ${isOwn ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 sm:max-w-[60%] ${
                          isOwn
                            ? "bg-[#1f419a] text-white rounded-br-md"
                            : "border border-gray-100 bg-white text-gray-900 shadow-sm rounded-bl-md"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                        <div className={`mt-1 flex items-center gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                          <span className={`text-[10px] ${isOwn ? "text-white/60" : "text-gray-400"}`}>
                            {formatMessageTime(msg.created_at)}
                          </span>
                          {isOwn && (
                            <span className="text-white/60">
                              {msg.read_at ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Typing indicator bubble */}
          {partnerTyping && (
            <div className="mb-1 flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "0ms" }} />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "150ms" }} />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="sticky bottom-0 border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-end gap-3 px-4 py-3">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                if (e.target.value.trim()) broadcastTyping();
                else broadcastStopTyping();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full resize-none overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-[#1f419a] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#1f419a]/20"
              style={{ height: "auto", minHeight: "42px", maxHeight: "128px" }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
              }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className={`rounded-full p-2.5 transition-all ${
              newMessage.trim()
                ? "bg-[#1f419a] text-white shadow-md hover:bg-[#17357b] hover:shadow-lg"
                : "bg-gray-100 text-gray-400"
            } disabled:opacity-50`}
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
        <p className="pb-2 text-center text-[11px] text-gray-400">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
