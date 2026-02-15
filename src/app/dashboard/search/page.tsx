"use client";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { User, SlidersHorizontal, X, ChevronDown, Video, Calendar, Loader2, CheckCircle, AlertCircle, ArrowUpDown, BadgeCheck } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";
import { supabase } from "@/lib/supabase";
import { calculateMatchPercentage, type PartnerPreferences } from "@/lib/match-percentage";
import { getBlockedUserIds } from "@/lib/blocked-users";
import { getActiveStatus, isOnline } from "@/lib/active-status";
import MeetingRequestModal from "@/components/MeetingRequestModal";
import ProfileDetailModal from "@/components/ProfileDetailModal";

type CardProfile = {
  id: string;
  user_id: string;
  name: string;
  age: number | null;
  city: string | null;
  imageUrl: string;
  verified?: boolean;
  heightCm?: number;
  hasCalendarSlots?: boolean;
  tier?: string;
  gender?: string | null;
  education_level?: string | null;
  religion?: string | null;
  ethnicity?: string | null;
  languages?: string[] | null;
  smoking_habits?: string | null;
  have_children?: boolean | null;
  want_children?: string | null;
  relationship_status?: string | null;
  /** Match percentage 0–100 */
  matchScore: number;
  /** Match label (e.g. "Great Match") */
  matchLabel: string;
  /** Tailwind color class for the match badge text */
  matchColor: string;
  /** Tailwind bg+border class for the match badge */
  matchBgColor: string;
  /** Last active timestamp for online status */
  lastActiveAt?: string | null;
  /** Formatted active status label */
  activeLabel?: string;
  /** Tailwind color class for active status */
  activeColor?: string;
  /** Whether user is currently online */
  isUserOnline?: boolean;
};

