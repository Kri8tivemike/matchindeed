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
  Loader2,
  Sparkles,
  ChevronRight,
  BadgeCheck,
  Users,
  Clock,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import ProfileDetailModal from "@/components/ProfileDetailModal";
import MeetingRequestModal from "@/components/MeetingRequestModal";
import { NO_ACTIVE_MEETING_AVAILABILITY_TEXT } from "@/lib/meetings/request-availability";
import { getActiveStatus } from "@/lib/active-status";
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
  hasCalendarSlots: boolean;
  canRequestMeeting: boolean;
  meetingRequestBlockedReason: string | null;
  partnerLastActiveAt: string | null;
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
  const [error, setError] = useState<{ code?: string; message: string } | null>(
    null
  );
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
      setError(null);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setMatches([]);
        setStats({ total: 0, activity: 0, meeting: 0 });
        return;
      }

      const res = await fetch("/api/matches", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMatches([]);
        setStats({ total: 0, activity: 0, meeting: 0 });
        setError({
          code: data?.error,
          message: data?.message || "Failed to load matches.",
        });
        return;
      }

      const apiMatches = (data.matches || []) as MatchData[];
      // Filter out blocked users (bidirectional)
      const blockedUserIds = await getBlockedUserIds();
      const filteredApiMatches = apiMatches.filter(
        (match) => !blockedUserIds.has(match.partner_id)
      );
      setMatches(filteredApiMatches);
      setStats({
        total: filteredApiMatches.length,
        activity: filteredApiMatches.filter((m) => m.has_activity_match).length,
        meeting: filteredApiMatches.filter((m) => m.has_meeting_match).length,
      });

      // Initialize image sources
      const srcs: Record<string, string> = {};
      for (const m of filteredApiMatches) {
        srcs[m.partner_id] = m.photo || "/placeholder-profile.svg";
      }
      setImgSrcs(srcs);
    } catch (err) {
      console.error("Error fetching matches:", err);
      setError({ message: "Failed to load matches. Please try again." });
      setMatches([]);
      setStats({ total: 0, activity: 0, meeting: 0 });
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
            <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={110} height={28} style={{ width: "auto", height: "auto" }} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-4 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
          <aside className="hidden md:block w-56 flex-shrink-0">
          <Sidebar active="matches" />
        </aside>

        <section className="min-w-0 flex-1 space-y-4 sm:space-y-5">
          {/* Page Header */}
          <div className="rounded-[24px] bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] ring-1 ring-black/5 sm:p-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg shadow-pink-100 sm:h-12 sm:w-12">
                <Heart className="h-5 w-5 fill-white text-white sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-[1.75rem] font-bold leading-8 tracking-[-0.02em] text-gray-900 sm:text-2xl">
                  Mutual Matches
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-6 text-gray-600 sm:text-base">
                  People who are also interested in you. Start a conversation or
                  request a video meeting!
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="-mx-1 mt-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max items-center gap-2 px-1">
              <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-pink-200 bg-pink-50 px-3 py-1.5 text-xs font-medium text-pink-700 sm:gap-2 sm:px-4 sm:text-sm">
                <Heart className="h-3.5 w-3.5 fill-pink-500" />
                <span className="sm:hidden">{stats.total} Matches</span>
                <span className="hidden sm:inline">
                  {stats.total} Total Match{stats.total !== 1 ? "es" : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 sm:gap-2 sm:px-4 sm:text-sm">
                <Sparkles className="h-3.5 w-3.5" />
                <span className="sm:hidden">{stats.activity} Interests</span>
                <span className="hidden sm:inline">
                  {stats.activity} Mutual Interest{stats.activity !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 sm:gap-2 sm:px-4 sm:text-sm">
                <Video className="h-3.5 w-3.5" />
                <span className="sm:hidden">{stats.meeting} Meetings</span>
                <span className="hidden sm:inline">
                  {stats.meeting} Meeting Match{stats.meeting !== 1 ? "es" : ""}
                </span>
              </div>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-center gap-2 px-1">
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
                className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all ${
                  filter === tab.key
                    ? "bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/20"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-[#1f419a]" />
            </div>
          ) : error ? (
            <div className="rounded-[24px] bg-white p-6 text-center shadow-[0_16px_40px_rgba(15,23,42,0.08)] ring-1 ring-black/5 sm:p-8">
              <h2 className="text-lg font-bold text-gray-900">Unable to load matches</h2>
              <p className="mt-2 text-sm text-gray-600">{error.message}</p>
              <div className="mt-5 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                {error.code === "access_denied" && (
                  <Link
                    href="/dashboard/profile/subscription?source=matches"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl"
                  >
                    Upgrade Subscription
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    void fetchMatches();
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="rounded-[24px] bg-white p-7 text-center shadow-[0_16px_40px_rgba(15,23,42,0.08)] ring-1 ring-black/5 sm:p-12">
              <Heart className="mx-auto mb-4 h-14 w-14 text-gray-200 sm:h-16 sm:w-16" />
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
              <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/dashboard/discover"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:shadow-xl"
                >
                  <Sparkles className="h-4 w-4" />
                  Discover Profiles
                </Link>
                <Link
                  href="/dashboard/search"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50"
                >
                  Search
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMatches.map((match) => {
                const imgSrc =
                  imgSrcs[match.partner_id] || "/placeholder-profile.svg";

                return (
                  <div
                    key={match.partner_id}
                    className="group cursor-pointer overflow-hidden rounded-[24px] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)] ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                    onClick={() => setSelectedUserId(match.partner_id)}
                  >
                    <div className="flex gap-3 p-3 sm:block sm:p-0">
                    {/* Photo */}
                    <div className="relative h-32 w-28 flex-shrink-0 overflow-hidden rounded-[20px] sm:h-52 sm:w-full sm:rounded-none">
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
                      <div className="absolute left-2.5 top-2.5 z-10 sm:left-3 sm:top-3">
                        {match.has_meeting_match ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg sm:text-[11px]">
                            <Video className="h-3 w-3" />
                            <span className="hidden sm:inline">Meeting Match</span>
                            <span className="sm:hidden">Meeting</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg sm:text-[11px]">
                            <Heart className="h-3 w-3 fill-white" />
                            <span className="hidden sm:inline">Mutual Match</span>
                            <span className="sm:hidden">Match</span>
                          </span>
                        )}
                      </div>

                      {/* Activity indicators */}
                      {match.your_activity && match.their_activity && (
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 hidden flex-wrap items-center gap-1 sm:flex">
                          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                            You {activityEmoji[match.your_activity]}{" "}
                            {activityLabel[match.your_activity] || match.your_activity}
                          </span>
                          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                            They {activityEmoji[match.their_activity]}{" "}
                            {activityLabel[match.their_activity] || match.their_activity}
                          </span>
                        </div>
                      )}

                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1 space-y-2.5 py-0.5 sm:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-[1.05rem] font-bold text-gray-900 sm:text-lg">
                            {match.name}
                            {match.verified && (
                              <BadgeCheck className="inline-block ml-1.5 h-4.5 w-4.5 text-blue-500" />
                            )}
                          </h3>
                          <div className="text-xs text-gray-600 sm:text-sm">
                            {match.age !== null ? `Age ${match.age}` : ""}
                            {match.age !== null && match.location ? " · " : ""}
                            {match.location || ""}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1 text-[10px] text-gray-400">
                          <Clock className="h-3 w-3" />
                          {timeAgo(match.matched_at)}
                        </div>
                      </div>

                      {match.your_activity && match.their_activity && (
                        <div className="flex flex-wrap items-center gap-1 sm:hidden">
                          <span className="rounded-full bg-pink-50 px-2 py-1 text-[10px] font-medium text-pink-700">
                            You {activityEmoji[match.your_activity]}
                          </span>
                          <span className="rounded-full bg-purple-50 px-2 py-1 text-[10px] font-medium text-purple-700">
                            They {activityEmoji[match.their_activity]}
                          </span>
                        </div>
                      )}

                      {/* Quick tags */}
                      <div className="flex flex-wrap gap-1.5">
                        {match.ethnicity && (
                          <span className="inline-flex items-center rounded-full border border-purple-100 bg-purple-50 px-2 py-1 text-[10px] font-medium text-purple-700">
                            🌍 {match.ethnicity}
                          </span>
                        )}
                        {match.religion && (
                          <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-700">
                            🙏 {match.religion}
                          </span>
                        )}
                        {match.education && (
                          <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
                            🎓 {match.education}
                          </span>
                        )}
                      </div>

                      {/* Last message preview (for meeting matches) */}
                      {match.messaging_enabled && (
                        <div
                          className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            getActiveStatus(match.partnerLastActiveAt).isOnline
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              getActiveStatus(match.partnerLastActiveAt).dotColor
                            }`}
                          />
                          {getActiveStatus(match.partnerLastActiveAt).isOnline
                            ? "Online"
                            : "Offline"}
                        </div>
                      )}

                      {/* Last message preview (for meeting matches) */}
                      {match.last_message_preview && (
                        <div className="truncate rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                          💬 {match.last_message_preview}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        {match.messaging_enabled && match.match_id && (
                          <Link
                            href={`/dashboard/messages/${match.match_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1f419a] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#17357b]"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Message
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (match.canRequestMeeting) {
                              setMeetingTarget({
                                id: match.partner_id,
                                first_name: match.name,
                                profile_photo_url: match.photo,
                                tier: match.tier,
                              });
                            }
                          }}
                          disabled={!match.canRequestMeeting}
                          title={
                            match.canRequestMeeting
                              ? "Request video meeting"
                              : match.meetingRequestBlockedReason ||
                                NO_ACTIVE_MEETING_AVAILABILITY_TEXT
                          }
                          className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition-colors ${
                            match.canRequestMeeting
                              ? "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                              : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                          }`}
                        >
                          <Video className="h-3.5 w-3.5 text-[#1f419a]" />
                          {match.messaging_enabled ? "Chat Active" : "Meet"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUserId(match.partner_id);
                          }}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50"
                          title="View profile"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
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
        canRequestMeeting={Boolean(
          matches.find((match) => match.partner_id === selectedUserId)?.hasCalendarSlots
        )}
        onRequestMeeting={(id) => {
          setSelectedUserId(null);
          const match = matches.find((m) => m.partner_id === id);
          if (match?.hasCalendarSlots) {
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
