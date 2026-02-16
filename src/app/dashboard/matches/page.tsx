"use client";

/**
 * Mutual Matches Page
 *
 * Shows all users the current user has mutually matched with.
 * Combines two match types:
 *   - Activity matches (both users liked/winked/interested each other)
 *   - Meeting matches (both responded "yes" after a video meeting)
 *
 * URL: /dashboard/matches
 */

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Heart,
  MessageCircle,
  Video,
  MapPin,
  User,
  Loader2,
  Sparkles,
  Calendar,
  X,
  ChevronRight,
  Filter,
  CheckCircle,
  BadgeCheck,
  Star,
  Users,
  Clock,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import ProfileDetailModal from "@/components/ProfileDetailModal";
import MeetingRequestModal from "@/components/MeetingRequestModal";
import { supabase } from "@/lib/supabase";
import { getBlockedUserIds } from "@/lib/blocked-users";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type MatchData = {
  partner_id: string;
  match_type: "activity" | "meeting";
  matched_at: string;
  name: string;
  age: number | null;
  location: string | null;
  photo: string | null;
  ethnicity: string | null;
  religion: string | null;
  education: string | null;
  about: string | null;
  tier: string;
  verified: boolean;
  your_activity: string | null;
  their_activity: string | null;
  match_id: string | null;
  messaging_enabled: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  meeting_id: string | null;
  has_activity_match: boolean;
  has_meeting_match: boolean;
};

type FilterTab = "all" | "activity" | "meeting";

// ---------------------------------------------------------------
// Helper
// ---------------------------------------------------------------

const activityEmoji: Record<string, string> = {
  wink: "😉",
  like: "❤️",
  interested: "💬",
};

