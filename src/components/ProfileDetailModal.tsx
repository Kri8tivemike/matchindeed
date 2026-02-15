"use client";

/**
 * ProfileDetailModal
 *
 * A full-screen overlay that shows a detailed profile view when a
 * user clicks on a profile card in search/discover. Fetches complete
 * profile data on open and displays photos, bio, details, match
 * percentage, and action buttons (Wink, Interested, Request Meeting).
 *
 * Usage:
 *   <ProfileDetailModal
 *     userId="uuid"
 *     isOpen={true}
 *     onClose={() => {}}
 *     matchScore={85}
 *     matchLabel="Excellent Match"
 *     matchColor="text-emerald-700"
 *     matchBgColor="bg-emerald-50 border-emerald-200"
 *     onRequestMeeting={(id) => {}}
 *   />
 */

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import {
  X,
  Heart,
  Video,
  MapPin,
  Calendar,
  User,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Ruler,
  BookOpen,
  Globe,
  Sparkles,
  Baby,
  Cigarette,
  GraduationCap,
  Languages,
  Users,
  Target,
  Compass,
  Flame,
  ShieldCheck,
  Flag,
  BadgeCheck,
  Ban,
  AlertTriangle,
  Loader2 as Spinner,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import ReportUserModal from "@/components/ReportUserModal";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type FullProfile = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  location: string | null;
  height_cm: number | null;
  ethnicity: string | null;
  religion: string | null;
  education_level: string | null;
  languages: string[] | null;
  relationship_status: string | null;
  have_children: boolean | null;
  want_children: string | null;
  smoking_habits: string | null;
  about_yourself: string | null;
  personality_type: string | null;
  photos: string[] | null;
  profile_photo_url: string | null;
  relationship_type: string | null;
  career_stability: string | null;
  long_term_goals: string | null;
  emotional_connection: string | null;
  love_languages: string[] | null;
  willing_to_relocate: string | null;
  ready_for_marriage: string | null;
  gender: string | null;
};

interface ProfileDetailModalProps {
  /** The user_id of the profile to display */
  userId: string | null;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Pre-computed match score from parent */
  matchScore?: number;
  matchLabel?: string;
  matchColor?: string;
  matchBgColor?: string;
  /** Action handlers */
  onRequestMeeting?: (userId: string) => void;
}

// ---------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------

function calculateAge(dob: string): number | null {
  try {
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  } catch {
    return null;
  }
}

function formatHeight(cm: number | null): string {
  if (!cm) return "Not specified";
  const feet = Math.floor(cm / 30.48);
  const inches = Math.round((cm % 30.48) / 2.54);
  return `${feet}'${inches}" · ${cm} cm`;
}

