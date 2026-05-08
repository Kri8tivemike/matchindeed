"use client";

/**
 * LikesPage — MatchIndeed
 *
 * Shows likes received and likes sent, with:
 * - Standard dashboard layout (header, sidebar)
 * - Brand-consistent colours (#1f419a)
 * - Two tabs: "Received" / "Sent"
 * - Mutual-match highlighting
 * - Quick actions: Message, Request Meeting, Unlike
 * - Profile detail modal on card click
 * - Meeting request modal
 * - Blocked-user filtering
 */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Heart,
  Loader2,
  X,
  Video,
  Calendar,
  MessageCircle,
  BadgeCheck,
  Inbox,
  ArrowRight,
  Eye,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import ProfileDetailModal from "@/components/ProfileDetailModal";
import MeetingRequestModal from "@/components/MeetingRequestModal";
import { useToast } from "@/components/ToastProvider";
import {
  getMinimumRequestableMeetingStartIso,
  NO_ACTIVE_MEETING_AVAILABILITY_TEXT,
  hasRequestableMeetingAvailability,
} from "@/lib/meetings/request-availability";
import { supabase } from "@/lib/supabase";
import { createActivity, deleteActivity } from "@/lib/activities";
import { getBlockedUserIds } from "@/lib/blocked-users";
import { getVisibleReceivedActivities } from "@/lib/like-counters";
import { toStateCountryLabel } from "@/lib/location";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type LikeProfile = {
  id: string;
  user_id: string;
  name: string;
  age: number | null;
  city: string | null;
  imageUrl: string;
  activity_type: "wink" | "like" | "interested";
  created_at: string;
  is_mutual?: boolean;
  hasCalendarSlots?: boolean;
  tier?: string;
  verified?: boolean;
};

type ViewProfile = {
  id: string;
  user_id: string;
  name: string;
  age: number | null;
  city: string | null;
  imageUrl: string;
  created_at: string;
  hasCalendarSlots: boolean;
  tier: string;
  verified: boolean;
};

type ProfileCard = LikeProfile | ViewProfile;

type ActivityRow = {
  id: string;
  user_id: string;
  target_user_id: string;
  activity_type: "wink" | "like" | "interested";
  created_at: string;
};

type ProfileViewActivityRow = {
  id: string;
  user_id: string;
  target_user_id: string;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  photos: string[] | null;
  profile_photo_url: string | null;
  location: string | null;
  date_of_birth: string | null;
};

type AccountRow = {
  id: string;
  display_name: string | null;
  tier: string | null;
  email_verified: boolean | null;
  account_status?: string | null;
  profile_visible?: boolean | null;
  calendar_enabled?: boolean | null;
};