const activityLabel: Record<string, string> = {
  wink: "Winked",
  like: "Liked",
  interested: "Interested",
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------

export default function MutualMatchesPage() {
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [stats, setStats] = useState({
    total: 0,
    activity: 0,
    meeting: 0,
  });

  // Profile detail modal
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Meeting request modal
  const [meetingTarget, setMeetingTarget] = useState<{
    id: string;
    first_name: string | null;
    profile_photo_url: string | null;
    tier: string;
  } | null>(null);

  // Image fallback state
  const [imgSrcs, setImgSrcs] = useState<Record<string, string>>({});

  /**
   * Fetch mutual matches
   */
  const fetchMatches = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/matches", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        // Filter out blocked users (bidirectional)
        const blockedUserIds = await getBlockedUserIds();
        const filteredMatches = (data.matches || []).filter(
          (m: any) => !blockedUserIds.has(m.partner_id)
        );
        setMatches(filteredMatches);
        setStats({
          total: data.total || 0,
          activity: data.activity_matches || 0,
          meeting: data.meeting_matches || 0,
        });
        // Initialize image sources
        const srcs: Record<string, string> = {};
        for (const m of data.matches || []) {
          srcs[m.partner_id] = m.photo || "/placeholder-profile.svg";
        }
        setImgSrcs(srcs);
      }
    } catch (err) {
      console.error("Error fetching matches:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // Filter matches
  const filteredMatches = matches.filter((m) => {
    if (filter === "all") return true;
    if (filter === "activity") return m.has_activity_match;
    if (filter === "meeting") return m.has_meeting_match;
    return true;
  });

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50">
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
        <aside className="hidden md:block w-56 flex-shrink-0">
          <Sidebar active="likes" />
        </aside>

        <section className="space-y-5">
          {/* Page Header */}
          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Heart className="h-6 w-6 text-white fill-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900">
                  Mutual Matches
                </h1>
                <p className="text-gray-600 mt-1">
                  People who are also interested in you. Start a conversation or
                  request a video meeting!
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-full bg-pink-50 border border-pink-200 px-4 py-1.5 text-sm font-medium text-pink-700">
                <Heart className="h-3.5 w-3.5 fill-pink-500" />
                {stats.total} Total Match{stats.total !== 1 ? "es" : ""}
              </div>
              <div className="flex items-center gap-2 rounded-full bg-purple-50 border border-purple-200 px-4 py-1.5 text-sm font-medium text-purple-700">
                <Sparkles className="h-3.5 w-3.5" />
                {stats.activity} Mutual Interest{stats.activity !== 1 ? "s" : ""}
              </div>
              <div className="flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200 px-4 py-1.5 text-sm font-medium text-blue-700">
                <Video className="h-3.5 w-3.5" />
                {stats.meeting} Meeting Match{stats.meeting !== 1 ? "es" : ""}
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2">
            {(
              [
                { key: "all", label: "All Matches", icon: <Users className="h-3.5 w-3.5" /> },
                { key: "activity", label: "Mutual Interests", icon: <Heart className="h-3.5 w-3.5" /> },
                { key: "meeting", label: "Meeting Matches", icon: <Video className="h-3.5 w-3.5" /> },
              ] as { key: FilterTab; label: string; icon: React.ReactNode }[]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  filter === tab.key
                    ? "bg-[#1f419a] text-white shadow-lg"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-[#1f419a]" />
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="rounded-2xl bg-white p-12 shadow-lg ring-1 ring-black/5 text-center">
              <Heart className="h-16 w-16 mx-auto mb-4 text-gray-200" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {filter === "all"
                  ? "No mutual matches yet"
                  : filter === "activity"
                  ? "No mutual interests yet"
                  : "No meeting matches yet"}
              </h2>
              <p className="text-gray-500 max-w-md mx-auto">
                {filter === "all"
                  ? "When someone you've liked also likes you back, they'll appear here. Keep exploring!"
                  : filter === "activity"
                  ? "Wink, like, or show interest in profiles — when they do the same, it's a match!"
                  : "After a video meeting where both of you say \"yes\", you'll see them here."}
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <Link
                  href="/dashboard/discover"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all"
                >
                  <Sparkles className="h-4 w-4" />
                  Discover Profiles
                </Link>
                <Link
                  href="/dashboard/search"
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Search
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMatches.map((match) => {
                const imgSrc =
                  imgSrcs[match.partner_id] || "/placeholder-profile.svg";

                return (
                  <div
                    key={match.partner_id}
                    className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5 hover:shadow-xl transition-shadow cursor-pointer group"
                    onClick={() => setSelectedUserId(match.partner_id)}
                  >
                    {/* Photo */}
                    <div className="relative h-52">
                      <Image
                        src={imgSrc}
                        alt={match.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        unoptimized
                        onError={() => {
                          setImgSrcs((prev) => ({
                            ...prev,
                            [match.partner_id]: "/placeholder-profile.svg",
                          }));
                        }}
                      />

                      {/* Match type badge */}
                      <div className="absolute top-3 left-3 z-10">
                        {match.has_meeting_match ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                            <Video className="h-3 w-3" />
                            Meeting Match
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                            <Heart className="h-3 w-3 fill-white" />
                            Mutual Match
                          </span>
                        )}
                      </div>

                      {/* Activity indicators */}
                      {match.your_activity && match.their_activity && (
                        <div className="absolute bottom-3 left-3 flex items-center gap-1">
                          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                            You {activityEmoji[match.your_activity]}{" "}
                            {activityLabel[match.your_activity] || match.your_activity}
                          </span>
                          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                            They {activityEmoji[match.their_activity]}{" "}
                            {activityLabel[match.their_activity] || match.their_activity}
                          </span>
                        </div>
                      )}

                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    {/* Info */}
                    <div className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-gray-900 truncate">
                            {match.name}
                            {match.verified && (
                              <BadgeCheck className="inline-block ml-1.5 h-4.5 w-4.5 text-blue-500" />
                            )}
                          </h3>
                          <div className="text-sm text-gray-600">
                            {match.age !== null ? `Age ${match.age}` : ""}
                            {match.age !== null && match.location ? " · " : ""}
                            {match.location || ""}
                          </div>
                        </div>
                        <div className="text-[10px] text-gray-400 flex-shrink-0 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeAgo(match.matched_at)}
                        </div>
                      </div>

                      {/* Quick tags */}
                      <div className="flex flex-wrap gap-1">
                        {match.ethnicity && (
                          <span className="inline-flex items-center rounded-full bg-purple-50 border border-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                            🌍 {match.ethnicity}
                          </span>
                        )}
                        {match.religion && (
                          <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                            🙏 {match.religion}
                          </span>
                        )}
                        {match.education && (
                          <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            🎓 {match.education}
                          </span>
                        )}
                      </div>

                      {/* Last message preview (for meeting matches) */}
                      {match.last_message_preview && (
                        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 truncate">
                          💬 {match.last_message_preview}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        {match.messaging_enabled && match.match_id && (
                          <Link
                            href={`/dashboard/messages/${match.match_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#1f419a] py-2 text-xs font-semibold text-white hover:bg-[#17357b] transition-colors"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Message
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMeetingTarget({
                              id: match.partner_id,
                              first_name: match.name,
                              profile_photo_url: match.photo,
                              tier: match.tier,
                            });
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Video className="h-3.5 w-3.5 text-[#1f419a]" />
                          Meet
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUserId(match.partner_id);
                          }}
                          className="flex items-center justify-center rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 transition-colors"
                          title="View profile"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Profile Detail Modal */}
      <ProfileDetailModal
        userId={selectedUserId}
        isOpen={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        onRequestMeeting={(id) => {
          setSelectedUserId(null);
          const match = matches.find((m) => m.partner_id === id);
          if (match) {
            setMeetingTarget({
              id: match.partner_id,
              first_name: match.name,
              profile_photo_url: match.photo,
              tier: match.tier,
            });
          }
        }}
      />

      {/* Meeting Request Modal */}
      {meetingTarget && (
        <MeetingRequestModal
          isOpen={!!meetingTarget}
          onClose={() => setMeetingTarget(null)}
          targetUser={meetingTarget}
          onSuccess={() => {}}
        />
      )}
    </div>
  );
}