export default function SearchPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(70);
  const [city, setCity] = useState("");
  const [distance, setDistance] = useState(500);
  const [online, setOnline] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [selectedGender, setSelectedGender] = useState<string>("");
  const [selectedRelStatus, setSelectedRelStatus] = useState<string>("");
  const [heightMin, setHeightMin] = useState(140);
  const [heightMax, setHeightMax] = useState(220);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedEthnicities, setSelectedEthnicities] = useState<string[]>([]);
  const [selectedEducations, setSelectedEducations] = useState<string[]>([]);
  const [selectedReligions, setSelectedReligions] = useState<string[]>([]);
  const [childrenPref, setChildrenPref] = useState<string>("any");
  const [smokerPref, setSmokerPref] = useState<string>("");
  const [profiles, setProfiles] = useState<CardProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sort state: "match" (best match first), "newest", "age_asc", "age_desc", "name"
  const [sortBy, setSortBy] = useState<string>("match");
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Profile detail modal state
  const [selectedProfile, setSelectedProfile] = useState<CardProfile | null>(null);
  
  // Meeting request modal state
  const [meetingRequestModalOpen, setMeetingRequestModalOpen] = useState(false);
  const [selectedUserForMeeting, setSelectedUserForMeeting] = useState<{
    id: string;
    first_name: string | null;
    profile_photo_url: string | null;
    tier: string;
  } | null>(null);


  /**
   * Fetch the user's existing activities to pre-fill liked/winked/interested state
   */
  useEffect(() => {
    const fetchExistingActivities = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: activities } = await supabase
          .from("user_activities")
          .select("target_user_id, activity_type")
          .eq("user_id", user.id)
          .in("activity_type", ["wink", "interested"]);

        if (activities) {
          const winks = new Set<string>();
          const interests = new Set<string>();
          for (const a of activities) {
            if (a.activity_type === "wink") winks.add(a.target_user_id);
            if (a.activity_type === "interested") interests.add(a.target_user_id);
          }
          setWinkedIds(winks);
          setInterestedIds(interests);
        }
      } catch (err) {
        console.error("Error fetching existing activities:", err);
      }
    };

    fetchExistingActivities();
  }, []);

  const likesCount = 2;
  const singlesCountLabel = `${profiles.length > 0 ? profiles.length : "+1000"} singles`;

  const fallbacks = [
    "/placeholder-profile.svg",
    "/placeholder-profile.svg",
    "/placeholder-profile.svg",
  ];
  const fbIdx = useRef(0);
  const [cardSrcs, setCardSrcs] = useState<Record<string, string>>({});
  
  /**
   * Fetch profiles from database
   */
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError("Not authenticated");
          setLoading(false);
          return;
        }

        // Get current user's profile to exclude from results
        const { data: currentUserProfile } = await supabase
          .from("user_profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        // Fetch user's preferences (including blocked locations and partner preferences for match %)
        let blockedLocations: string[] = [];
        let partnerPrefs: PartnerPreferences | null = null;
        try {
          const { data: prefsData } = await supabase
            .from("user_preferences")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
          blockedLocations = prefsData?.blocked_locations || [];
          if (prefsData) {
            partnerPrefs = prefsData as PartnerPreferences;
          }
        } catch {
          // Column might not exist yet — ignore
        }

        // Fetch other users' profiles
        const { data: profilesData, error: profilesError } = await supabase
          .from("user_profiles")
          .select(`
            user_id,
            first_name,
            last_name,
            date_of_birth,
            location,
            height_cm,
            photos,
            profile_photo_url,
            gender,
            education_level,
            religion,
            ethnicity,
            languages,
            smoking_habits,
            have_children,
            want_children,
            relationship_status,
            updated_at
          `)
          .limit(100);

        if (profilesError) {
          console.error("Error fetching profiles:", profilesError);
          setError("Failed to load profiles. Please try again.");
          setLoading(false);
          return;
        }

        // Get blocked user IDs (bidirectional) and filter them out
        const blockedUserIds = await getBlockedUserIds();

        // Filter out current user and blocked users
        const otherProfiles = (profilesData || []).filter(
          (p: any) => p.user_id !== user.id && !blockedUserIds.has(p.user_id)
        );

        // Fetch account info (tier, display_name, visibility)
        const userIds = otherProfiles.map((p: any) => p.user_id);

        // Try fetching with profile_visible; fall back if column doesn't exist
        let accountsData: any[] | null = null;

        const { data: accData, error: accErr } = await supabase
          .from("accounts")
          .select("id, tier, display_name, email_verified, profile_visible, last_active_at")
          .in("id", userIds);

        if (accErr && accErr.code === "42703") {
          // Columns don't exist yet — query without them
          const { data: fallbackData } = await supabase
            .from("accounts")
            .select("id, tier, display_name, email_verified")
            .in("id", userIds);
          accountsData = (fallbackData || []).map((a: any) => ({ ...a, profile_visible: true, last_active_at: null }));
        } else {
          accountsData = accData;
        }

        // Filter out hidden profiles
        accountsData = (accountsData || []).filter(
          (a: any) => a.profile_visible !== false
        );

        // Check which users have calendar slots
        const { data: availabilityData } = await supabase
          .from("meeting_availability")
          .select("user_id")
          .in("user_id", userIds)
          .gte("slot_date", new Date().toISOString().split("T")[0]);

        const usersWithSlots = new Set((availabilityData || []).map((a: any) => a.user_id));
        const accountsMap = new Map((accountsData || []).map((a: any) => [a.id, a]));

        // Filter out profiles without a valid visible account and from blocked locations
        const visibleProfiles = otherProfiles.filter((p: any) => {
          // Must have a visible account
          if (!accountsMap.has(p.user_id)) return false;

          // Exclude users from blocked locations
          if (blockedLocations.length > 0 && p.location) {
            const profileLoc = (p.location || "").toLowerCase();
            const isBlocked = blockedLocations.some((blocked: string) =>
              profileLoc.includes(blocked.toLowerCase()) ||
              blocked.toLowerCase().includes(profileLoc)
            );
            if (isBlocked) return false;
          }

          return true;
        });

        // Transform profiles
        const transformedProfiles: CardProfile[] = visibleProfiles.map((p: any) => {
          const account = accountsMap.get(p.user_id);
          
          // Calculate age
          let age: number | null = null;
          if (p.date_of_birth) {
            const birthDate = new Date(p.date_of_birth);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              age--;
            }
          }

          // Get primary photo
          const primaryPhoto = (p.photos && p.photos.length > 0)
            ? p.photos[0]
            : p.profile_photo_url || "/placeholder-profile.svg";

          // Calculate match percentage against user's preferences
          const matchResult = calculateMatchPercentage(partnerPrefs, {
            location: p.location,
            date_of_birth: p.date_of_birth,
            height_cm: p.height_cm,
            ethnicity: p.ethnicity,
            religion: p.religion,
            education_level: p.education_level,
            have_children: p.have_children,
            want_children: p.want_children,
            smoking_habits: p.smoking_habits,
          });

          return {
            id: p.user_id,
            user_id: p.user_id,
            name: p.first_name || account?.display_name || "User",
            age,
            city: p.location || null,
            imageUrl: primaryPhoto,
            verified: account?.email_verified || false,
            heightCm: p.height_cm || undefined,
            hasCalendarSlots: usersWithSlots.has(p.user_id),
            tier: account?.tier || "basic",
            // Match percentage data
            matchScore: matchResult.percentage,
            matchLabel: matchResult.label,
            matchColor: matchResult.color,
            matchBgColor: matchResult.bgColor,
            // Additional data for filtering
            gender: p.gender || null,
            education_level: p.education_level || null,
            religion: p.religion || null,
            ethnicity: p.ethnicity || null,
            languages: p.languages || [],
            smoking_habits: p.smoking_habits || null,
            have_children: p.have_children || null,
            want_children: p.want_children || null,
            relationship_status: p.relationship_status || null,
            // Active status
            lastActiveAt: account?.last_active_at || null,
            ...(() => {
              const status = getActiveStatus(account?.last_active_at || null);
              return {
                activeLabel: status.label,
                activeColor: status.color,
                isUserOnline: status.isOnline,
              };
            })(),
          };
        });

        setProfiles(transformedProfiles);
        setCardSrcs(Object.fromEntries(transformedProfiles.map(p => [p.id, p.imageUrl])));
      } catch (err) {
        console.error("Error fetching profiles:", err);
        setError("An unexpected error occurred. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, []);

  /**
   * Count the number of active filters (for badge display)
   */
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (minAge !== 18 || maxAge !== 70) count++;
    if (city.trim()) count++;
    if (online) count++;
    if (verifiedOnly) count++;
    if (selectedGender) count++;
    if (selectedRelStatus) count++;
    if (heightMin !== 140 || heightMax !== 220) count++;
    if (selectedLanguages.length > 0) count++;
    if (selectedEthnicities.length > 0) count++;
    if (selectedEducations.length > 0) count++;
    if (selectedReligions.length > 0) count++;
    if (childrenPref !== "any") count++;
    if (smokerPref) count++;
    return count;
  }, [minAge, maxAge, city, online, verifiedOnly, selectedGender, selectedRelStatus, heightMin, heightMax, selectedLanguages, selectedEthnicities, selectedEducations, selectedReligions, childrenPref, smokerPref]);

  /**
   * Build a list of active filter chips for display above results
   */
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (minAge !== 18 || maxAge !== 70) {
      chips.push({ key: "age", label: `Age ${minAge}–${maxAge}`, onClear: () => { setMinAge(18); setMaxAge(70); } });
    }
    if (city.trim()) {
      chips.push({ key: "city", label: `📍 ${city}`, onClear: () => setCity("") });
    }
    if (online) {
      chips.push({ key: "online", label: "🟢 Online now", onClear: () => setOnline(false) });
    }
    if (verifiedOnly) {
      chips.push({ key: "verified", label: "✓ Verified", onClear: () => setVerifiedOnly(false) });
    }
    if (selectedGender) {
      chips.push({ key: "gender", label: `${selectedGender}`, onClear: () => setSelectedGender("") });
    }
    if (selectedRelStatus) {
      chips.push({ key: "relStatus", label: `${selectedRelStatus}`, onClear: () => setSelectedRelStatus("") });
    }
    if (heightMin !== 140 || heightMax !== 220) {
      chips.push({ key: "height", label: `Height ${heightMin}–${heightMax}cm`, onClear: () => { setHeightMin(140); setHeightMax(220); } });
    }
    if (selectedLanguages.length > 0) {
      chips.push({ key: "langs", label: `🗣 ${selectedLanguages.join(", ")}`, onClear: () => setSelectedLanguages([]) });
    }
    if (selectedEthnicities.length > 0) {
      chips.push({ key: "ethnic", label: `🌍 ${selectedEthnicities.length} ethnicit${selectedEthnicities.length === 1 ? "y" : "ies"}`, onClear: () => setSelectedEthnicities([]) });
    }
    if (selectedEducations.length > 0) {
      chips.push({ key: "edu", label: `🎓 ${selectedEducations.length} education`, onClear: () => setSelectedEducations([]) });
    }
    if (selectedReligions.length > 0) {
      chips.push({ key: "religion", label: `🙏 ${selectedReligions.join(", ")}`, onClear: () => setSelectedReligions([]) });
    }
    if (childrenPref !== "any") {
      const labels: Record<string, string> = { yes: "Wants kids", no: "No kids", maybe: "Maybe kids" };
      chips.push({ key: "children", label: `👶 ${labels[childrenPref] || childrenPref}`, onClear: () => setChildrenPref("any") });
    }
    if (smokerPref) {
      chips.push({ key: "smoking", label: `🚬 ${smokerPref}`, onClear: () => setSmokerPref("") });
    }
    return chips;
  }, [minAge, maxAge, city, online, verifiedOnly, selectedGender, selectedRelStatus, heightMin, heightMax, selectedLanguages, selectedEthnicities, selectedEducations, selectedReligions, childrenPref, smokerPref]);

  /**
   * Reset all filters to neutral defaults
   */
  const resetAllFilters = useCallback(() => {
    setMinAge(18);
    setMaxAge(70);
    setCity("");
    setDistance(500);
    setOnline(false);
    setVerifiedOnly(false);
    setSelectedGender("");
    setSelectedRelStatus("");
    setHeightMin(140);
    setHeightMax(220);
    setSelectedLanguages([]);
    setSelectedEthnicities([]);
    setSelectedEducations([]);
    setSelectedReligions([]);
    setChildrenPref("any");
    setSmokerPref("");
  }, []);

  const filteredProfiles = useMemo(
    () => {
      // Step 1: Filter
      const filtered = profiles.filter((p) => {
        // Age filter
        if (p.age !== null && (p.age < minAge || p.age > maxAge)) {
          return false;
        }

        // Online filter
        if (online && !isOnline(p.lastActiveAt || null)) {
          return false;
        }

        // Verified filter
        if (verifiedOnly && !p.verified) {
          return false;
        }

        // City filter (case-insensitive partial match)
        if (city && city.trim() !== "") {
          const cityLower = city.toLowerCase().trim();
          const profileCity = (p.city || "").toLowerCase();
          if (profileCity && !profileCity.includes(cityLower)) {
            return false;
          }
          if (!profileCity && cityLower) {
            return false;
          }
        }

        // Gender filter
        if (selectedGender && p.gender) {
          if (p.gender.toLowerCase() !== selectedGender.toLowerCase()) {
            return false;
          }
        } else if (selectedGender && !p.gender) {
          return false;
        }

        // Relationship status filter
        if (selectedRelStatus && p.relationship_status) {
          if (p.relationship_status.toLowerCase() !== selectedRelStatus.toLowerCase()) {
            return false;
          }
        } else if (selectedRelStatus && !p.relationship_status) {
          return false;
        }

        // Height filter
        if ((heightMin !== 140 || heightMax !== 220) && p.heightCm !== undefined) {
          if (p.heightCm < heightMin || p.heightCm > heightMax) {
            return false;
          }
        }

        // Languages filter
        if (selectedLanguages.length > 0) {
          if (!p.languages || !Array.isArray(p.languages) || p.languages.length === 0) {
            return false;
          }
          const hasMatchingLanguage = selectedLanguages.some(lang => 
            p.languages!.some((profileLang: string) => 
              profileLang.toLowerCase().includes(lang.toLowerCase()) || 
              lang.toLowerCase().includes(profileLang.toLowerCase())
            )
          );
          if (!hasMatchingLanguage) {
            return false;
          }
        }

        // Education filter
        if (selectedEducations.length > 0) {
          if (!p.education_level || !selectedEducations.includes(p.education_level)) {
            return false;
          }
        }

        // Religion filter
        if (selectedReligions.length > 0) {
          if (!p.religion || !selectedReligions.includes(p.religion)) {
            return false;
          }
        }

        // Ethnicity filter
        if (selectedEthnicities.length > 0) {
          if (!p.ethnicity) return false;
          const profileEthnicities = typeof p.ethnicity === 'string' 
            ? p.ethnicity.split(',').map(e => e.trim())
            : Array.isArray(p.ethnicity) 
              ? p.ethnicity 
              : [];
          const hasMatchingEthnicity = selectedEthnicities.some(selectedEth => 
            profileEthnicities.some((profileEth: string) => 
              profileEth.toLowerCase().includes(selectedEth.toLowerCase()) ||
              selectedEth.toLowerCase().includes(profileEth.toLowerCase())
            )
          );
          if (!hasMatchingEthnicity) {
            return false;
          }
        }

        // Children preference filter
        if (childrenPref !== "any") {
          if (!p.want_children) return false;
          if (childrenPref === "yes" && p.want_children !== "yes") return false;
          if (childrenPref === "no" && p.want_children !== "no") return false;
          if (childrenPref === "maybe" && p.want_children !== "maybe") return false;
        }

        // Smoking habits filter
        if (smokerPref) {
          if (!p.smoking_habits) return false;
          const smokingMap: Record<string, string[]> = {
            "Never": ["never"],
            "Smoke Socially": ["occasionally", "socially"],
            "Smoke Smoke": ["regularly"],
            "Regularly": ["regularly"],
            "Trying to quit": ["trying_to_quit", "trying to quit"],
          };
          const profileSmoking = p.smoking_habits.toLowerCase();
          const allowedSmoking = smokingMap[smokerPref] || [];
          const matches = allowedSmoking.some(allowed => 
            profileSmoking.includes(allowed.toLowerCase())
          );
          if (!matches) return false;
        }

        return true;
      });

      // Step 2: Sort
      const sorted = [...filtered];
      switch (sortBy) {
        case "match":
          sorted.sort((a, b) => b.matchScore - a.matchScore);
          break;
        case "newest":
          break;
        case "age_asc":
          sorted.sort((a, b) => {
            if (a.age === null && b.age === null) return 0;
            if (a.age === null) return 1;
            if (b.age === null) return -1;
            return a.age - b.age;
          });
          break;
        case "age_desc":
          sorted.sort((a, b) => {
            if (a.age === null && b.age === null) return 0;
            if (a.age === null) return 1;
            if (b.age === null) return -1;
            return b.age - a.age;
          });
          break;
        case "name":
          sorted.sort((a, b) => a.name.localeCompare(b.name));
          break;
        default:
          break;
      }

      return sorted;
    },
    [
      profiles,
      minAge,
      maxAge,
      verifiedOnly,
      city,
      selectedGender,
      selectedRelStatus,
      heightMin,
      heightMax,
      selectedLanguages,
      selectedEducations,
      selectedReligions,
      selectedEthnicities,
      childrenPref,
      smokerPref,
      online,
      sortBy,
    ]
  );

  /**
   * Handle opening meeting request modal
   */
  const handleRequestMeeting = async (userId: string, userName: string, userImage: string, userTier: string) => {
    setSelectedUserForMeeting({
      id: userId,
      first_name: userName,
      profile_photo_url: userImage,
      tier: userTier,
    });
    setMeetingRequestModalOpen(true);
  };

  

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/matchindeed.svg" alt="Matchindeed" width={140} height={36} style={{ width: "auto", height: "auto" }} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden md:block w-56 flex-shrink-0 space-y-4">
          <Sidebar active="search" />
          <ProfileCompletenessCard variant="compact" />
        </aside>

        <section className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2ff] text-[#1f419a]"><User className="h-5 w-5"/></div>
              <div className="text-sm text-gray-700">Complete your profile to get the best Matchindeed experience!</div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-4 shadow-lg ring-1 ring-black/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <span className="rounded-full bg-gray-100 px-3 py-1">
                  {filteredProfiles.length} {filteredProfiles.length === 1 ? 'result' : 'results'}
                  {filteredProfiles.length !== profiles.length && (
                    <span className="ml-2 text-xs text-blue-600">
                      (filtered from {profiles.length})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Sort Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSortMenu(!showSortMenu)}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                    <span className="hidden sm:inline">
                      {sortBy === "match" && "Best Match"}
                      {sortBy === "newest" && "Newest"}
                      {sortBy === "age_asc" && "Youngest"}
                      {sortBy === "age_desc" && "Oldest"}
                      {sortBy === "name" && "Name A-Z"}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {showSortMenu && (
                    <>
                      {/* Backdrop to close menu */}
                      <div className="fixed inset-0 z-30" onClick={() => setShowSortMenu(false)} />
                      <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden">
                        {[
                          { key: "match", label: "Best Match", icon: "🔥" },
                          { key: "newest", label: "Newest", icon: "🆕" },
                          { key: "age_asc", label: "Youngest First", icon: "⬆️" },
                          { key: "age_desc", label: "Oldest First", icon: "⬇️" },
                          { key: "name", label: "Name A-Z", icon: "🔤" },
                        ].map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => {
                              setSortBy(option.key);
                              setShowSortMenu(false);
                            }}
                            className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                              sortBy === option.key
                                ? "bg-[#1f419a]/10 text-[#1f419a] font-semibold"
                                : "text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <span className="text-base">{option.icon}</span>
                            <span>{option.label}</span>
                            {sortBy === option.key && (
                              <CheckCircle className="h-4 w-4 ml-auto text-[#1f419a]" />
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Filters Button */}
                <button type="button" onClick={() => setShowFilters(true)} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">
                  <SlidersHorizontal className="h-4 w-4"/>
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#1f419a] text-[10px] font-bold text-white">{activeFilterCount}</span>
                  )}
                </button>
              </div>
            </div>

            {/* Active filter chips */}
            {activeFilterChips.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {activeFilterChips.map((chip) => (
                  <span
                    key={chip.key}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#1f419a]/10 border border-[#1f419a]/20 px-3 py-1 text-xs font-medium text-[#1f419a]"
                  >
                    {chip.label}
                    <button
                      type="button"
                      onClick={chip.onClear}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-[#1f419a]/20 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-xs text-gray-500 hover:text-red-500 underline underline-offset-2 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}

            {loading ? (
              <div className="mt-8 flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
              </div>
            ) : error ? (
              <div className="mt-8 text-center py-12">
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-800">
                  <p className="font-medium">{error}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="mt-2 text-sm text-red-600 underline hover:text-red-800"
                  >
                    Reload page
                  </button>
                </div>
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="mt-8 text-center py-12">
                <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">No profiles match your filters</p>
                <p className="text-sm text-gray-500 mt-2">Try adjusting your search criteria</p>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProfiles.map((p) => {
                  const imageSrc = cardSrcs[p.id] || p.imageUrl;
                  return (
                    <div
                      key={p.id}
                      className="overflow-hidden rounded-3xl bg-white shadow ring-1 ring-black/5 hover:shadow-lg transition-shadow group cursor-pointer"
                      onClick={() => setSelectedProfile(p)}
                    >
                      <div className="relative">
                        {/* Match label overlay for high matches */}
                        {p.matchScore >= 50 && (
                          <div className="absolute top-3 left-3 z-10">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm shadow-sm ${p.matchBgColor} ${p.matchColor}`}>
                              {p.matchScore >= 70 ? "🔥" : "✨"} {p.matchLabel}
                            </span>
                          </div>
                        )}
                        <Image
                          src={imageSrc}
                          alt={`${p.name} photo`}
                          width={1200}
                          height={900}
                          sizes="(min-width:1024px) 360px, (min-width:640px) 50vw, 100vw"
                          className="h-60 w-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={() => {
                            if (fbIdx.current < fallbacks.length) {
                              setCardSrcs(prev => ({
                                ...prev,
                                [p.id]: fallbacks[fbIdx.current],
                              }));
                              fbIdx.current += 1;
                            } else {
                              setCardSrcs(prev => ({
                                ...prev,
                                [p.id]: "/placeholder-profile.svg",
                              }));
                            }
                          }}
                        />
                        <div className="absolute bottom-3 right-3 flex items-center gap-2">
                          {/* Request Video Meeting */}
                          <button 
                            type="button" 
                            onClick={(e) => { e.stopPropagation(); handleRequestMeeting(p.user_id, p.name, p.imageUrl, p.tier || "basic"); }}
                            className="rounded-full bg-white p-2 shadow ring-1 ring-black/5 hover:bg-blue-50 transition-colors"
                            title="Request Video Meeting"
                          >
                            <Video className="h-4 w-4 text-[#1f419a]"/>
                          </button>
                        </div>
                      </div>
                      <div className="border-t bg-white p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 text-lg font-semibold text-gray-900">
                              <span className="truncate">{p.name}</span>
                              {p.verified && <BadgeCheck className="h-4.5 w-4.5 text-blue-500 flex-shrink-0" title="Verified profile" />}
                            </div>
                            <div className="text-sm text-gray-600">
                              {p.age !== null ? `Age ${p.age}` : ""}
                              {p.age !== null && p.city ? ", " : ""}
                              {p.city || ""}
                            </div>
                            {p.activeLabel && (
                              <div className={`flex items-center gap-1 text-xs mt-0.5 ${p.activeColor || "text-gray-400"}`}>
                                <span className={`inline-block h-1.5 w-1.5 rounded-full ${p.isUserOnline ? "bg-green-500" : "bg-gray-300"}`} />
                                {p.activeLabel}
                              </div>
                            )}
                          </div>
                          {/* Match Badge */}
                          {p.matchScore > 0 && (
                            <div className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${p.matchBgColor} ${p.matchColor}`}>
                              {p.matchScore >= 70 ? "🔥" : p.matchScore >= 50 ? "✨" : ""}
                              {p.matchScore}%
                            </div>
                          )}
                        </div>

                        {/* Quick info tags */}
                        <div className="flex flex-wrap gap-1">
                          {p.ethnicity && (
                            <span className="inline-flex items-center rounded-full bg-purple-50 border border-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 truncate max-w-[120px]">
                              🌍 {p.ethnicity}
                            </span>
                          )}
                          {p.religion && (
                            <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                              🙏 {p.religion}
                            </span>
                          )}
                          {p.education_level && (
                            <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              🎓 {p.education_level}
                            </span>
                          )}
                        </div>

                        {p.hasCalendarSlots && (
                          <div className="flex items-center gap-1 text-xs text-blue-600">
                            <Calendar className="h-3 w-3" />
                            <span>Has available slots</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
        {showFilters && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowFilters(false)} />
            <div className="relative max-h-[90vh] w-[94vw] max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 shadow-2xl flex flex-col">
              {/* Header */}
              <div className="z-10 flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1f419a]/10">
                    <SlidersHorizontal className="h-4 w-4 text-[#1f419a]" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">Search Filters</div>
                    {activeFilterCount > 0 && (
                      <div className="text-xs text-gray-500">{activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active</div>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => setShowFilters(false)} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"><X className="h-5 w-5"/></button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                {/* --- Gender --- */}
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    <User className="h-3.5 w-3.5" /> Gender
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["", "Male", "Female", "Non-binary"].map((opt) => (
                      <button
                        key={opt || "any"}
                        type="button"
                        onClick={() => setSelectedGender(opt)}
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          selectedGender === opt
                            ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {opt || "Any"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* --- Age --- */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Age Range</div>
                    <div className="text-sm font-medium text-gray-900">{minAge} – {maxAge}</div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-6 text-right">{minAge}</span>
                    <input type="range" min={18} max={70} value={minAge} onChange={(e) => setMinAge(Math.min(Number(e.target.value), maxAge))} className="range-brand h-2 w-full cursor-pointer" />
                    <input type="range" min={18} max={70} value={maxAge} onChange={(e) => setMaxAge(Math.max(Number(e.target.value), minAge))} className="range-brand h-2 w-full cursor-pointer" />
                    <span className="text-xs text-gray-400 w-6">{maxAge}</span>
                  </div>
                </div>

                {/* --- Location --- */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Location</div>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1f419a] focus:ring-1 focus:ring-[#1f419a] focus:outline-none transition-colors"
                    placeholder="Enter city or country..."
                  />
                  <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
                    <span>Distance: up to <span className="font-medium">{distance} mi</span></span>
                  </div>
                  <input type="range" min={5} max={500} value={distance} onChange={(e) => setDistance(Number(e.target.value))} className="range-brand mt-1 h-2 w-full cursor-pointer" />
                </div>

                {/* --- Match Options --- */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Match Options</div>
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500"></span>
                      <span className="text-sm text-gray-700">Online now</span>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="peer sr-only" />
                      <div className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-[#1f419a] after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-all peer-checked:after:translate-x-4"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between py-1 mt-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-[#1f419a]" />
                      <span className="text-sm text-gray-700">Verified profiles only</span>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="peer sr-only" />
                      <div className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-[#1f419a] after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-all peer-checked:after:translate-x-4"></div>
                    </label>
                  </div>
                </div>

                {/* --- Relationship Status --- */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Relationship Status</div>
                  <div className="flex flex-wrap gap-2">
                    {["", "Single", "Divorced", "Widowed", "Separated"].map((opt) => (
                      <button
                        key={opt || "any"}
                        type="button"
                        onClick={() => setSelectedRelStatus(opt)}
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          selectedRelStatus === opt
                            ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {opt || "Any"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* --- Height --- */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Height</div>
                    <div className="text-sm font-medium text-gray-900">{heightMin} cm – {heightMax} cm</div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-10 text-right">{heightMin}</span>
                    <input type="range" min={140} max={220} value={heightMin} onChange={(e) => setHeightMin(Math.min(Number(e.target.value), heightMax))} className="range-brand h-2 w-full cursor-pointer" />
                    <input type="range" min={140} max={220} value={heightMax} onChange={(e) => setHeightMax(Math.max(Number(e.target.value), heightMin))} className="range-brand h-2 w-full cursor-pointer" />
                    <span className="text-xs text-gray-400 w-10">{heightMax}</span>
                  </div>
                </div>

                {/* --- Languages --- */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Languages</div>
                    {selectedLanguages.length > 0 && (
                      <button type="button" onClick={() => setSelectedLanguages([])} className="text-[10px] text-gray-400 hover:text-red-500">Clear</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["English", "Pidgin English", "Hausa", "Igbo", "Yoruba", "French", "Spanish", "Arabic", "Portuguese", "Other"].map((opt) => {
                      const selected = selectedLanguages.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSelectedLanguages((prev) => prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt])}
                          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            selected
                              ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm"
                              : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* --- Ethnicity --- */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Ethnicity</div>
                    {selectedEthnicities.length > 0 && (
                      <button type="button" onClick={() => setSelectedEthnicities([])} className="text-[10px] text-gray-400 hover:text-red-500">Clear</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Hausa-Fulani (North)", "Yoruba (Southwest)", "Igbo (Southeast)", "Ijaw (Niger Delta)",
                      "Kanuri (Northeast)", "Tiv (Middle Belt)", "Edo (South)", "Ibibio/Efik (South-South)",
                      "White / caucasian", "Asian Black", "African Descent", "Mixed Race",
                      "Mediterranean Middle Eastern", "East Indian", "Latin-American", "Other",
                    ].map((opt) => {
                      const selected = selectedEthnicities.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSelectedEthnicities((prev) => prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt])}
                          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            selected
                              ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm"
                              : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* --- Education --- */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Education</div>
                    {selectedEducations.length > 0 && (
                      <button type="button" onClick={() => setSelectedEducations([])} className="text-[10px] text-gray-400 hover:text-red-500">Clear</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["High school", "Associates degree", "Some college", "Bachelors degree/Masters", "PhD / post doctoral"].map((opt) => {
                      const selected = selectedEducations.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSelectedEducations((prev) => prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt])}
                          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            selected
                              ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm"
                              : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* --- Religion --- */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Religion</div>
                    {selectedReligions.length > 0 && (
                      <button type="button" onClick={() => setSelectedReligions([])} className="text-[10px] text-gray-400 hover:text-red-500">Clear</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["Christian / Christian", "Protestant", "Muslim / Islam", "Hindu", "Shinto", "Sikh", "Other"].map((opt) => {
                      const selected = selectedReligions.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSelectedReligions((prev) => prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt])}
                          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            selected
                              ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm"
                              : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* --- Want Children --- */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Want Children</div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "any", label: "Any" },
                      { key: "yes", label: "Want kids" },
                      { key: "no", label: "Don't want kids" },
                      { key: "maybe", label: "Not sure yet" },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setChildrenPref(opt.key)}
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          childrenPref === opt.key
                            ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* --- Smoking Habits --- */}
                <div className="border-t border-gray-100 pt-4 pb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Smoking Habits</div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "", label: "Any" },
                      { key: "Never", label: "Never" },
                      { key: "Smoke Socially", label: "Socially" },
                      { key: "Regularly", label: "Regularly" },
                      { key: "Trying to quit", label: "Trying to quit" },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setSmokerPref(opt.key)}
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          smokerPref === opt.key
                            ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="z-10 flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3 rounded-b-2xl">
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-sm text-gray-500 hover:text-red-500 transition-colors"
                >
                  Reset All
                </button>
                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && (
                    <span className="text-xs text-gray-400">{filteredProfiles.length} result{filteredProfiles.length !== 1 ? "s" : ""}</span>
                  )}
                  <button 
                    type="button" 
                    onClick={() => setShowFilters(false)} 
                    className="rounded-full bg-[#1f419a] px-6 py-2 text-sm font-medium text-white hover:bg-[#17357b] shadow-sm transition-colors"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Profile Detail Modal */}
      <ProfileDetailModal
        userId={selectedProfile?.user_id || null}
        isOpen={!!selectedProfile}
        onClose={() => setSelectedProfile(null)}
        matchScore={selectedProfile?.matchScore}
        matchLabel={selectedProfile?.matchLabel}
        matchColor={selectedProfile?.matchColor}
        matchBgColor={selectedProfile?.matchBgColor}
        onRequestMeeting={(id) => {
          setSelectedProfile(null); // Close detail modal first
          const p = profiles.find((pr) => pr.user_id === id);
          if (p) handleRequestMeeting(p.user_id, p.name, p.imageUrl, p.tier || "basic");
        }}
      />

      {/* Meeting Request Modal */}
      {selectedUserForMeeting && (
        <MeetingRequestModal
          isOpen={meetingRequestModalOpen}
          onClose={() => {
            setMeetingRequestModalOpen(false);
            setSelectedUserForMeeting(null);
          }}
          targetUser={selectedUserForMeeting}
          onSuccess={(meeting) => {
            // Success handled by modal
          }}
        />
      )}

      </div>
    </div>
  );
}