type AvailabilityRow = {
  user_id: string;
};

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function LikesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "views" ? "views" : "received";
  const [activeTab, setActiveTab] = useState<"received" | "mine" | "views">(initialTab);
  const [receivedLikes, setReceivedLikes] = useState<LikeProfile[]>([]);
  const [myLikes, setMyLikes] = useState<LikeProfile[]>([]);
  const [profileViews, setProfileViews] = useState<ViewProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutualMatches, setMutualMatches] = useState<Set<string>>(new Set());
  const [unlikingIds, setUnlikingIds] = useState<Set<string>>(new Set());
  const [likingBackIds, setLikingBackIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Profile detail modal
  const [selectedProfile, setSelectedProfile] = useState<ProfileCard | null>(null);

  // Meeting request modal
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingTarget, setMeetingTarget] = useState<{
    id: string;
    first_name: string | null;
    profile_photo_url: string | null;
    tier: string;
  } | null>(null);

  // Fallback images
  const fallbacks = ["/placeholder-profile.svg"];
  const fallbackIdx = useRef(0);
  const [cardSrcs, setCardSrcs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (searchParams.get("tab") === "views") {
      setActiveTab("views");
    }
  }, [searchParams]);

  // ---------------------------------------------------------------
  // Fetch all likes
  // ---------------------------------------------------------------
  const fetchLikes = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      try {
        if (!silent) {
          setLoading(true);
        }
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          const nextQuery = searchParams.toString();
          const nextPath = nextQuery ? `${pathname}?${nextQuery}` : pathname;
          router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
          if (!silent) {
            setLoading(false);
          }
          return;
        }

        // 1. Received activities - use the shared visibility helper so the Likes list
        // matches the dashboard/home/mobile counters exactly.
        const visibleReceivedActs = await getVisibleReceivedActivities(user.id);

        // 2. Sent activities
        const { data: sentActs, error: sErr } = await supabase
          .from("user_activities")
          .select("id, user_id, target_user_id, activity_type, created_at")
          .eq("user_id", user.id)
          .in("activity_type", ["wink", "like", "interested"])
          .order("created_at", { ascending: false });
        if (sErr) { setError("Failed to load sent likes."); setLoading(false); return; }

        // 3. Profile views received
        const { data: profileViewRows, error: profileViewError } = await supabase
          .from("user_activities")
          .select("id, user_id, target_user_id, created_at")
          .eq("target_user_id", user.id)
          .eq("activity_type", "profile_view")
          .order("created_at", { ascending: false })
          .limit(100);
        if (profileViewError) {
          console.warn("Failed to load profile views:", profileViewError);
        }

        // 4. Collect user IDs
        const sentActivityRows = (sentActs || []) as ActivityRow[];
        const viewRows = (profileViewRows || []) as ProfileViewActivityRow[];
        const vIds = new Set(
          viewRows
            .map((row) => row.user_id)
            .filter(Boolean)
        );
        const rIds = new Set(visibleReceivedActs.map((a) => a.user_id));
        const sIds = new Set(sentActivityRows.map((a) => a.target_user_id));
        const allIds = Array.from(new Set([...rIds, ...sIds, ...vIds]));
        if (allIds.length === 0) {
          setReceivedLikes([]);
          setMyLikes([]);
          setProfileViews([]);
          setMutualMatches(new Set());
          setLoading(false);
          return;
        }

        // 5. Profiles + accounts + availability
        const [profilesRes, availRes] = await Promise.all([
          supabase.from("user_profiles").select("user_id, first_name, photos, profile_photo_url, location, date_of_birth").in("user_id", allIds),
          supabase.from("meeting_availability").select("user_id").in("user_id", allIds).gte("scheduled_at_utc", getMinimumRequestableMeetingStartIso()),
        ]);

        const { data: accountRows, error: accountsError } = await supabase
          .from("accounts")
          .select(
            "id, display_name, tier, email_verified, account_status, profile_visible, calendar_enabled"
          )
          .in("id", allIds);
        if (accountsError) {
          console.warn("Error fetching account details for likes:", accountsError);
        }
        const accountsData = (accountRows || []) as AccountRow[];

        const profilesMap = new Map(((profilesRes.data || []) as ProfileRow[]).map((p) => [p.user_id, p]));
        const activeAccounts = accountsData.filter(
          (a) => (a.account_status || "active") === "active" && a.profile_visible !== false
        );
        const accountsMap = new Map(activeAccounts.map((a) => [a.id, a]));
        const slotsSet = new Set(((availRes.data || []) as AvailabilityRow[]).map((a) => a.user_id));

        /** Transform an activity row into a LikeProfile */
        const transform = (act: ActivityRow, targetId: string): LikeProfile | null => {
          const prof = profilesMap.get(targetId);
          const acct = accountsMap.get(targetId);
          if (!acct) return null;

          let age: number | null = null;
          if (prof?.date_of_birth) {
            const bd = new Date(prof.date_of_birth);
            const now = new Date();
            age = now.getFullYear() - bd.getFullYear();
            if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
          }

          return {
            id: act.id,
            user_id: targetId,
            name: prof?.first_name || acct?.display_name || "User",
            age,
            city: toStateCountryLabel(prof?.location) || null,
            imageUrl: prof?.photos?.[0] || prof?.profile_photo_url || "/placeholder-profile.svg",
            activity_type: act.activity_type,
            created_at: act.created_at,
            hasCalendarSlots: hasRequestableMeetingAvailability(
              acct,
              slotsSet.has(targetId)
            ),
            tier: acct?.tier || "basic",
            verified: acct?.email_verified || false,
          };
        };

        const blockedIds = await getBlockedUserIds();

        const tReceived = visibleReceivedActs
          .map((a) =>
            transform(
              {
                ...a,
                target_user_id: user.id,
              },
              a.user_id
            )
          )
          .filter((p): p is LikeProfile => p !== null && !blockedIds.has(p.user_id));
        const tSent = sentActivityRows.map((a) => transform(a, a.target_user_id)).filter((p): p is LikeProfile => p !== null && !blockedIds.has(p.user_id));
        const tViews: ViewProfile[] = viewRows
          .map((row): ViewProfile | null => {
            const viewerId = row.user_id;
            if (!viewerId || blockedIds.has(viewerId)) return null;
            const prof = profilesMap.get(viewerId);
            const acct = accountsMap.get(viewerId);
            if (!acct) return null;

            let age: number | null = null;
            if (prof?.date_of_birth) {
              const bd = new Date(prof.date_of_birth);
              const now = new Date();
              age = now.getFullYear() - bd.getFullYear();
              if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
            }

            return {
              id: row.id,
              user_id: viewerId,
              name: prof?.first_name || acct?.display_name || "User",
              age,
              city: toStateCountryLabel(prof?.location) || null,
              imageUrl: prof?.photos?.[0] || prof?.profile_photo_url || "/placeholder-profile.svg",
              created_at: row.created_at,
              hasCalendarSlots: hasRequestableMeetingAvailability(
                acct,
                slotsSet.has(viewerId)
              ),
              tier: acct?.tier || "basic",
              verified: acct?.email_verified || false,
            };
          })
          .filter((p): p is ViewProfile => p !== null);

        // Mutual matches
        const rSet = new Set(tReceived.map((l) => l.user_id));
        const sSet = new Set(tSent.map((l) => l.user_id));
        const mutual = new Set<string>();
        rSet.forEach((id) => { if (sSet.has(id)) mutual.add(id); });

        setMutualMatches(mutual);
        setReceivedLikes(tReceived);
        setMyLikes(tSent.map((l) => ({ ...l, is_mutual: mutual.has(l.user_id) })));
        setProfileViews(tViews);
      } catch (err) {
        console.error("Error fetching likes:", err);
        setError("An unexpected error occurred.");
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    void fetchLikes();
  }, [fetchLikes]);

  useEffect(() => {
    const refreshLikes = () => {
      void fetchLikes({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshLikes();
      }
    };

    window.addEventListener("focus", refreshLikes);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      refreshLikes();
    });

    return () => {
      window.removeEventListener("focus", refreshLikes);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      subscription.unsubscribe();
    };
  }, [fetchLikes]);

  // ---------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------
  const openMeeting = (
    uid: string,
    name: string,
    img: string,
    tier: string,
    canRequestMeeting: boolean
  ) => {
    if (!canRequestMeeting) {
      toast.info(NO_ACTIVE_MEETING_AVAILABILITY_TEXT);
      return;
    }

    setMeetingTarget({ id: uid, first_name: name, profile_photo_url: img, tier });
    setMeetingModalOpen(true);
  };

  const handleUnlike = async (actId: string, uid: string) => {
    try {
      setUnlikingIds((p) => new Set(p).add(actId));
      const res = await deleteActivity(actId);
      if (res.success) {
        setMyLikes((p) => p.filter((l) => l.id !== actId));
        setMutualMatches((p) => { const u = new Set(p); u.delete(uid); return u; });
      } else {
        setError(res.error || "Failed to unlike.");
      }
    } catch { setError("An error occurred."); }
    finally { setUnlikingIds((p) => { const u = new Set(p); u.delete(actId); return u; }); }
  };

  const handleLikeBack = async (profile: ProfileCard) => {
    try {
      setLikingBackIds((prev) => new Set(prev).add(profile.user_id));
      setError(null);

      const response = await createActivity(profile.user_id, "like");
      if (!response.success) {
        setError(response.error || "Failed to send your like. Please try again.");
        return;
      }

      setMutualMatches((prev) => {
        const updated = new Set(prev);
        updated.add(profile.user_id);
        return updated;
      });

      setMyLikes((prev) => {
        const existing = prev.find((item) => item.user_id === profile.user_id);
        if (existing) {
          return prev.map((item) =>
            item.user_id === profile.user_id ? { ...item, is_mutual: true } : item
          );
        }

        return [
          {
            ...profile,
            activity_type: "like",
            is_mutual: true,
          },
          ...prev,
        ];
      });

      toast.match(`It's a match! You and ${profile.name} both like each other!`);
    } catch (err) {
      console.error("Error liking back:", err);
      setError("Failed to send your like. Please try again.");
    } finally {
      setLikingBackIds((prev) => {
        const updated = new Set(prev);
        updated.delete(profile.user_id);
        return updated;
      });
    }
  };

  const handleImgError = (id: string) => {
    if (fallbackIdx.current < fallbacks.length) {
      setCardSrcs((p) => ({ ...p, [id]: fallbacks[fallbackIdx.current] }));
      fallbackIdx.current += 1;
    } else {
      setCardSrcs((p) => ({ ...p, [id]: "/placeholder-profile.svg" }));
    }
  };

  // ---------------------------------------------------------------
  // Shared card renderer
  // ---------------------------------------------------------------
  const renderCard = (l: ProfileCard, variant: "received" | "sent" | "views") => {
    const img = cardSrcs[l.id] || l.imageUrl;
    const isMutual = variant === "received"
      ? mutualMatches.has(l.user_id)
      : variant === "sent"
        ? Boolean((l as LikeProfile).is_mutual)
        : mutualMatches.has(l.user_id);
    const hasLikedBack = myLikes.some((liked) => liked.user_id === l.user_id);
    const canLikeBack = (variant === "received" || variant === "views") && !isMutual && !hasLikedBack;

    return (
      <div
        key={l.id}
        className="group cursor-pointer overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition-all hover:shadow-md"
        onClick={() => setSelectedProfile(l)}
      >
        {/* Mutual badge */}
        {isMutual && (
          <div className="flex items-center gap-1.5 border-b border-emerald-100 bg-emerald-50 px-3 py-1.5">
            <Heart className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">Mutual Match!</span>
          </div>
        )}

        {/* Photo */}
        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={img}
            alt={l.name}
            fill
            sizes="(min-width:1024px) 33vw, (min-width:768px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => handleImgError(l.id)}
          />
        </div>

        {/* Info */}
        <div className="p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-sm font-bold text-gray-900">{l.name}</h3>
                {l.verified && <BadgeCheck className="h-4 w-4 flex-shrink-0 text-[#1f419a]" />}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {l.age !== null ? `${l.age}` : ""}
                {l.age !== null && l.city ? " · " : ""}
                {l.city || ""}
              </p>
            </div>

            {/* Activity badge */}
            {variant === "views" ? (
              <span className="flex-shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                Viewed you
              </span>
            ) : (
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                (l as LikeProfile).activity_type === "interested" ? "bg-amber-50 text-amber-700" :
                (l as LikeProfile).activity_type === "like" ? "bg-pink-50 text-pink-700" :
                "bg-blue-50 text-blue-700"
              }`}>
                {(l as LikeProfile).activity_type === "wink" ? "Wink" : (l as LikeProfile).activity_type === "like" ? "Like" : "Interested"}
              </span>
            )}
          </div>

          {variant === "views" && (
            <p className="mt-1 text-[11px] font-medium text-indigo-600">
              Viewed your profile {new Date(l.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          )}

          {/* Calendar hint */}
          {l.hasCalendarSlots && (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-[#1f419a]">
              <Calendar className="h-3 w-3" />
              <span>Has available slots</span>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {canLikeBack && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLikeBack(l);
                }}
                disabled={likingBackIds.has(l.user_id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:from-pink-600 hover:to-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`Like ${l.name} back`}
              >
                {likingBackIds.has(l.user_id) ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Heart className="h-3.5 w-3.5 fill-white text-white" />
                )}
                Like back
              </button>
            )}
            {isMutual && (
              <Link
                href="/dashboard/messages"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
              >
                <MessageCircle className="h-3 w-3" /> Message
              </Link>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                openMeeting(
                  l.user_id,
                  l.name,
                  l.imageUrl,
                  l.tier || "basic",
                  Boolean(l.hasCalendarSlots)
                );
              }}
              disabled={!l.hasCalendarSlots}
              title={
                l.hasCalendarSlots
                  ? "Request video meeting"
                  : NO_ACTIVE_MEETING_AVAILABILITY_TEXT
              }
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                l.hasCalendarSlots
                  ? "bg-[#1f419a] text-white hover:bg-[#17357b]"
                  : "cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400"
              }`}
            >
              <Video className="h-3 w-3" /> Video meeting
            </button>
            {variant === "sent" && (
              <button
                onClick={(e) => { e.stopPropagation(); handleUnlike(l.id, l.user_id); }}
                disabled={unlikingIds.has(l.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                {unlikingIds.has(l.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                Unlike
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  const currentList = activeTab === "received" ? receivedLikes : activeTab === "views" ? profileViews : myLikes;

  const setTab = (tab: "received" | "mine" | "views") => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "views") {
      params.set("tab", "views");
    } else {
      params.delete("tab");
    }
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/dashboard">
            <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={110} height={28} style={{ width: "auto", height: "auto" }} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 flex-shrink-0">
          <Sidebar active="likes" />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 space-y-5">
          {/* Title row */}
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
              <Heart className="h-7 w-7 text-[#1f419a]" />
              Likes
            </h1>
            <p className="mt-1 text-sm text-gray-500">See who likes you, who viewed you, and people you&apos;ve liked</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(["received", "views", "mine"] as const).map((tab) => {
              const count = tab === "received" ? receivedLikes.length : tab === "views" ? profileViews.length : myLikes.length;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setTab(tab)}
                  className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                    isActive ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab === "received" ? "Received" : tab === "views" ? "Views" : "Sent"}
                  {!loading && (
                    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? "bg-[#1f419a] text-white" : "bg-gray-200 text-gray-600"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              <button onClick={() => window.location.reload()} className="ml-2 underline hover:text-red-900">Reload</button>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-white py-20 shadow-sm ring-1 ring-black/5">
              <Loader2 className="h-7 w-7 animate-spin text-[#1f419a]" />
              <p className="mt-3 text-sm text-gray-400">Loading likes...</p>
            </div>
          ) : currentList.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-white py-16 shadow-sm ring-1 ring-black/5">
              <Inbox className="mb-3 h-14 w-14 text-gray-200" />
              <h3 className="font-semibold text-gray-700">
                {activeTab === "received"
                  ? "No likes received yet"
                  : activeTab === "views"
                    ? "No profile views yet"
                    : "You haven\u2019t liked anyone yet"}
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                {activeTab === "received"
                  ? "Complete your profile to get more likes!"
                  : activeTab === "views"
                    ? "When someone opens your full profile, they will appear here."
                    : "Discover new profiles and send some likes."}
              </p>
              <Link
                href="/dashboard/discover"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-5 py-2.5 text-sm font-semibold text-white shadow-md"
              >
                {activeTab === "received" ? "Edit Profile" : "Discover Matches"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              {/* Mutual matches summary */}
              {mutualMatches.size > 0 && activeTab === "received" && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm ring-1 ring-emerald-200">
                  <Heart className="h-4 w-4 fill-emerald-600 text-emerald-600" />
                  <span className="font-medium text-emerald-800">
                    {mutualMatches.size} mutual match{mutualMatches.size > 1 ? "es" : ""}!
                  </span>
                  <span className="text-emerald-600">You both liked each other.</span>
                </div>
              )}

              {activeTab === "views" && (
                <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2.5 text-sm ring-1 ring-indigo-200">
                  <Eye className="h-4 w-4 text-indigo-600" />
                  <span className="font-medium text-indigo-800">
                    {profileViews.length} profile view{profileViews.length > 1 ? "s" : ""}
                  </span>
                  <span className="text-indigo-600">People who opened your full profile appear here.</span>
                </div>
              )}

              {/* Card grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {currentList.map((l) => renderCard(l, activeTab === "received" ? "received" : activeTab === "views" ? "views" : "sent"))}
              </div>

              {/* CTA at bottom */}
              {(activeTab === "mine" || activeTab === "views") && (
                <div className="text-center">
                  <Link href="/dashboard/discover" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-5 py-2.5 text-sm font-semibold text-white shadow-md">
                    {activeTab === "views" ? "See more profiles" : "Send more likes"} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Profile Detail Modal */}
      <ProfileDetailModal
        userId={selectedProfile?.user_id || null}
        isOpen={!!selectedProfile}
        onClose={() => setSelectedProfile(null)}
        onRequestMeeting={(id) => {
          setSelectedProfile(null);
          const p = [...receivedLikes, ...myLikes, ...profileViews].find((pr) => pr.user_id === id);
          if (p) {
            openMeeting(
              p.user_id,
              p.name,
              p.imageUrl,
              p.tier || "basic",
              Boolean(p.hasCalendarSlots)
            );
          }
        }}
        canRequestMeeting={Boolean(selectedProfile && "hasCalendarSlots" in selectedProfile ? selectedProfile.hasCalendarSlots : false)}
      />

      {/* Meeting Request Modal */}
      {meetingTarget && (
        <MeetingRequestModal
          isOpen={meetingModalOpen}
          onClose={() => { setMeetingModalOpen(false); setMeetingTarget(null); }}
          targetUser={meetingTarget}
          onSuccess={() => setError(null)}
        />
      )}
    </div>
  );
}
