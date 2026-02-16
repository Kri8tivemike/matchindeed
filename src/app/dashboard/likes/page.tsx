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
import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import ProfileDetailModal from "@/components/ProfileDetailModal";
import MeetingRequestModal from "@/components/MeetingRequestModal";
import { supabase } from "@/lib/supabase";
import { deleteActivity } from "@/lib/activities";
import { getBlockedUserIds } from "@/lib/blocked-users";

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

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function LikesPage() {
  const [activeTab, setActiveTab] = useState<"received" | "mine">("received");
  const [receivedLikes, setReceivedLikes] = useState<LikeProfile[]>([]);
  const [myLikes, setMyLikes] = useState<LikeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutualMatches, setMutualMatches] = useState<Set<string>>(new Set());
  const [unlikingIds, setUnlikingIds] = useState<Set<string>>(new Set());

  // Profile detail modal
  const [selectedProfile, setSelectedProfile] = useState<LikeProfile | null>(null);

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

  // ---------------------------------------------------------------
  // Fetch all likes
  // ---------------------------------------------------------------
  useEffect(() => {
    const fetchLikes = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        // 1. Received activities
        const { data: receivedActs, error: rErr } = await supabase
          .from("user_activities")
          .select("id, user_id, target_user_id, activity_type, created_at")
          .eq("target_user_id", user.id)
          .in("activity_type", ["wink", "like", "interested"])
          .order("created_at", { ascending: false });
        if (rErr) { setError("Failed to load received likes."); setLoading(false); return; }

        // 2. Sent activities
        const { data: sentActs, error: sErr } = await supabase
          .from("user_activities")
          .select("id, user_id, target_user_id, activity_type, created_at")
          .eq("user_id", user.id)
          .in("activity_type", ["wink", "like", "interested"])
          .order("created_at", { ascending: false });
        if (sErr) { setError("Failed to load sent likes."); setLoading(false); return; }

        // 3. Collect user IDs
        const rIds = new Set((receivedActs || []).map((a: any) => a.user_id));
        const sIds = new Set((sentActs || []).map((a: any) => a.target_user_id));
        const allIds = Array.from(new Set([...rIds, ...sIds]));
        if (allIds.length === 0) { setReceivedLikes([]); setMyLikes([]); setMutualMatches(new Set()); setLoading(false); return; }

        // 4. Profiles + accounts + availability
        const [profilesRes, accountsRes, availRes] = await Promise.all([
          supabase.from("user_profiles").select("user_id, first_name, photos, profile_photo_url, location, date_of_birth").in("user_id", allIds),
          supabase.from("accounts").select("id, display_name, tier, email_verified").in("id", allIds),
          supabase.from("meeting_availability").select("user_id").in("user_id", allIds).gte("slot_date", new Date().toISOString().split("T")[0]),
        ]);

        const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p]));
        const accountsMap = new Map((accountsRes.data || []).map((a: any) => [a.id, a]));
        const slotsSet = new Set((availRes.data || []).map((a: any) => a.user_id));

        /** Transform an activity row into a LikeProfile */
        const transform = (act: any, targetId: string): LikeProfile | null => {
          const prof = profilesMap.get(targetId);
          const acct = accountsMap.get(targetId);
          if (!prof && !acct) return null;

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
            city: prof?.location || null,
            imageUrl: prof?.photos?.[0] || prof?.profile_photo_url || "/placeholder-profile.svg",
            activity_type: act.activity_type,
            created_at: act.created_at,
            hasCalendarSlots: slotsSet.has(targetId),
            tier: acct?.tier || "basic",
            verified: acct?.email_verified || false,
          };
        };

        const blockedIds = await getBlockedUserIds();

        const tReceived = (receivedActs || []).map((a: any) => transform(a, a.user_id)).filter((p): p is LikeProfile => p !== null && !blockedIds.has(p.user_id));
        const tSent = (sentActs || []).map((a: any) => transform(a, a.target_user_id)).filter((p): p is LikeProfile => p !== null && !blockedIds.has(p.user_id));

        // Mutual matches
        const rSet = new Set(tReceived.map((l) => l.user_id));
        const sSet = new Set(tSent.map((l) => l.user_id));
        const mutual = new Set<string>();
        rSet.forEach((id) => { if (sSet.has(id)) mutual.add(id); });

        setMutualMatches(mutual);
        setReceivedLikes(tReceived);
        setMyLikes(tSent.map((l) => ({ ...l, is_mutual: mutual.has(l.user_id) })));
      } catch (err) {
        console.error("Error fetching likes:", err);
        setError("An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    };

    fetchLikes();
  }, []);

  // ---------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------
  const openMeeting = (uid: string, name: string, img: string, tier: string) => {
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
  const renderCard = (l: LikeProfile, variant: "received" | "sent") => {
    const img = cardSrcs[l.id] || l.imageUrl;
    const isMutual = variant === "received" ? mutualMatches.has(l.user_id) : l.is_mutual;

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
            <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              l.activity_type === "interested" ? "bg-amber-50 text-amber-700" :
              l.activity_type === "like" ? "bg-pink-50 text-pink-700" :
              "bg-blue-50 text-blue-700"
            }`}>
              {l.activity_type === "wink" ? "Wink" : l.activity_type === "like" ? "Like" : "Interested"}
            </span>
          </div>

          {/* Calendar hint */}
          {l.hasCalendarSlots && (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-[#1f419a]">
              <Calendar className="h-3 w-3" />
              <span>Has available slots</span>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-1.5">
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
              onClick={(e) => { e.stopPropagation(); openMeeting(l.user_id, l.name, l.imageUrl, l.tier || "basic"); }}
              className="inline-flex items-center gap-1 rounded-lg bg-[#1f419a] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#17357b]"
            >
              <Video className="h-3 w-3" /> Meeting
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
  const currentList = activeTab === "received" ? receivedLikes : myLikes;

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
            <p className="mt-1 text-sm text-gray-500">See who likes you and people you&apos;ve liked</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(["received", "mine"] as const).map((tab) => {
              const count = tab === "received" ? receivedLikes.length : myLikes.length;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                    isActive ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab === "received" ? "Received" : "Sent"}
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
                {activeTab === "received" ? "No likes received yet" : "You haven\u2019t liked anyone yet"}
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                {activeTab === "received"
                  ? "Complete your profile to get more likes!"
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

              {/* Card grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {currentList.map((l) => renderCard(l, activeTab === "received" ? "received" : "sent"))}
              </div>

              {/* CTA at bottom */}
              {activeTab === "mine" && (
                <div className="text-center">
                  <Link href="/dashboard/discover" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-5 py-2.5 text-sm font-semibold text-white shadow-md">
                    Send more likes <ArrowRight className="h-4 w-4" />
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
          const p = [...receivedLikes, ...myLikes].find((pr) => pr.user_id === id);
          if (p) openMeeting(p.user_id, p.name, p.imageUrl, p.tier || "basic");
        }}
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