function formatLabel(value: string | null): string {
  if (!value) return "Not specified";
  return value
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------

export default function ProfileDetailModal({
  userId,
  isOpen,
  onClose,
  matchScore,
  matchLabel,
  matchColor,
  matchBgColor,
  onRequestMeeting,
}: ProfileDetailModalProps) {
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [verified, setVerified] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  /**
   * Fetch full profile data and account verification status when modal opens
   */
  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setPhotoIndex(0);
    setVerified(false);
    setIsBlocked(false);

    try {
      // Get current user session for block check
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;

      // Fetch profile, account data, and block status in parallel
      const promises: Promise<unknown>[] = [
        supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("accounts")
          .select("email_verified")
          .eq("id", userId)
          .maybeSingle(),
      ];

      // Check if this user is already blocked by the current user
      if (currentUserId) {
        promises.push(
          supabase
            .from("blocked_users")
            .select("id")
            .eq("blocker_id", currentUserId)
            .eq("blocked_id", userId)
            .maybeSingle()
        );
      }

      const results = await Promise.all(promises);

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const profileRes = results[0] as any;
      const accountRes = results[1] as any;
      const blockRes = results[2] as any;
      /* eslint-enable @typescript-eslint/no-explicit-any */

      if (profileRes.error) {
        console.error("Error fetching profile detail:", profileRes.error);
      }
      setProfile(profileRes.data || null);
      setVerified(accountRes.data?.email_verified || false);
      // blockRes may be undefined if currentUserId was null, or error if table doesn't exist
      setIsBlocked(blockRes?.data ? true : false);
    } catch (err) {
      console.error("Error in fetchProfile:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isOpen && userId) {
      fetchProfile();
    }
    if (!isOpen) {
      setProfile(null);
    }
  }, [isOpen, userId, fetchProfile]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  /**
   * Block or unblock the viewed user
   */
  const handleBlockToggle = async () => {
    if (!userId) return;
    setBlocking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (isBlocked) {
        // Unblock
        const res = await fetch(`/api/profile/block?blocked_id=${userId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          setIsBlocked(false);
          setShowBlockConfirm(false);
        }
      } else {
        // Block
        const res = await fetch("/api/profile/block", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ blocked_id: userId }),
        });
        if (res.ok) {
          setIsBlocked(true);
          setShowBlockConfirm(false);
          // Close modal after blocking — the user won't appear in feeds anymore
          setTimeout(() => onClose(), 600);
        }
      }
    } catch (err) {
      console.error("Error toggling block:", err);
    } finally {
      setBlocking(false);
    }
  };

  if (!isOpen) return null;

  // Derived data
  const age = profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null;
  const name = profile?.first_name || "User";

  // Photos array
  const photos: string[] = [];
  if (profile?.photos && profile.photos.length > 0) {
    photos.push(...profile.photos);
  } else if (profile?.profile_photo_url) {
    photos.push(profile.profile_photo_url);
  }

  const hasPhotos = photos.length > 0;

  // Build detail items
  const details: { icon: React.ReactNode; label: string; value: string }[] = [];

  if (profile?.height_cm) {
    details.push({ icon: <Ruler className="h-4 w-4" />, label: "Height", value: formatHeight(profile.height_cm) });
  }
  if (profile?.ethnicity) {
    details.push({ icon: <Globe className="h-4 w-4" />, label: "Ethnicity", value: profile.ethnicity });
  }
  if (profile?.religion) {
    details.push({ icon: <BookOpen className="h-4 w-4" />, label: "Religion", value: profile.religion });
  }
  if (profile?.education_level) {
    details.push({ icon: <GraduationCap className="h-4 w-4" />, label: "Education", value: profile.education_level });
  }
  if (profile?.relationship_status) {
    details.push({ icon: <Heart className="h-4 w-4" />, label: "Status", value: formatLabel(profile.relationship_status) });
  }
  if (profile?.relationship_type) {
    details.push({ icon: <Target className="h-4 w-4" />, label: "Looking For", value: formatLabel(profile.relationship_type) });
  }
  if (profile?.have_children !== null && profile?.have_children !== undefined) {
    details.push({ icon: <Baby className="h-4 w-4" />, label: "Has Children", value: profile.have_children ? "Yes" : "No" });
  }
  if (profile?.want_children) {
    details.push({ icon: <Baby className="h-4 w-4" />, label: "Wants Children", value: formatLabel(profile.want_children) });
  }
  if (profile?.smoking_habits) {
    details.push({ icon: <Cigarette className="h-4 w-4" />, label: "Smoking", value: formatLabel(profile.smoking_habits) });
  }
  if (profile?.willing_to_relocate) {
    details.push({ icon: <Compass className="h-4 w-4" />, label: "Relocation", value: formatLabel(profile.willing_to_relocate) });
  }
  if (profile?.ready_for_marriage) {
    details.push({ icon: <Flame className="h-4 w-4" />, label: "Marriage Ready", value: formatLabel(profile.ready_for_marriage) });
  }
  if (profile?.career_stability) {
    details.push({ icon: <ShieldCheck className="h-4 w-4" />, label: "Career", value: formatLabel(profile.career_stability) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative z-10 flex h-[92vh] w-[95vw] max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-3">
            {matchScore !== undefined && matchScore > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${matchBgColor || "bg-gray-50 border-gray-200"} ${matchColor || "text-gray-600"}`}
              >
                {matchScore >= 70 ? "🔥" : matchScore >= 50 ? "✨" : "👋"}
                {matchScore}% · {matchLabel || "Match"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-[#1f419a]" />
            </div>
          ) : !profile ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <User className="h-16 w-16 mb-4 text-gray-300" />
              <p>Profile not found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              {/* Left: Photo Gallery */}
              <div className="relative bg-gray-100 min-h-[300px] md:min-h-full">
                {hasPhotos ? (
                  <>
                    <Image
                      src={photos[photoIndex]}
                      alt={`${name}'s photo`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {/* Photo navigation */}
                    {photos.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setPhotoIndex((prev) =>
                              prev > 0 ? prev - 1 : photos.length - 1
                            )
                          }
                          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg hover:bg-white transition"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPhotoIndex((prev) =>
                              prev < photos.length - 1 ? prev + 1 : 0
                            )
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg hover:bg-white transition"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                        {/* Photo dots */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                          {photos.map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setPhotoIndex(i)}
                              className={`h-2 rounded-full transition-all ${
                                i === photoIndex
                                  ? "w-6 bg-white"
                                  : "w-2 bg-white/50 hover:bg-white/80"
                              }`}
                            />
                          ))}
                        </div>
                        {/* Photo count */}
                        <div className="absolute top-4 right-4 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">
                          {photoIndex + 1} / {photos.length}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex h-full min-h-[300px] items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-[#1f419a] to-[#2a44a3] flex items-center justify-center mb-3">
                        <User className="h-10 w-10 text-white" />
                      </div>
                      <p className="text-sm text-gray-400">No photos</p>
                    </div>
                  </div>
                )}

                {/* Photo thumbnails strip */}
                {photos.length > 1 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent px-4 pb-10 pt-8">
                    <div className="flex gap-2 overflow-x-auto">
                      {photos.map((photo, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPhotoIndex(i)}
                          className={`relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg ring-2 transition-all ${
                            i === photoIndex
                              ? "ring-white shadow-lg scale-110"
                              : "ring-white/40 hover:ring-white/70"
                          }`}
                        >
                          <Image
                            src={photo}
                            alt={`Photo ${i + 1}`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Profile Info */}
              <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
                {/* Name / Age / Location */}
                <div>
                  <h2 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
                    {name}
                    {verified && (
                      <BadgeCheck className="h-6 w-6 text-blue-500 flex-shrink-0" title="Verified profile" />
                    )}
                    {age !== null && (
                      <span className="text-2xl font-normal text-gray-500">
                        {age}
                      </span>
                    )}
                  </h2>
                  {profile.location && (
                    <div className="mt-1 flex items-center gap-1.5 text-gray-600">
                      <MapPin className="h-4 w-4" />
                      <span>{profile.location}</span>
                    </div>
                  )}
                  {profile.gender && (
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                      <Users className="h-3 w-3" />
                      {formatLabel(profile.gender)}
                    </span>
                  )}
                </div>

                {/* About */}
                {(profile.about_yourself || profile.personality_type) && (
                  <div className="rounded-xl bg-gradient-to-br from-[#1f419a]/5 to-[#2a44a3]/5 border border-[#1f419a]/10 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#1f419a]" />
                      About Me
                    </h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {profile.about_yourself || profile.personality_type}
                    </p>
                  </div>
                )}

                {/* Languages */}
                {profile.languages && profile.languages.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Languages className="h-3.5 w-3.5" />
                      Languages
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.languages.map((lang, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-full bg-[#2a44a3]/10 border border-[#2a44a3]/20 px-3 py-1 text-xs font-medium text-[#2a44a3]"
                        >
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Love Languages */}
                {profile.love_languages && profile.love_languages.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Heart className="h-3.5 w-3.5" />
                      Love Languages
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.love_languages.map((lang, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-full bg-pink-50 border border-pink-200 px-3 py-1 text-xs font-medium text-pink-700"
                        >
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Long-term Goals */}
                {profile.long_term_goals && (
                  <div className="rounded-xl bg-amber-50/50 border border-amber-200/50 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                      <Target className="h-4 w-4 text-amber-600" />
                      Long-term Goals
                    </h3>
                    <p className="text-sm text-gray-700">{profile.long_term_goals}</p>
                  </div>
                )}

                {/* Emotional Connection */}
                {profile.emotional_connection && (
                  <div className="rounded-xl bg-rose-50/50 border border-rose-200/50 p-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                      <Flame className="h-4 w-4 text-rose-500" />
                      Emotional Connection
                    </h3>
                    <p className="text-sm text-gray-700">{profile.emotional_connection}</p>
                  </div>
                )}

                {/* Detail Grid */}
                {details.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Profile Details
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {details.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5"
                        >
                          <div className="mt-0.5 text-gray-400 flex-shrink-0">
                            {d.icon}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                              {d.label}
                            </div>
                            <div className="text-xs font-medium text-gray-800 truncate">
                              {d.value}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer — Action Buttons */}
        {profile && (
          <div className="border-t border-gray-100 bg-white px-5 py-3">
            <div className="flex items-center gap-3">
              {/* Request Meeting */}
              <button
                type="button"
                onClick={() => onRequestMeeting?.(userId!)}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
              >
                <Video className="h-4 w-4" />
                Request Meeting
              </button>

              {/* Block User */}
              <button
                type="button"
                onClick={() => setShowBlockConfirm(true)}
                className={`flex items-center justify-center rounded-xl py-2.5 px-3 text-sm font-medium border transition-all ${
                  isBlocked
                    ? "text-red-600 border-red-300 bg-red-50"
                    : "text-gray-400 border-gray-200 hover:text-red-500 hover:border-red-200 hover:bg-red-50"
                }`}
                title={isBlocked ? "Unblock user" : "Block user"}
              >
                <Ban className="h-4 w-4" />
              </button>

              {/* Report User */}
              <button
                type="button"
                onClick={() => setShowReportModal(true)}
                className="flex items-center justify-center rounded-xl py-2.5 px-3 text-sm font-medium text-gray-400 border border-gray-200 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all"
                title="Report user"
              >
                <Flag className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Block Confirmation Modal */}
        {showBlockConfirm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mx-auto">
                {isBlocked ? (
                  <Ban className="h-6 w-6 text-red-600" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                )}
              </div>
              <h3 className="text-center text-lg font-bold text-gray-900">
                {isBlocked ? "Unblock" : "Block"} {name}?
              </h3>
              <p className="mt-2 text-center text-sm text-gray-500">
                {isBlocked
                  ? `${name} will be able to see your profile and interact with you again.`
                  : `${name} won\u2019t be able to see your profile, send you messages, or appear in your feed. This can be undone later.`}
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowBlockConfirm(false)}
                  disabled={blocking}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBlockToggle}
                  disabled={blocking}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                    isBlocked
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {blocking && <Spinner className="h-4 w-4 animate-spin" />}
                  {isBlocked ? "Unblock" : "Block"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Report User Modal */}
        <ReportUserModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportedUserId={userId!}
          reportedUserName={name}
        />
      </div>
    </div>
  );
}
