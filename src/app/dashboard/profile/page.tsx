"use client";

/**
 * ProfilePage — MatchIndeed
 *
 * Enhanced profile view page with:
 * - Standard dashboard layout (no overlay)
 * - Photo gallery with primary hero + thumbnail grid
 * - Rich detail sections (About, Identity, Languages, Relationship, Lifestyle)
 * - Quick action links (Edit, Preferences, Wallet)
 * - Brand-consistent colors (#1f419a)
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Compass,
  Heart,
  MessageCircle,
  User,
  Sliders,
  Edit3,
  Loader2,
  MapPin,
  Ruler,
  GraduationCap,
  Church,
  Globe,
  Baby,
  Cigarette,
  Sparkles,
  ArrowRight,
  Camera,
  BadgeCheck,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type ProfileData = {
  first_name: string | null;
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
  love_languages: string[] | null;
  relationship_type: string | null;
  relocation_plan: string | null;
  career_stability: string | null;
  long_term_goals: string | null;
  gender: string | null;
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function calcAge(dob: string): number {
  const b = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

function formatHeight(cm: number | null): string {
  if (!cm) return "";
  const feet = Math.floor(cm / 30.48);
  const inches = Math.round((cm % 30.48) / 2.54);
  return `${feet}'${inches}" (${cm} cm)`;
}

function titleCase(s: string | null): string {
  if (!s) return "";
  return s
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [age, setAge] = useState<number | null>(null);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          setLoading(false);
          return;
        }

        const [profileRes, accountRes] = await Promise.all([
          supabase.from("user_profiles").select("*").eq("user_id", user.id).single(),
          supabase.from("accounts").select("email_verified").eq("id", user.id).maybeSingle(),
        ]);

        if (profileRes.error) {
          if (profileRes.error.code !== "PGRST116") {
            console.error("Error fetching profile:", profileRes.error.message);
          }
          setLoading(false);
          return;
        }

        if (profileRes.data) {
          setProfile(profileRes.data as ProfileData);
          if (profileRes.data.date_of_birth) {
            setAge(calcAge(profileRes.data.date_of_birth));
          }
        }
        setVerified(accountRes.data?.email_verified || false);
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  // ---------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="mt-3 text-sm text-gray-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // No profile — onboarding prompt
  // ---------------------------------------------------------------
  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href="/dashboard">
              <Image src="/matchindeed.svg" alt="MatchIndeed" width={130} height={34} style={{ width: "auto", height: "auto" }} />
            </Link>
            <NotificationBell />
          </div>
        </header>
        <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
          <aside className="hidden md:block w-56 flex-shrink-0">
            <Sidebar active="profile" />
          </aside>
          <main className="flex-1 min-w-0">
            <div className="mx-auto max-w-lg py-16 text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#eef2ff]">
                <User className="h-10 w-10 text-[#1f419a]" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Create Your Profile</h1>
              <p className="mt-2 text-sm text-gray-500">
                Complete your profile to start connecting with amazing people.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: Heart, label: "3x more matches" },
                  { icon: Sparkles, label: "Stand out" },
                  { icon: Globe, label: "Better discoveries" },
                ].map(({ icon: Ic, label }) => (
                  <div key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                    <Ic className="mx-auto mb-2 h-5 w-5 text-[#1f419a]" />
                    <p className="text-xs font-medium text-gray-600">{label}</p>
                  </div>
                ))}
              </div>
              <Link
                href="/dashboard/profile/edit"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg"
              >
                <Edit3 className="h-4 w-4" />
                Create My Profile
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Photo helpers
  // ---------------------------------------------------------------
  const primaryPhoto =
    profile.photos && profile.photos.length > 0
      ? profile.photos[0]
      : profile.profile_photo_url || null;
  const allPhotos =
    profile.photos && profile.photos.length > 0
      ? profile.photos
      : profile.profile_photo_url
        ? [profile.profile_photo_url]
        : [];

  // ---------------------------------------------------------------
  // Detail rows
  // ---------------------------------------------------------------
  type DetailRow = { icon: React.ReactNode; label: string; value: string };
  const details: DetailRow[] = [];

  if (profile.gender) details.push({ icon: <User className="h-4 w-4" />, label: "Gender", value: titleCase(profile.gender) });
  if (profile.height_cm) details.push({ icon: <Ruler className="h-4 w-4" />, label: "Height", value: formatHeight(profile.height_cm) });
  if (profile.ethnicity) details.push({ icon: <Globe className="h-4 w-4" />, label: "Ethnicity", value: titleCase(profile.ethnicity) });
  if (profile.religion) details.push({ icon: <Church className="h-4 w-4" />, label: "Religion", value: titleCase(profile.religion) });
  if (profile.education_level) details.push({ icon: <GraduationCap className="h-4 w-4" />, label: "Education", value: titleCase(profile.education_level) });
  if (profile.relationship_status) details.push({ icon: <Heart className="h-4 w-4" />, label: "Status", value: titleCase(profile.relationship_status) });
  if (profile.have_children !== null) details.push({ icon: <Baby className="h-4 w-4" />, label: "Children", value: profile.have_children ? "Has children" : "No children" });
  if (profile.want_children) details.push({ icon: <Baby className="h-4 w-4" />, label: "Wants Children", value: titleCase(profile.want_children) });
  if (profile.smoking_habits) details.push({ icon: <Cigarette className="h-4 w-4" />, label: "Smoking", value: titleCase(profile.smoking_habits) });
  if (profile.relationship_type) details.push({ icon: <Heart className="h-4 w-4" />, label: "Looking For", value: titleCase(profile.relationship_type) });
  if (profile.career_stability) details.push({ icon: <Sparkles className="h-4 w-4" />, label: "Career", value: titleCase(profile.career_stability) });
  if (profile.long_term_goals) details.push({ icon: <Sparkles className="h-4 w-4" />, label: "Goals", value: titleCase(profile.long_term_goals) });
  if (profile.relocation_plan) details.push({ icon: <MapPin className="h-4 w-4" />, label: "Relocation", value: titleCase(profile.relocation_plan) });

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
          <Sidebar active="profile" />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 space-y-5">
          {/* Profile completeness */}
          <ProfileCompletenessCard variant="full" showWhenComplete />

          {/* ---- Hero card ---- */}
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="grid gap-0 lg:grid-cols-[340px_1fr]">
              {/* Photo column */}
              <div className="relative bg-gray-100">
                {primaryPhoto ? (
                  <Image
                    src={primaryPhoto}
                    alt={profile.first_name || "Profile"}
                    width={340}
                    height={420}
                    className="h-[320px] w-full object-cover lg:h-full"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-[320px] items-center justify-center lg:h-full">
                    <div className="text-center">
                      <Camera className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                      <p className="text-xs text-gray-400">No photo</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Info column */}
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                      {profile.first_name || "User"}
                      {verified && (
                        <BadgeCheck className="h-5 w-5 text-blue-500" />
                      )}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                      {age !== null && <span className="font-medium">{age} years</span>}
                      {profile.location && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="flex items-center gap-1">
                            <Compass className="h-3.5 w-3.5" />
                            {profile.location}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Link
                    href="/dashboard/profile/edit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f419a] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#17357b]"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </Link>
                </div>

                {/* About */}
                {(profile.about_yourself || profile.personality_type) && (
                  <div className="mt-4">
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      About Me
                    </h3>
                    <p className="text-sm leading-relaxed text-gray-700">
                      {profile.about_yourself || profile.personality_type}
                    </p>
                  </div>
                )}

                {/* Languages */}
                {profile.languages && profile.languages.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Languages
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.languages.map((lang, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full bg-[#eef2ff] px-2.5 py-1 text-[11px] font-medium text-[#1f419a]"
                        >
                          <MessageCircle className="h-3 w-3" />
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Love languages */}
                {profile.love_languages && profile.love_languages.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Love Languages
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.love_languages.map((ll, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-medium text-pink-600"
                        >
                          <Heart className="h-3 w-3" />
                          {ll}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick links */}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href="/dashboard/profile/preferences"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    Preferences
                  </Link>
                  <Link
                    href="/dashboard/profile/wallet"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Wallet
                  </Link>
                  <Link
                    href="/dashboard/profile/subscription"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    Subscription
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* ---- Photo gallery ---- */}
          {allPhotos.length > 1 && (
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Camera className="h-4 w-4 text-[#1f419a]" />
                Photos
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                  {allPhotos.length}
                </span>
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {allPhotos.map((photo, i) => (
                  <div
                    key={i}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100"
                  >
                    <Image
                      src={photo}
                      alt={`Photo ${i + 1}`}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      unoptimized
                    />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-[#1f419a] px-1.5 py-0.5 text-[9px] font-bold text-white">
                        Primary
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- Details grid ---- */}
          {details.length > 0 && (
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Profile Details</h3>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {details.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#eef2ff] text-[#1f419a]">
                      {d.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                        {d.label}
                      </p>
                      <p className="truncate text-sm font-medium text-gray-900">{d.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
