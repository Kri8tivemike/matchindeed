"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, EyeOff, Mail, Compass, Heart, Search as SearchIcon, MessageCircle, User, Pencil, X, Heart as HeartIcon, Eye } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { supabase } from "@/lib/supabase";

type ProfileData = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
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
  career_stability: string | null;
  long_term_goals: string | null;
  emotional_connection: string | null;
  love_languages: string[] | null;
  ready_for_marriage: string | null;
  willing_to_relocate: string | null;
  relationship_type: string | null;
  profile_photo_url: string | null;
  photos: string[] | null;
  user_id: string;
  // Preference fields
  partner_location: string | null;
  partner_age_range: string | null;
  partner_height_min_cm: number | null;
  partner_height_max_cm: number | null;
  partner_ethnicity: string[] | null;
  partner_religion: string[] | null;
  partner_education: string[] | null;
  partner_have_children: string | null;
  partner_want_children: string | null;
  partner_smoking: string | null;
  partner_drinking: string | null;
  partner_diet: string | null;
  partner_employment: string | null;
  partner_experience: string | null;
  partner_pets: string | null;
  partner_plans: string | null;
};

type AccountInfo = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export default function MyAccountPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [age, setAge] = useState<number | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          return;
        }

        // Fetch profile data - get all fields from both profile and preferences forms
        const { data: profileData, error: profileError } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (profileError && profileError.code !== "PGRST116") {
          console.error("Profile error:", profileError);
        }

        if (profileData) {
          setProfile(profileData);
          
          // Calculate age from date_of_birth
          if (profileData.date_of_birth) {
            const birthDate = new Date(profileData.date_of_birth);
            const today = new Date();
            let calculatedAge = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              calculatedAge--;
            }
            setAge(calculatedAge);
          }
        }

        // Fetch account data
        const { data: accountData, error: accountError } = await supabase
          .from("accounts")
          .select("*")
          .eq("id", user.id)
          .single();

        if (accountError && accountError.code !== "PGRST116") {
          console.error("Account error:", accountError);
        }

        if (accountData) {
          setAccount(accountData);
        } else {
          // Fallback to auth user email
          setAccount({
            id: user.id,
            email: user.email || null,
            display_name: user.email?.split("@")[0] || null,
          });
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Refresh data when component becomes visible (user returns to page)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const fetchData = async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: profileData } = await supabase
              .from("user_profiles")
              .select("*")
              .eq("user_id", user.id)
              .single();

            if (profileData) {
              setProfile(profileData);
              if (profileData.date_of_birth) {
                const birthDate = new Date(profileData.date_of_birth);
                const today = new Date();
                let calculatedAge = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                  calculatedAge--;
                }
                setAge(calculatedAge);
              }
            }
          } catch (error) {
            console.error("Error refreshing data:", error);
          }
        };
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-[#eaf0ff] to-[#f7f9ff] flex items-center justify-center">
        <div className="text-gray-600">Loading account...</div>
      </div>
    );
  }

  const primaryPhoto = profile?.photos && profile.photos.length > 0 
    ? profile.photos[0] 
    : profile?.profile_photo_url 
    ? profile.profile_photo_url 
    : "https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?auto=format&fit=crop&w=800&q=80";

  const formatGender = (gender: string | null): string => {
    if (!gender) return "Not specified";
    const genderMap: Record<string, string> = {
      male: "Male",
      female: "Female",
      other: "Other",
      prefer_not_to_say: "Prefer not to say",
    };
    return genderMap[gender.toLowerCase()] || gender.charAt(0).toUpperCase() + gender.slice(1).replace(/_/g, " ");
  };

  const formatHeight = (cm: number | null): string => {
    if (!cm) return "Not specified";
    const feet = Math.floor(cm / 30.48);
    const inches = Math.round((cm % 30.48) / 2.54);
    return `${feet}'${inches}" (${cm} cm)`;
  };

  const formatValue = (value: string | null | boolean | string[]): string => {
    if (value === null || value === undefined) return "Not set";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "Not set";
    if (typeof value === "string") {
      // Format database values to readable format
      return value
        .replace(/_/g, " ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }
    return String(value);
  };

  const formatDate = (date: string | null): string => {
    if (!date) return "Not set";
    try {
      const d = new Date(date);
      return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    } catch {
      return date;
    }
  };

  // Generate customer number from user_id (first 9 characters)
  const customerNumber = profile?.user_id ? profile.user_id.substring(0, 9).toUpperCase() : "N/A";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative h-full w-full overflow-y-auto bg-gradient-to-b from-[#eaf0ff] to-[#f7f9ff]">
        {/* Header with Close Button */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/50 bg-white/90 backdrop-blur-md px-3 sm:px-6 py-3 sm:py-4 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3">
            <Image src="/matchindeed.svg" alt="Matchindeed" width={120} height={30} className="sm:w-[140px] sm:h-[36px]" />
          </div>
          <Link
            href="/dashboard/profile"
            className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-white/80 text-gray-600 hover:bg-white hover:text-gray-900 transition-colors shadow-sm"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </Link>
        </div>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6 lg:px-8">
        <section>
          <div className="space-y-4 sm:space-y-6 pb-6 sm:pb-8">
            {/* Header Card */}
            <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#1f419a] to-[#4463cf] p-4 sm:p-6 lg:p-8 text-white shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                  <div className="relative flex-shrink-0">
                    <div className="h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24 rounded-lg sm:rounded-xl overflow-hidden ring-2 sm:ring-4 ring-white/20 shadow-lg">
                      <Image
                        src={primaryPhoto}
                        alt="Profile"
                        width={96}
                        height={96}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 rounded-full bg-green-500 border-2 border-white"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">{profile?.first_name || account?.display_name || "User"}</h1>
                    <p className="text-white/90 mt-1 text-xs sm:text-sm lg:text-base truncate">
                      {age !== null && `Age ${age}`}
                      {profile?.location && ` • ${profile.location}`}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="inline-flex items-center rounded-full bg-white/20 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium">
                        {formatGender(profile?.gender || null)}
                      </span>
                      {profile?.relationship_status && (
                        <span className="inline-flex items-center rounded-full bg-white/20 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium">
                          {formatValue(profile.relationship_status)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Link 
                  href="/dashboard/profile/edit" 
                  className="inline-flex items-center gap-2 rounded-lg sm:rounded-xl bg-white text-[#1f419a] px-3 sm:px-4 lg:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl w-full sm:w-auto justify-center"
                >
                  <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Edit Profile
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
              {/* Left Column - Quick Info */}
              <div className="lg:col-span-1 space-y-4">

                {/* Quick Stats Card */}
                <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 shadow-sm ring-1 ring-gray-200">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 sm:mb-4">Quick Info</h3>
                  <div className="space-y-2.5 sm:space-y-3">
                    <div className="flex items-center justify-between py-1.5 sm:py-2 border-b border-gray-100">
                      <span className="text-[10px] sm:text-xs lg:text-sm text-gray-600">Customer ID</span>
                      <span className="text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-900 break-all text-right ml-2">{customerNumber}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 sm:py-2 border-b border-gray-100">
                      <span className="text-[10px] sm:text-xs lg:text-sm text-gray-600">Email</span>
                      <span className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-900 truncate max-w-[100px] sm:max-w-[120px] lg:max-w-[150px] ml-2">{account?.email || "Not set"}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 sm:py-2">
                      <span className="text-[10px] sm:text-xs lg:text-sm text-gray-600">Member Since</span>
                      <span className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-900">
                        {profile?.date_of_birth ? new Date(profile.date_of_birth).getFullYear() : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Profile Completion Card */}
                <div className="rounded-lg sm:rounded-xl bg-gradient-to-br from-[#eef2ff] to-white p-4 sm:p-5 shadow-sm ring-1 ring-gray-200">
                  <h3 className="text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-900 mb-2.5 sm:mb-3">Profile Status</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs text-gray-600">Profile Complete</span>
                      <span className="text-[10px] sm:text-xs font-semibold text-green-600">✓ Complete</span>
                    </div>
                    <div className="h-1.5 sm:h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#1f419a] to-[#4463cf] rounded-full" style={{ width: "100%" }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Content - All Sections */}
              <div className="lg:col-span-2 space-y-3 sm:space-y-4 lg:space-y-6">
                {/* Basic Information */}
                <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-200">
                  <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-5">
                    <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">Basic Information</h3>
                    <Link href="/dashboard/profile/edit" className="text-[10px] sm:text-xs lg:text-sm text-[#1f419a] hover:text-[#17357b] font-medium">
                      Edit
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:gap-3 lg:gap-4 sm:grid-cols-2">
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">First Name</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{profile?.first_name || "Not set"}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Last Name</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{profile?.last_name || "Not set"}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Date of Birth</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatDate(profile?.date_of_birth || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Age</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">{age !== null ? `${age} years old` : "Not set"}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Location</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{profile?.location || "Not set"}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Height</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">{formatHeight(profile?.height_cm || null)}</div>
                    </div>
                  </div>
                </div>

                {/* Background & Education */}
                <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-200">
                  <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-5">
                    <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">Background & Education</h3>
                    <Link href="/dashboard/profile/edit" className="text-[10px] sm:text-xs lg:text-sm text-[#1f419a] hover:text-[#17357b] font-medium">
                      Edit
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:gap-3 lg:gap-4 sm:grid-cols-2">
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Ethnicity</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.ethnicity || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Religion</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.religion || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Education Level</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.education_level || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Languages</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.languages || null)}</div>
                    </div>
                  </div>
                </div>

                {/* Relationship & Family */}
                <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-200">
                  <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-5">
                    <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">Relationship & Family</h3>
                    <Link href="/dashboard/profile/edit" className="text-[10px] sm:text-xs lg:text-sm text-[#1f419a] hover:text-[#17357b] font-medium">
                      Edit
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:gap-3 lg:gap-4 sm:grid-cols-2">
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Relationship Status</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.relationship_status || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Have Children</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">{formatValue(profile?.have_children || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Want Children</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">{formatValue(profile?.want_children || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Relationship Type</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.relationship_type || null)}</div>
                    </div>
                  </div>
                </div>

                {/* Lifestyle */}
                <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-200">
                  <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-5">
                    <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">Lifestyle</h3>
                    <Link href="/dashboard/profile/edit" className="text-[10px] sm:text-xs lg:text-sm text-[#1f419a] hover:text-[#17357b] font-medium">
                      Edit
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:gap-3 lg:gap-4 sm:grid-cols-2">
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Smoking Habits</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.smoking_habits || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Ready for Marriage</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.ready_for_marriage || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Willing to Relocate</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.willing_to_relocate || null)}</div>
                    </div>
                  </div>
                </div>

                {/* Personal Development */}
                <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-200">
                  <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-5">
                    <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">Personal Development</h3>
                    <Link href="/dashboard/profile/edit" className="text-[10px] sm:text-xs lg:text-sm text-[#1f419a] hover:text-[#17357b] font-medium">
                      Edit
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:gap-3 lg:gap-4 sm:grid-cols-2">
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Career Stability</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.career_stability || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Long-Term Goals</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.long_term_goals || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Emotional Connection</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.emotional_connection || null)}</div>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Love Languages</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.love_languages || null)}</div>
                    </div>
                  </div>
                </div>

                {/* About & Personality */}
                <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-200">
                  <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-5">
                    <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">About & Personality</h3>
                    <Link href="/dashboard/profile/edit" className="text-[10px] sm:text-xs lg:text-sm text-[#1f419a] hover:text-[#17357b] font-medium">
                      Edit
                    </Link>
                  </div>
                  <div className="space-y-2.5 sm:space-y-3 lg:space-y-4">
                    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 sm:p-4 lg:p-5">
                      <div className="flex items-center justify-between mb-2 sm:mb-2.5 lg:mb-3">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">About Yourself</span>
                        <Link href="/dashboard/profile/edit" className="text-[10px] sm:text-xs lg:text-sm text-[#1f419a] hover:text-[#17357b]">
                          Edit
                        </Link>
                      </div>
                      <p className="text-xs sm:text-sm lg:text-base text-gray-700 leading-relaxed break-words">{profile?.about_yourself || profile?.personality_type || "Not set"}</p>
                    </div>
                    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
                      <div className="flex items-center justify-between mb-1 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">Personality Type</span>
                      </div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile?.personality_type || null)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-row gap-2 sm:gap-3 pt-3 sm:pt-4 pb-4">
              <Link 
                href="/dashboard/profile/edit" 
                className="flex-1 rounded-lg sm:rounded-xl bg-gray-900 text-[10px] sm:text-xs lg:text-sm font-semibold text-white shadow-lg hover:bg-gray-800 transition-all h-10 sm:h-11 lg:h-12 flex items-center justify-center gap-1 sm:gap-1.5 lg:gap-2 min-w-0"
              >
                <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 flex-shrink-0" />
                <span className="hidden sm:inline truncate">Edit Profile</span>
                <span className="sm:hidden truncate">Edit</span>
              </Link>
              <button
                onClick={() => {
                  const newState = !showPreferences;
                  setShowPreferences(newState);
                  // Scroll to preferences section after state update
                  if (newState) {
                    setTimeout(() => {
                      const preferencesSection = document.getElementById('preferences-section');
                      if (preferencesSection) {
                        preferencesSection.scrollIntoView({ 
                          behavior: 'smooth', 
                          block: 'start',
                          inline: 'nearest'
                        });
                      }
                    }, 100);
                  }
                }}
                className="flex-1 rounded-lg sm:rounded-xl bg-pink-500 text-[10px] sm:text-xs lg:text-sm font-semibold text-white shadow-lg hover:bg-pink-600 transition-all h-10 sm:h-11 lg:h-12 flex items-center justify-center gap-1 sm:gap-1.5 lg:gap-2 min-w-0"
              >
                <HeartIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 flex-shrink-0" />
                <span className="hidden sm:inline truncate">{showPreferences ? "Hide Preferences" : "View Preferences"}</span>
                <span className="sm:hidden truncate">{showPreferences ? "Hide" : "Prefs"}</span>
              </button>
              <Link 
                href="/dashboard/profile" 
                className="flex-1 rounded-lg sm:rounded-xl bg-[#1f419a] text-[10px] sm:text-xs lg:text-sm font-semibold text-white shadow-lg hover:bg-[#17357b] transition-all h-10 sm:h-11 lg:h-12 flex items-center justify-center gap-1 sm:gap-1.5 lg:gap-2 min-w-0"
              >
                <User className="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 flex-shrink-0" />
                <span className="hidden sm:inline truncate">View Profile</span>
                <span className="sm:hidden truncate">View</span>
              </Link>
            </div>

            {/* Preferences Section */}
            {showPreferences && (
              <div id="preferences-section" className="mt-4 sm:mt-6 rounded-lg sm:rounded-xl bg-gradient-to-br from-pink-50 to-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-pink-200">
                <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-5">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <HeartIcon className="h-4 w-4 sm:h-5 sm:w-5 text-pink-600" />
                    <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">My Preferences</h3>
                  </div>
                  <Link 
                    href="/dashboard/profile/preferences" 
                    className="text-[10px] sm:text-xs lg:text-sm text-pink-600 hover:text-pink-700 font-medium"
                  >
                    Edit
                  </Link>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:gap-3 lg:gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {profile?.partner_location && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Location</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{profile.partner_location}</div>
                    </div>
                  )}

                  {profile?.partner_age_range && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Age Range</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">{profile.partner_age_range}</div>
                    </div>
                  )}

                  {(profile?.partner_height_min_cm || profile?.partner_height_max_cm) && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Height Range</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">
                        {profile.partner_height_min_cm && profile.partner_height_max_cm
                          ? `${Math.floor(profile.partner_height_min_cm / 30.48)}'${Math.round((profile.partner_height_min_cm % 30.48) / 2.54)}" - ${Math.floor(profile.partner_height_max_cm / 30.48)}'${Math.round((profile.partner_height_max_cm % 30.48) / 2.54)}"`
                          : "Open to any height"}
                      </div>
                    </div>
                  )}

                  {profile?.partner_ethnicity && profile.partner_ethnicity.length > 0 && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Ethnicity</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{profile.partner_ethnicity.join(", ")}</div>
                    </div>
                  )}

                  {profile?.partner_religion && profile.partner_religion.length > 0 && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Religion</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{profile.partner_religion.join(", ")}</div>
                    </div>
                  )}

                  {profile?.partner_education && profile.partner_education.length > 0 && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Education</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{profile.partner_education.join(", ")}</div>
                    </div>
                  )}

                  {profile?.partner_employment && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Employment</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile.partner_employment)}</div>
                    </div>
                  )}

                  {profile?.partner_have_children && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Have Children</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">
                        {profile.partner_have_children === "yes" ? "Has kids" : profile.partner_have_children === "no" ? "Doesn't have kids" : "Doesn't matter"}
                      </div>
                    </div>
                  )}

                  {profile?.partner_want_children && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Want Children</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">
                        {profile.partner_want_children === "yes" ? "Wants kids" : profile.partner_want_children === "no" ? "Doesn't want kids" : "Doesn't matter"}
                      </div>
                    </div>
                  )}

                  {profile?.partner_smoking && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Smoking</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">
                        {profile.partner_smoking === "yes" ? "Smokes" : profile.partner_smoking === "no" ? "Doesn't smoke" : "Doesn't matter"}
                      </div>
                    </div>
                  )}

                  {profile?.partner_drinking && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Drinking</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">
                        {profile.partner_drinking === "yes" ? "Drinks" : profile.partner_drinking === "no" ? "Doesn't drink" : "Doesn't matter"}
                      </div>
                    </div>
                  )}

                  {profile?.partner_diet && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Diet</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile.partner_diet)}</div>
                    </div>
                  )}

                  {profile?.partner_experience && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Relationship Experience</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile.partner_experience)}</div>
                    </div>
                  )}

                  {profile?.partner_pets && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Pets</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900">
                        {profile.partner_pets === "yes" ? "Has pets" : profile.partner_pets === "no" ? "Doesn't have pets" : "Doesn't matter"}
                      </div>
                    </div>
                  )}

                  {profile?.partner_plans && (
                    <div className="rounded-lg border border-pink-200 bg-white/50 p-2.5 sm:p-3 lg:p-4">
                      <div className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 sm:mb-1.5">Relationship Plans</div>
                      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{formatValue(profile.partner_plans)}</div>
                    </div>
                  )}
                </div>

                {(!profile?.partner_location && !profile?.partner_age_range && !profile?.partner_ethnicity && !profile?.partner_religion && !profile?.partner_education) && (
                  <div className="text-center py-6 sm:py-8">
                    <HeartIcon className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 mx-auto mb-2 sm:mb-3" />
                    <p className="text-gray-500 text-xs sm:text-sm">No preferences set yet</p>
                    <Link 
                      href="/dashboard/profile/preferences" 
                      className="inline-block mt-2 sm:mt-3 text-pink-600 hover:text-pink-700 font-medium text-xs sm:text-sm"
                    >
                      Set your preferences →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
      </div>
    </div>
  );
}
