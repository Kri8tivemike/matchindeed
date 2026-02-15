"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Heart, User, ChevronLeft, ChevronRight, ChevronDown, X, Compass, Star, Loader2, AlertCircle, Video, CheckCircle, SlidersHorizontal, ArrowUpDown, Eye, BadgeCheck } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";
import ProfileDetailModal from "@/components/ProfileDetailModal";
import { supabase } from "@/lib/supabase";
import { createActivity, type ActivityResponse } from "@/lib/activities";
import { calculateCompatibility, type ProfileData, type UserPreferences } from "@/lib/top-picks-algorithm";
import { getBlockedUserIds } from "@/lib/blocked-users";
import { getActiveStatus } from "@/lib/active-status";
import MeetingRequestModal from "@/components/MeetingRequestModal";
import { useToast } from "@/components/ToastProvider";

type Profile = {
  id: string;
  name: string;
  age: number | null;
  city: string | null;
  imageUrl: string;
  heightLabel: string;
  heightCm?: number | null;
  tags: string[];
  similaritiesLabel: string;
  user_id: string;
  /** Compatibility score 0–100 from the algorithm */
  matchScore: number;
  /** Color class for the match badge */
  matchColor: string;
  /** Background color class for the match badge */
  matchBgColor: string;
  /** Human-friendly match label */
  matchLabel: string;
  /** Extra detail fields for enriched cards & filtering */
  gender?: string | null;
  religion?: string | null;
  ethnicity?: string | null;
  education?: string | null;
  languages?: string[] | null;
  smoking_habits?: string | null;
  have_children?: boolean | null;
  want_children?: string | null;
  relationship_status?: string | null;
  verified?: boolean;
  /** Last active timestamp */
  lastActiveAt?: string | null;
  /** Formatted active status label */
  activeLabel?: string;
  /** Tailwind color class for active status */
  activeColor?: string;
  /** Whether user is currently online */
  isUserOnline?: boolean;
};

export default function DiscoverPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [activityLimits, setActivityLimits] = useState<{
    day: { used: number; limit: number };
    week: { used: number; limit: number };
    month: { used: number; limit: number };
  } | null>(null);
  const [mutualMatch, setMutualMatch] = useState<string | null>(null);
  const [likedProfileIds, setLikedProfileIds] = useState<Set<string>>(new Set());

  // Meeting request modal state
  const [meetingRequestModalOpen, setMeetingRequestModalOpen] = useState(false);
  const [selectedUserForMeeting, setSelectedUserForMeeting] = useState<{
    id: string;
    first_name: string | null;
    profile_photo_url: string | null;
    tier: string;
  } | null>(null);

  const { toast: globalToast } = useToast();

  // --- Filter & Sort state ---
  const [showFilters, setShowFilters] = useState(false);
  const [filterMinAge, setFilterMinAge] = useState(18);
  const [filterMaxAge, setFilterMaxAge] = useState(70);
  const [filterCity, setFilterCity] = useState("");
  const [filterGender, setFilterGender] = useState("");
  const [filterRelStatus, setFilterRelStatus] = useState("");
  const [filterVerified, setFilterVerified] = useState(false);
  const [filterHeightMin, setFilterHeightMin] = useState(140);
  const [filterHeightMax, setFilterHeightMax] = useState(220);
  const [filterLanguages, setFilterLanguages] = useState<string[]>([]);
  const [filterEthnicities, setFilterEthnicities] = useState<string[]>([]);
  const [filterEducations, setFilterEducations] = useState<string[]>([]);
  const [filterReligions, setFilterReligions] = useState<string[]>([]);
  const [filterChildren, setFilterChildren] = useState("any");
  const [filterSmoking, setFilterSmoking] = useState("");
  const [sortBy, setSortBy] = useState<string>("match");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showProfileDetail, setShowProfileDetail] = useState(false);

  // Fetch existing wink/interested activities on mount
  useEffect(() => {
    const fetchExistingWinksInterests = async () => {
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
        console.error("Error fetching wink/interested activities:", err);
      }
    };

    fetchExistingWinksInterests();
  }, []);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"discover" | "topPicks">("discover");
  const profileFallbacks = [
    "/placeholder-profile.svg",
    "/placeholder-profile.svg",
    "/placeholder-profile.svg"
  ];
  const profileFallbackIdxRef = useRef(0);
  const [profileImgSrc, setProfileImgSrc] = useState<string | null>(null);

  type TopPick = {
    id: string | null;
    user_id: string;
    name: string;
    age: number | null;
    city: string | null;
    imageUrl: string;
    score?: number;
    height_cm?: number | null;
    education_level?: string | null;
    employment?: string | null;
    religion?: string | null;
    have_children?: string | null;
    want_children?: string | null;
    smoking?: string | null;
    drinking?: string | null;
    diet?: string | null;
    pets?: string | null;
  };

  const [topPicks, setTopPicks] = useState<TopPick[]>([]);
  const [topPicksLoading, setTopPicksLoading] = useState(false);
  const [topPicksError, setTopPicksError] = useState<string | null>(null);
  const [topPickIndex, setTopPickIndex] = useState(0);
  const topPick = topPicks[topPickIndex] ?? null;
  const fallbackPeople = [
    "/placeholder-profile.svg",
    "/placeholder-profile.svg",
    "/placeholder-profile.svg"
  ];
  const topImageIdxRef = useRef(0);
  const [topImageSrc, setTopImageSrc] = useState<string>(topPick ? topPick.imageUrl : fallbackPeople[0]);
  const [topAvatarSrcs, setTopAvatarSrcs] = useState<string[]>(() => topPicks.map(p => p.imageUrl));

  const [countdown, setCountdown] = useState("00:00:00");
  const lastRefreshDateRef = useRef<string>("");
  
  useEffect(() => {
    const update = () => {
      const now = new Date();
      // Calculate time until next day (midnight)
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const diff = Math.max(0, tomorrow.getTime() - now.getTime());
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      setCountdown(`${h}:${m}:${s}`);
      
      // If countdown reaches 0 and we haven't refreshed today, refresh top picks
      const today = now.toISOString().split("T")[0];
      if (diff <= 1000 && activeTab === "topPicks" && lastRefreshDateRef.current !== today) {
        lastRefreshDateRef.current = today;
        fetchTopPicks();
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [activeTab]);

  /**
   * Fetch profiles from database
   * MUST be before early returns to ensure it runs
   */
  useEffect(() => {
    let isMounted = true;
    
    const fetchProfiles = async () => {
      try {
        if (!isMounted) return;
        setLoading(true);
        
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (!isMounted) return;
        if (!user) {
          console.error("Not authenticated");
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

        // Get user's preferences for filtering (including blocked locations)
        const { data: preferences } = await supabase
          .from("user_preferences")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        // Extract blocked locations for filtering
        const blockedLocations: string[] = preferences?.blocked_locations || [];

        // Fetch other users' profiles
        // Try a simple query first to test RLS
        const { data: testData, error: testError } = await supabase
          .from("user_profiles")
          .select("user_id, first_name")
          .limit(5);
        

        if (testError) {
          console.error("RLS test failed:", testError);
          setError(`RLS Error: ${testError.message}. Please check database policies.`);
          setLoading(false);
          return;
        }

        // Now fetch full profiles
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
            have_children,
            want_children,
            smoking_habits,
            ethnicity,
            languages,
            relationship_type,
            relationship_status,
            updated_at
          `)
          .limit(50); // Get more, we'll filter in memory


        if (profilesError) {
          console.error("Error fetching profiles:", profilesError);
          setError(`Failed to load profiles: ${profilesError.message || "Unknown error"}`);
          setLoading(false);
          return;
        }

        // Get blocked user IDs (bidirectional) and filter them out
        const blockedUserIds = await getBlockedUserIds();

        // Filter out current user's profile and blocked users
        const otherProfiles = (profilesData || []).filter(
          (p: any) => p.user_id !== user.id && !blockedUserIds.has(p.user_id)
        );

        if (otherProfiles.length === 0) {
          setProfiles([]);
          setLoading(false);
          return;
        }

        // Fetch account display names separately (only if we have profiles)
        let accountsMap = new Map();
        const accountIds = otherProfiles.map((p: any) => p.user_id);

        // Try fetching with profile_visible filter; fall back if column doesn't exist
        let accountsData: any[] | null = null;
        let accountsError: any = null;

        const { data: accData, error: accErr } = await supabase
          .from("accounts")
          .select("id, display_name, account_status, profile_visible, email_verified, last_active_at")
          .in("id", accountIds);

        if (accErr && accErr.code === "42703") {
          // Columns don't exist yet — query without them
          const { data: fallbackData, error: fallbackErr } = await supabase
            .from("accounts")
            .select("id, display_name, account_status, email_verified")
            .in("id", accountIds);
          accountsData = (fallbackData || []).map((a: any) => ({ ...a, profile_visible: true, last_active_at: null }));
          accountsError = fallbackErr;
        } else {
          accountsData = accData;
          accountsError = accErr;
        }

        if (accountsError) {
          console.warn("Error fetching account names:", accountsError);
          // Continue without account names - not critical
        } else {
          // Only include active AND visible accounts
          const activeAccounts = (accountsData || []).filter(
            (a: any) => a.account_status === "active" && a.profile_visible !== false
          );
          accountsMap = new Map(activeAccounts.map((a: any) => [a.id, a]));
        }

        // Get users the current user has rejected (to exclude them from discovery)
        // IMPORTANT: We ONLY exclude "rejected" profiles, NOT profiles that have been:
        // - Liked (users can see profiles they've liked again)
        // - Winked at (users can see profiles they've winked at again)
        // - Interested in (users can see profiles they're interested in again)
        // When a user "unlikes" someone (deletes the activity), that profile will automatically
        // appear in discover again since there's no "rejected" activity for them.
        const { data: rejectedActivities } = await supabase
          .from("user_activities")
          .select("target_user_id")
          .eq("user_id", user.id)
          .eq("activity_type", "rejected");

        const rejectedUserIds = new Set((rejectedActivities || []).map((a: any) => a.target_user_id));

        // Get profiles the current user has liked (to show red heart icon)
        const { data: likedActivities } = await supabase
          .from("user_activities")
          .select("target_user_id")
          .eq("user_id", user.id)
          .in("activity_type", ["like", "wink", "interested"]);

        const likedIds = new Set((likedActivities || []).map((a: any) => a.target_user_id));
        setLikedProfileIds(likedIds);

        // Get mutual interests (profiles that have liked this user)
        const { data: mutualActivities } = await supabase
          .from("user_activities")
          .select("user_id")
          .eq("target_user_id", user.id)
          .in("activity_type", ["like", "wink", "interested"]);

        const mutualUserIds = new Set((mutualActivities || []).map((a: any) => a.user_id));
        
        
        let filteredProfiles = otherProfiles.filter((p: any) => {
          // Only include profiles with active accounts
          const hasActiveAccount = accountsMap.has(p.user_id);
          if (!hasActiveAccount) {
            return false;
          }
          // Exclude ONLY users that have been explicitly rejected
          // Note: Profiles that were liked/winked/interested (but not rejected) will still appear
          // When a user unlikes someone, the activity is deleted, so they'll appear here again
          if (rejectedUserIds.has(p.user_id)) {
            return false;
          }

          // Exclude users from blocked locations
          if (blockedLocations.length > 0 && p.location) {
            const profileLoc = (p.location || "").toLowerCase();
            const isBlocked = blockedLocations.some((blocked: string) =>
              profileLoc.includes(blocked.toLowerCase()) ||
              blocked.toLowerCase().includes(profileLoc)
            );
            if (isBlocked) {
              return false;
            }
          }

          return true;
        });
        

        // Apply age range filter if preferences exist
        // If no profiles match the age range, show all profiles anyway (preference is a guide, not a hard requirement)
        if (preferences?.partner_age_range) {
          // Parse age range (e.g., "25-35" or "40 - 49" with spaces)
          const ageRangeStr = preferences.partner_age_range.trim().replace(/\s+/g, "-");
          const [minAge, maxAge] = ageRangeStr.split("-").map(Number);
          if (minAge && maxAge) {
            const beforeCount = filteredProfiles.length;
            const ageFiltered = filteredProfiles.filter((p: any) => {
              if (!p.date_of_birth) {
                return false;
              }
              const birthDate = new Date(p.date_of_birth);
              const today = new Date();
              let age = today.getFullYear() - birthDate.getFullYear();
              const monthDiff = today.getMonth() - birthDate.getMonth();
              if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
              }
              const matches = age >= minAge && age <= maxAge;
              return matches;
            });
            
            // If age filter removed all profiles, use original list (preference is a guide)
            if (ageFiltered.length > 0) {
              filteredProfiles = ageFiltered;
            } else {
            }
          }
        } else {
        }

        // Calculate compatibility scores for each profile and sort by score
        const profilesWithScores = filteredProfiles.map((p: any) => {
          const account = accountsMap.get(p.user_id);
          
          // Map profile data to ProfileData format for compatibility algorithm
          const profileData: ProfileData = {
            user_id: p.user_id,
            first_name: p.first_name,
            last_name: p.last_name,
            date_of_birth: p.date_of_birth,
            location: p.location,
            height_cm: p.height_cm,
            photos: p.photos,
            profile_photo_url: p.profile_photo_url,
            education_level: p.education_level,
            employment: null, // Not available in user_profiles
            religion: p.religion,
            have_children: p.have_children === true ? "yes" : (p.have_children === false ? "no" : null),
            want_children: p.want_children,
            smoking: p.smoking_habits,
            drinking: null, // Not available in user_profiles
            diet: null, // Not available in user_profiles
            pets: null, // Not available in user_profiles
            ethnicity: p.ethnicity ? (typeof p.ethnicity === 'string' ? [p.ethnicity] : p.ethnicity) : null,
          };

          // Calculate compatibility score
          const compatibilityScore = calculateCompatibility(
            profileData,
            preferences as UserPreferences | null,
            account?.account_status || "inactive",
            null, // last_login not available
            p.updated_at,
            rejectedUserIds.has(p.user_id),
            likedIds.has(p.user_id),
            mutualUserIds.has(p.user_id)
          );

          return {
            profile: p,
            account,
            score: compatibilityScore.score,
            compatibility: compatibilityScore,
          };
        });

        // Sort by compatibility score (highest first)
        profilesWithScores.sort((a, b) => b.score - a.score);

        // Transform profiles data with compatibility scores
        const transformedProfiles: Profile[] = profilesWithScores.map(({ profile: p, account, score }) => {
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

          // Format height
          let heightLabel = "Not specified";
          if (p.height_cm) {
            const feet = Math.floor(p.height_cm / 30.48);
            const inches = Math.round((p.height_cm % 30.48) / 2.54);
            heightLabel = `${feet}'${inches}" • ${p.height_cm} cm`;
          }

          // Get primary photo
          const primaryPhoto = (p.photos && p.photos.length > 0)
            ? p.photos[0]
            : p.profile_photo_url || "/placeholder-profile.svg";

          // Build tags
          const tags: string[] = [];
          if (p.education_level) {
            tags.push(p.education_level);
          }
          if (p.have_children) {
            tags.push("Has kids");
          }
          if (p.want_children === "yes") {
            tags.push("Wants kids");
          } else if (p.want_children === "no") {
            tags.push("Doesn't want kids");
          }
          if (p.relationship_type) {
            tags.push(p.relationship_type);
          }
          
          // Add compatibility indicator tag for high-scoring profiles
          if (score >= 70) {
            tags.unshift("⭐ High Match");
          } else if (score >= 50) {
            tags.unshift("✨ Good Match");
          }

          // Determine match badge styling based on compatibility score
          let matchLabel = "Discover";
          let matchColor = "text-gray-600";
          let matchBgColor = "bg-gray-50 border-gray-200";
          if (score >= 85) {
            matchLabel = "Excellent Match";
            matchColor = "text-emerald-700";
            matchBgColor = "bg-emerald-50 border-emerald-200";
          } else if (score >= 70) {
            matchLabel = "Great Match";
            matchColor = "text-blue-700";
            matchBgColor = "bg-blue-50 border-blue-200";
          } else if (score >= 50) {
            matchLabel = "Good Match";
            matchColor = "text-amber-700";
            matchBgColor = "bg-amber-50 border-amber-200";
          } else if (score >= 30) {
            matchLabel = "Fair Match";
            matchColor = "text-orange-700";
            matchBgColor = "bg-orange-50 border-orange-200";
          }

          return {
            id: p.user_id,
            user_id: p.user_id,
            name: p.first_name || account?.display_name || "User",
            age,
            city: p.location || "Unknown",
            imageUrl: primaryPhoto,
            heightLabel,
            heightCm: p.height_cm || null,
            tags: tags.slice(0, 4),
            similaritiesLabel: score >= 70 ? "Great match based on your preferences" : score >= 50 ? "Good match based on your preferences" : "Discover new connections",
            matchScore: score,
            matchLabel,
            matchColor,
            matchBgColor,
            gender: p.gender || null,
            religion: p.religion || null,
            ethnicity: p.ethnicity || null,
            education: p.education_level || null,
            languages: p.languages || [],
            smoking_habits: p.smoking_habits || null,
            have_children: p.have_children || null,
            want_children: p.want_children || null,
            relationship_status: p.relationship_status || null,
            verified: account?.email_verified || false,
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

        if (!isMounted) return;
        setProfiles(transformedProfiles);
      } catch (err) {
        if (!isMounted) return;
        console.error("Error in fetchProfiles:", err);
        setError(`Failed to load profiles: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchProfiles();
    
    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Count active filters for badge display
   */
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterMinAge !== 18 || filterMaxAge !== 70) count++;
    if (filterCity.trim()) count++;
    if (filterVerified) count++;
    if (filterGender) count++;
    if (filterRelStatus) count++;
    if (filterHeightMin !== 140 || filterHeightMax !== 220) count++;
    if (filterLanguages.length > 0) count++;
    if (filterEthnicities.length > 0) count++;
    if (filterEducations.length > 0) count++;
    if (filterReligions.length > 0) count++;
    if (filterChildren !== "any") count++;
    if (filterSmoking) count++;
    return count;
  }, [filterMinAge, filterMaxAge, filterCity, filterVerified, filterGender, filterRelStatus, filterHeightMin, filterHeightMax, filterLanguages, filterEthnicities, filterEducations, filterReligions, filterChildren, filterSmoking]);

  /**
   * Build active filter chips for quick removal
   */
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (filterMinAge !== 18 || filterMaxAge !== 70)
      chips.push({ key: "age", label: `Age ${filterMinAge}–${filterMaxAge}`, onClear: () => { setFilterMinAge(18); setFilterMaxAge(70); } });
    if (filterCity.trim())
      chips.push({ key: "city", label: `📍 ${filterCity}`, onClear: () => setFilterCity("") });
    if (filterVerified)
      chips.push({ key: "verified", label: "✓ Verified", onClear: () => setFilterVerified(false) });
    if (filterGender)
      chips.push({ key: "gender", label: `${filterGender}`, onClear: () => setFilterGender("") });
    if (filterRelStatus)
      chips.push({ key: "relStatus", label: `${filterRelStatus}`, onClear: () => setFilterRelStatus("") });
    if (filterHeightMin !== 140 || filterHeightMax !== 220)
      chips.push({ key: "height", label: `Height ${filterHeightMin}–${filterHeightMax}cm`, onClear: () => { setFilterHeightMin(140); setFilterHeightMax(220); } });
    if (filterLanguages.length > 0)
      chips.push({ key: "langs", label: `🗣 ${filterLanguages.join(", ")}`, onClear: () => setFilterLanguages([]) });
    if (filterEthnicities.length > 0)
      chips.push({ key: "ethnic", label: `🌍 ${filterEthnicities.length} ethnicit${filterEthnicities.length === 1 ? "y" : "ies"}`, onClear: () => setFilterEthnicities([]) });
    if (filterEducations.length > 0)
      chips.push({ key: "edu", label: `🎓 ${filterEducations.length} education`, onClear: () => setFilterEducations([]) });
    if (filterReligions.length > 0)
      chips.push({ key: "religion", label: `🙏 ${filterReligions.join(", ")}`, onClear: () => setFilterReligions([]) });
    if (filterChildren !== "any") {
      const labels: Record<string, string> = { yes: "Wants kids", no: "No kids", maybe: "Maybe kids" };
      chips.push({ key: "children", label: `👶 ${labels[filterChildren] || filterChildren}`, onClear: () => setFilterChildren("any") });
    }
    if (filterSmoking)
      chips.push({ key: "smoking", label: `🚬 ${filterSmoking}`, onClear: () => setFilterSmoking("") });
    return chips;
  }, [filterMinAge, filterMaxAge, filterCity, filterVerified, filterGender, filterRelStatus, filterHeightMin, filterHeightMax, filterLanguages, filterEthnicities, filterEducations, filterReligions, filterChildren, filterSmoking]);

  /**
   * Reset all filters to defaults
   */
  const resetAllFilters = useCallback(() => {
    setFilterMinAge(18);
    setFilterMaxAge(70);
    setFilterCity("");
    setFilterVerified(false);
    setFilterGender("");
    setFilterRelStatus("");
    setFilterHeightMin(140);
    setFilterHeightMax(220);
    setFilterLanguages([]);
    setFilterEthnicities([]);
    setFilterEducations([]);
    setFilterReligions([]);
    setFilterChildren("any");
    setFilterSmoking("");
  }, []);

  /**
   * Filter and sort profiles based on user's filter selections
   */
  const filteredProfiles = useMemo(() => {
    // Step 1: Filter
    const filtered = profiles.filter((p) => {
      if (p.age !== null && (p.age < filterMinAge || p.age > filterMaxAge)) return false;
      if (filterVerified && !p.verified) return false;
      if (filterCity.trim()) {
        const cityLower = filterCity.toLowerCase().trim();
        const profileCity = (p.city || "").toLowerCase();
        if (!profileCity.includes(cityLower)) return false;
      }
      if (filterGender) {
        if (!p.gender || p.gender.toLowerCase() !== filterGender.toLowerCase()) return false;
      }
      if (filterRelStatus) {
        if (!p.relationship_status || p.relationship_status.toLowerCase() !== filterRelStatus.toLowerCase()) return false;
      }
      if ((filterHeightMin !== 140 || filterHeightMax !== 220) && p.heightCm) {
        if (p.heightCm < filterHeightMin || p.heightCm > filterHeightMax) return false;
      }
      if (filterLanguages.length > 0) {
        if (!p.languages || !Array.isArray(p.languages) || p.languages.length === 0) return false;
        const hasMatch = filterLanguages.some(lang =>
          p.languages!.some((pl: string) => pl.toLowerCase().includes(lang.toLowerCase()) || lang.toLowerCase().includes(pl.toLowerCase()))
        );
        if (!hasMatch) return false;
      }
      if (filterEducations.length > 0) {
        if (!p.education || !filterEducations.includes(p.education)) return false;
      }
      if (filterReligions.length > 0) {
        if (!p.religion || !filterReligions.includes(p.religion)) return false;
      }
      if (filterEthnicities.length > 0) {
        if (!p.ethnicity) return false;
        const profileEths = typeof p.ethnicity === "string" ? p.ethnicity.split(",").map(e => e.trim()) : Array.isArray(p.ethnicity) ? p.ethnicity : [];
        const hasMatch = filterEthnicities.some(sel => profileEths.some((pe: string) => pe.toLowerCase().includes(sel.toLowerCase()) || sel.toLowerCase().includes(pe.toLowerCase())));
        if (!hasMatch) return false;
      }
      if (filterChildren !== "any") {
        if (!p.want_children || p.want_children !== filterChildren) return false;
      }
      if (filterSmoking) {
        if (!p.smoking_habits) return false;
        const smokingMap: Record<string, string[]> = {
          "Never": ["never"], "Smoke Socially": ["occasionally", "socially"],
          "Regularly": ["regularly"], "Trying to quit": ["trying_to_quit", "trying to quit"],
        };
        const ps = p.smoking_habits.toLowerCase();
        const allowed = smokingMap[filterSmoking] || [];
        if (!allowed.some(a => ps.includes(a.toLowerCase()))) return false;
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
        break; // keep original order
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
    }

    return sorted;
  }, [profiles, filterMinAge, filterMaxAge, filterCity, filterVerified, filterGender, filterRelStatus, filterHeightMin, filterHeightMax, filterLanguages, filterEducations, filterReligions, filterEthnicities, filterChildren, filterSmoking, sortBy]);

  // Reset currentIndex when filters change and it goes out of bounds
  useEffect(() => {
    if (currentIndex >= filteredProfiles.length && filteredProfiles.length > 0) {
      setCurrentIndex(0);
      profileFallbackIdxRef.current = 0;
      setProfileImgSrc(null);
    }
  }, [filteredProfiles.length, currentIndex]);

  const currentProfile = filteredProfiles[currentIndex] ?? null;

  /**
   * Fetch top picks from API
   */
  const fetchTopPicks = async () => {
    try {
      setTopPicksLoading(true);
      setTopPicksError(null);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setTopPicksError("Not authenticated");
        setTopPicksLoading(false);
        return;
      }

      const response = await fetch(`/api/top-picks?user_id=${user.id}`);
      const result = await response.json();

      if (!response.ok) {
        setTopPicksError(result.error || "Failed to load top picks");
        setTopPicks([]);
        return;
      }

      if (result.picks && result.picks.length > 0) {
        setTopPicks(result.picks);
        // Reset index if current index is out of bounds
        if (topPickIndex >= result.picks.length) {
          setTopPickIndex(0);
        }
        // Update image sources
        if (result.picks[0]?.imageUrl) {
          setTopImageSrc(result.picks[0].imageUrl);
        }
        setTopAvatarSrcs(result.picks.map((p: TopPick) => p.imageUrl || "/placeholder-profile.svg"));
      } else {
        setTopPicks([]);
      }
    } catch (error) {
      console.error("Error fetching top picks:", error);
      setTopPicksError("An error occurred while loading top picks");
      setTopPicks([]);
    } finally {
      setTopPicksLoading(false);
    }
  };

  /**
   * Fetch top picks when tab switches to topPicks
   */
  useEffect(() => {
    if (activeTab === "topPicks" && !topPicksLoading) {
      fetchTopPicks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Show loading state
  if (loading && profiles.length === 0) {
    return (
      <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="text-gray-500 text-sm">Loading profiles...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && profiles.length === 0) {
    return (
      <div className="min-h-screen w-full bg-gray-50">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href="/dashboard"><Image src="/matchindeed.svg" alt="MatchIndeed" width={130} height={34} style={{ width: "auto", height: "auto" }} /></Link>
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-12">
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-white p-8 shadow-sm ring-1 ring-black/5">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <h2 className="text-lg font-semibold text-gray-900">Error Loading Profiles</h2>
            <p className="text-sm text-gray-500">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 rounded-lg bg-[#1f419a] px-6 py-2 text-sm text-white hover:bg-[#17357b]"
            >
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Show empty state with sidebar
  if (!loading && profiles.length === 0) {
    return (
      <div className="min-h-screen w-full bg-gray-50">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href="/dashboard"><Image src="/matchindeed.svg" alt="MatchIndeed" width={130} height={34} style={{ width: "auto", height: "auto" }} /></Link>
            <NotificationBell />
          </div>
        </header>

        <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
          <aside className="hidden md:block w-56 flex-shrink-0 space-y-4">
            <Sidebar active="discover" />
            <ProfileCompletenessCard variant="compact" />
          </aside>

          <main className="flex-1 min-w-0 space-y-4">
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-white p-12 shadow-sm ring-1 ring-black/5">
              <User className="h-12 w-12 text-gray-300" />
              <h2 className="text-lg font-semibold text-gray-900">No Profiles Available</h2>
              <p className="text-sm text-gray-500">There are no profiles to show at the moment. Check back later!</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const showPrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? filteredProfiles.length - 1 : prev - 1));
    profileFallbackIdxRef.current = 0;
    setProfileImgSrc(null);
  };

  const showNext = () => {
    setCurrentIndex((prev) => (prev + 1) % filteredProfiles.length);
    profileFallbackIdxRef.current = 0;
    setProfileImgSrc(null);
  };

  /**
   * Handle opening meeting request modal
   */
  const handleRequestMeeting = async (targetUserId: string) => {
    try {
      // Get target user's profile and account info
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("user_id, first_name, profile_photo_url")
        .eq("user_id", targetUserId)
        .single();

      const { data: account } = await supabase
        .from("accounts")
        .select("tier")
        .eq("id", targetUserId)
        .single();

      if (profile && account) {
        setSelectedUserForMeeting({
          id: targetUserId,
          first_name: profile.first_name,
          profile_photo_url: profile.profile_photo_url,
          tier: account.tier,
        });
        setMeetingRequestModalOpen(true);
      } else {
        setError("Failed to load user information. Please try again.");
      }
    } catch (err) {
      console.error("Error opening meeting request:", err);
      setError("Failed to open meeting request. Please try again.");
    }
  };

  const handleAnswer = async (answer: "yes" | "no", targetUserId?: string) => {
    // Use targetUserId if provided (for top picks), otherwise use currentProfile
    const profileToUse = targetUserId 
      ? topPicks.find(p => p.user_id === targetUserId)
      : currentProfile;
    
    if (!profileToUse || processing) return;
    
    const userIdToUse = targetUserId || currentProfile?.user_id;
    if (!userIdToUse) return;

    if (answer === "no") {
      // Create a "rejected" activity and move to next profile
      setProcessing(true);
      setError(null);

      try {
        const response: ActivityResponse = await createActivity(
          userIdToUse,
          "rejected"
        );

        if (response.success) {
          // If it's from top picks, remove from top picks list
          if (targetUserId && activeTab === "topPicks") {
            const updatedTopPicks = topPicks.filter((p) => p.user_id !== userIdToUse);
            setTopPicks(updatedTopPicks);
            if (updatedTopPicks.length > 0) {
              const newIndex = topPickIndex >= updatedTopPicks.length ? 0 : topPickIndex;
              setTopPickIndex(newIndex);
              if (updatedTopPicks[newIndex]?.imageUrl) {
                setTopImageSrc(updatedTopPicks[newIndex].imageUrl);
              }
              topImageIdxRef.current = 0;
            } else {
              // No more top picks, reset to first
              setTopPickIndex(0);
              setTopImageSrc("/placeholder-profile.svg");
            }
          } else {
            // Remove the rejected profile from the current list
            const updatedProfiles = profiles.filter((p) => p.user_id !== userIdToUse);
            setProfiles(updatedProfiles);
            
            // Move to next profile (or handle empty state)
            if (updatedProfiles.length > 0) {
              // Adjust index if needed
              const newIndex = currentIndex >= updatedProfiles.length ? 0 : currentIndex;
              setCurrentIndex(newIndex);
              profileFallbackIdxRef.current = 0;
              setProfileImgSrc(null);
            }
          }
          // If no profiles remain, the empty state will automatically show
        } else {
          // Revert the optimistic update on error
          setLikedProfileIds(prev => {
            const updated = new Set(prev);
            updated.delete(currentProfile.user_id);
            return updated;
          });
          setError(response.error || "Failed to save your action. Please try again.");
        }
      } catch (err) {
        console.error("Error in handleAnswer (reject):", err);
        setError("An error occurred. Please try again.");
      } finally {
        setProcessing(false);
      }
      return;
    }

    // User clicked "Yes" - create a "like" activity
    setProcessing(true);
    setError(null);
    setMutualMatch(null);

    try {
      // Optimistically update the liked state
      setLikedProfileIds(prev => new Set(prev).add(userIdToUse));
      const response: ActivityResponse = await createActivity(
        userIdToUse,
        "like"
      );

      if (response.success) {
        // Ensure the profile is marked as liked
        setLikedProfileIds(prev => new Set(prev).add(userIdToUse));
        
        // Check for mutual match
        if (response.mutual_match) {
          setMutualMatch(userIdToUse);
          const profileName = targetUserId 
            ? topPicks.find(p => p.user_id === targetUserId)?.name || "this person"
            : currentProfile?.name || "this person";
          // Show success message
          globalToast.match(`It's a match! You and ${profileName} both like each other!`);
        }

        // Update activity limits if provided
        if (response.limits) {
          setActivityLimits(response.limits);
        }

        // Move to next profile
        if (targetUserId && activeTab === "topPicks") {
          // Move to next top pick
          const currentIdx = topPicks.findIndex(p => p.user_id === targetUserId);
          if (currentIdx >= 0 && topPicks.length > 1) {
            const nextIdx = (currentIdx + 1) % topPicks.length;
            setTopPickIndex(nextIdx);
            if (topPicks[nextIdx]?.imageUrl) {
              setTopImageSrc(topPicks[nextIdx].imageUrl);
            }
            topImageIdxRef.current = 0;
          }
        } else if (!targetUserId) {
          showNext();
        }
      } else {
        // Revert the optimistic update on error
        setLikedProfileIds(prev => {
          const updated = new Set(prev);
          updated.delete(userIdToUse);
          return updated;
        });
        // Handle errors
        if (response.period && response.limit !== undefined && response.used !== undefined) {
          // Limit reached
          const periodLabel = response.period === "day" ? "daily" : response.period === "week" ? "weekly" : "monthly";
          setError(`You've reached your ${periodLabel} limit (${response.used}/${response.limit}). Please try again later.`);
        } else {
          setError(response.error || "Failed to save your like. Please try again.");
        }
      }
    } catch (err) {
      console.error("Error in handleAnswer:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/dashboard"><Image src="/matchindeed.svg" alt="MatchIndeed" width={130} height={34} style={{ width: "auto", height: "auto" }} /></Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden md:block w-56 flex-shrink-0 space-y-4">
          <Sidebar active="discover" />
          <ProfileCompletenessCard variant="compact" />
        </aside>

        <main className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef2ff] text-[#1f419a]"><User className="h-5 w-5"/></div>
              <div className="text-sm text-gray-700">
                {filteredProfiles.length > 0 
                  ? <>Discover <span className="font-medium">{filteredProfiles.length}</span> {filteredProfiles.length === 1 ? 'profile' : 'profiles'}{activeFilterCount > 0 && filteredProfiles.length !== profiles.length && <span className="ml-1 text-xs text-blue-600">(filtered from {profiles.length})</span>}</>
                  : profiles.length > 0
                    ? "No profiles match your filters — try adjusting them"
                    : "Complete your profile to get the best Matchindeed experience!"
                }
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Sort Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
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
                          onClick={() => { setSortBy(option.key); setShowSortMenu(false); setCurrentIndex(0); setProfileImgSrc(null); }}
                          className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                            sortBy === option.key ? "bg-[#1f419a]/10 text-[#1f419a] font-semibold" : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <span className="text-base">{option.icon}</span>
                          <span>{option.label}</span>
                          {sortBy === option.key && <CheckCircle className="h-4 w-4 ml-auto text-[#1f419a]" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Filters Button */}
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#1f419a] text-[10px] font-bold text-white px-1">{activeFilterCount}</span>
                )}
              </button>
            </div>
          </div>

          {/* Active filter chips */}
          {activeFilterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/60 px-4 py-2.5 ring-1 ring-black/5">
              {activeFilterChips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1.5 rounded-full bg-[#1f419a]/10 border border-[#1f419a]/20 px-3 py-1 text-xs font-medium text-[#1f419a]">
                  {chip.label}
                  <button type="button" onClick={chip.onClear} className="ml-0.5 rounded-full p-0.5 hover:bg-[#1f419a]/20 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button type="button" onClick={resetAllFilters} className="text-xs text-gray-500 hover:text-red-500 underline underline-offset-2 transition-colors">Clear all</button>
            </div>
          )}

          <div className="rounded-3xl bg-white p-4 shadow-lg ring-1 ring-black/5">
            <div className="flex items-center justify-center px-2">
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => setActiveTab("discover")}
                className={`relative text-lg font-semibold ${
                  activeTab === "discover" ? "text-gray-900" : "text-gray-500"
                }`}
              >
                <span className="inline-flex items-center gap-2"><Compass className="h-4 w-4"/>Discover</span>
                {activeTab === "discover" && (
                  <span className="absolute -bottom-2 left-0 h-[3px] w-16 rounded-full bg-[#1f419a]"></span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("topPicks")}
                className={`relative text-lg font-semibold ${
                  activeTab === "topPicks" ? "text-gray-900" : "text-gray-500"
                }`}
              >
                <span className="inline-flex items-center gap-2"><Star className="h-4 w-4"/>Top picks</span>
                {activeTab === "topPicks" && (
                  <span className="absolute -bottom-2 left-0 h-[3px] w-20 rounded-full bg-[#1f419a]"></span>
                )}
              </button>
            </div>
            </div>

            {activeTab === "discover" && (
              currentProfile ? (
              <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[1fr_1px_1fr]">
                <div className="relative overflow-hidden rounded-3xl ring-1 ring-black/5 bg-[#eef2ff]">
                  <div className="relative aspect-[4/5]">
                    <Image
                      src={profileImgSrc ?? currentProfile.imageUrl}
                      alt={`${currentProfile.name} profile photo`}
                      fill
                      sizes="(min-width:768px) 500px, 100vw"
                      className="rounded-3xl object-cover"
                      onError={() => {
                        if (profileFallbackIdxRef.current < profileFallbacks.length) {
                          setProfileImgSrc(profileFallbacks[profileFallbackIdxRef.current]);
                          profileFallbackIdxRef.current += 1;
                        } else {
                          setProfileImgSrc("/placeholder-profile.svg");
                        }
                      }}
                    />
                      <div className="absolute right-6 top-6 flex items-center gap-2">
                        {currentProfile && likedProfileIds.has(currentProfile.user_id) ? (
                          <div className="h-9 w-9 rounded-full bg-white shadow ring-2 ring-red-500 flex items-center justify-center">
                            <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                          </div>
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-white shadow ring-2 ring-[#1f419a] flex items-center justify-center">
                            <Heart className="h-4 w-4 text-[#1f419a]" />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={showPrev}
                        aria-label="Previous profile"
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={showNext}
                        aria-label="Next profile"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white">
                        {currentIndex + 1} / {filteredProfiles.length}
                      </div>
                  </div>
                </div>
                <div className="hidden w-px bg-gray-200 md:block" />
                <div className="p-5 rounded-3xl bg-white shadow-sm">
                    {/* Match Badge */}
                    {currentProfile.matchScore > 0 && (
                      <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold mb-3 ${currentProfile.matchBgColor} ${currentProfile.matchColor}`}>
                        <span className="text-sm">{currentProfile.matchScore >= 70 ? "🔥" : currentProfile.matchScore >= 50 ? "✨" : "👋"}</span>
                        {currentProfile.matchScore}% &middot; {currentProfile.matchLabel}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 text-2xl font-semibold text-gray-900">
                      {currentProfile.name}
                      {currentProfile.verified && (
                        <BadgeCheck className="h-5 w-5 text-blue-500 flex-shrink-0" title="Verified profile" />
                      )}
                    </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow ring-2 ring-[#1f419a]">
                      <User className="h-3 w-3 text-[#1f419a]" />
                    </span>
                    <span>
                      {currentProfile.age !== null ? `${currentProfile.age}, ` : ""}
                      {currentProfile.city || "Unknown location"}
                    </span>
                    {currentProfile.activeLabel && (
                      <span className={`flex items-center gap-1 text-xs ${currentProfile.activeColor || "text-gray-400"}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${currentProfile.isUserOnline ? "bg-green-500" : "bg-gray-300"}`} />
                        {currentProfile.activeLabel}
                      </span>
                    )}
                  </div>

                  {/* Extra profile details */}
                  {(currentProfile.religion || currentProfile.ethnicity) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {currentProfile.ethnicity && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2.5 py-0.5 text-[11px] font-medium text-purple-700">
                          🌍 {currentProfile.ethnicity}
                        </span>
                      )}
                      {currentProfile.religion && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700">
                          🙏 {currentProfile.religion}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-800 shadow-sm">
                      <span>📏</span>
                      <span>{currentProfile.heightLabel}</span>
                    </span>
                    {currentProfile.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-800 shadow-sm"
                      >
                        {tag === "Masters" && <span>🎓</span>}
                        {tag === "Has kids" && <span>👶</span>}
                        {tag === "Have kids" && <span>👶</span>}
                        {tag === "Don't want kids" && <span>🚫👶</span>}
                        {tag === "True love" && <span>🔎</span>}
                        <span>{tag}</span>
                      </span>
                    ))}
                  </div>
                  {/* Prompt */}
                  <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#eef2ff] p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f419a]/10 flex-shrink-0">
                      <Compass className="h-4 w-4 text-[#1f419a]" />
                    </div>
                    <div className="text-sm">
                      <div className="font-medium text-gray-800">{currentProfile.similaritiesLabel}</div>
                      <div className="text-gray-500">Do you like {currentProfile.name}?</div>
                    </div>
                  </div>
                  {/* View Full Profile Button */}
                  <button
                    type="button"
                    onClick={() => setShowProfileDetail(true)}
                    className="mt-3 flex items-center gap-2 rounded-full border border-[#1f419a]/30 bg-[#1f419a]/5 px-4 py-2 text-sm text-[#1f419a] hover:bg-[#1f419a]/10 transition-colors w-full justify-center"
                  >
                    <Eye className="h-4 w-4" />
                    View Full Profile
                  </button>
                  {error && (
                    <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  )}
                  {mutualMatch && (
                    <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-2">
                      <Heart className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <p className="text-sm text-green-800">It's a match! You both like each other!</p>
                    </div>
                  )}
                  {activityLimits && (
                    <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-3">
                      <p className="text-xs text-blue-800 mb-1">Activity Limits</p>
                      <div className="text-xs text-blue-700 space-y-1">
                        <div>Today: {activityLimits.day.used}/{activityLimits.day.limit === Infinity ? "∞" : activityLimits.day.limit}</div>
                        <div>This Week: {activityLimits.week.used}/{activityLimits.week.limit === Infinity ? "∞" : activityLimits.week.limit}</div>
                        <div>This Month: {activityLimits.month.used}/{activityLimits.month.limit === Infinity ? "∞" : activityLimits.month.limit}</div>
                      </div>
                    </div>
                  )}
                  {currentProfile && likedProfileIds.has(currentProfile.user_id) ? (
                    <div className="mt-6 flex flex-col gap-3">
                      <div className="flex items-center justify-center">
                      <div className="group flex items-center gap-2 rounded-full bg-gradient-to-r from-red-50 via-pink-50 to-red-50 px-6 py-3 border border-red-200 shadow-md transition-all duration-500 ease-out hover:shadow-lg hover:scale-105" style={{ animation: 'fadeIn 0.5s ease-out, slideUp 0.5s ease-out' }}>
                        <Heart className="h-5 w-5 text-red-500 fill-red-500 transition-all duration-300 group-hover:scale-110" style={{ animation: 'heartbeat 2s ease-in-out infinite' }} />
                        <span className="text-sm font-semibold text-red-700 tracking-wide">Liked!</span>
                      </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRequestMeeting(currentProfile.user_id)}
                        className="h-11 w-full rounded-full border-2 border-[#1f419a] bg-white text-sm font-medium text-[#1f419a] shadow-sm flex items-center justify-center gap-2 transition-all hover:bg-[#eef2ff] hover:shadow-md hover:scale-105 active:scale-95"
                      >
                        <Video className="h-4 w-4" />
                        Request Video Meeting
                      </button>
                    </div>
                  ) : (
                    <div className="mt-6 flex flex-col gap-3">
                      <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleAnswer("no")}
                        disabled={processing}
                        className="h-11 flex-1 rounded-full border border-red-200 bg-red-50 text-sm font-medium text-red-600 shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-red-100 hover:border-red-300 hover:scale-105 active:scale-95"
                      >
                        <X className="h-4 w-4" />
                        Pass
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnswer("yes")}
                        disabled={processing}
                        className="h-11 flex-1 rounded-full bg-[#1f419a] text-sm text-white shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
                      >
                        {processing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Heart className="h-4 w-4" />
                            Yes
                          </>
                        )}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => currentProfile && handleRequestMeeting(currentProfile.user_id)}
                        className="h-11 w-full rounded-full border-2 border-[#1f419a] bg-white text-sm font-medium text-[#1f419a] shadow-sm flex items-center justify-center gap-2 transition-all hover:bg-[#eef2ff] hover:shadow-md hover:scale-105 active:scale-95"
                      >
                        <Video className="h-4 w-4" />
                        Request Video Meeting
                      </button>
                    </div>
                  )}
                </div>
              </div>
              ) : (
                <div className="mt-8 text-center py-12">
                  <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  {activeFilterCount > 0 ? (
                    <>
                      <p className="text-gray-600">No profiles match your filters</p>
                      <p className="text-sm text-gray-500 mt-2">Try adjusting your search criteria</p>
                      <button type="button" onClick={resetAllFilters} className="mt-3 text-sm text-[#1f419a] hover:underline">Clear all filters</button>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-600">No more profiles to show</p>
                      <p className="text-sm text-gray-500 mt-2">Check back later for new matches!</p>
                    </>
                  )}
                </div>
              )
            )}

            {activeTab === "topPicks" && (
              <div className="mt-4 space-y-4">
                <div className="text-center text-sm text-gray-600">
                  A selection of {topPicks.length > 0 ? topPicks.length : 5} relevant profiles suggested to you every day
                  <div className="mt-1 text-[#1f419a]">Only {countdown} left to chat with these users</div>
                </div>
                {topPicksLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
                  </div>
                ) : topPicksError ? (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center">
                    <p className="text-sm text-red-800">{topPicksError}</p>
                    <button
                      onClick={fetchTopPicks}
                      className="mt-2 text-sm text-red-600 underline hover:text-red-800"
                    >
                      Try again
                    </button>
                  </div>
                ) : topPicks.length === 0 ? (
                  <div className="text-center py-12">
                    <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">We're finding your perfect matches. Check back soon!</p>
                    <p className="text-sm text-gray-500 mt-2">Complete your preferences to get better matches.</p>
                  </div>
                ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-[90px_1fr]">
                  <div className="flex flex-col items-center gap-4">
                    {topPicks.map((p, i) => (
                      <button
                        key={p.user_id || `top-pick-${i}`}
                        type="button"
                        onClick={() => { 
                          setTopPickIndex(i); 
                          setTopImageSrc(topPicks[i]?.imageUrl || "/placeholder-profile.svg"); 
                          topImageIdxRef.current = 0; 
                        }}
                        className={`rounded-full p-[2px] ${i === topPickIndex ? "ring-2 ring-[#1f419a]" : "ring-0"}`}
                        aria-label={`Select ${p.name}`}
                      >
                        <Image
                          src={topAvatarSrcs[i]}
                          alt={`${p.name} avatar`}
                          width={56}
                          height={56}
                          sizes="56px"
                          className="h-14 w-14 rounded-full object-cover shadow"
                          onError={() =>
                            setTopAvatarSrcs((prev) => {
                              const copy = [...prev];
                              copy[i] = "/placeholder-profile.svg";
                              return copy;
                            })
                          }
                        />
                      </button>
                    ))}
                  </div>
                  <div className="overflow-hidden rounded-3xl bg-white shadow ring-1 ring-black/5">
                    <div className="grid grid-cols-2">
                      <div className="relative aspect-[4/5] bg-[#eef2ff]">
                        <Image
                          src={topImageSrc}
                          alt={`${topPick?.name ?? "Profile"} large photo`}
                          fill
                          sizes="(min-width:768px) 400px, 50vw"
                          className="object-cover"
                          onError={() => {
                            if (topImageIdxRef.current < fallbackPeople.length) {
                              setTopImageSrc(fallbackPeople[topImageIdxRef.current]);
                              topImageIdxRef.current += 1;
                            } else {
                              setTopImageSrc("/placeholder-profile.svg");
                            }
                          }}
                        />
                      </div>
                      <div className="p-6">
                        <div className="text-2xl font-semibold text-gray-900">{topPick?.name}</div>
                        <div className="mt-1 text-sm text-gray-600">
                          {topPick?.age !== null && topPick?.age !== undefined ? `Age ${topPick.age}` : ""}
                          {topPick?.age !== null && topPick?.city ? ", " : ""}
                          {topPick?.city || ""}
                        </div>
                        
                        {/* Profile details tags */}
                        <div className="mt-4 flex flex-wrap gap-2">
                          {topPick?.height_cm && (
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                              {Math.floor(topPick.height_cm / 30.48)}'{Math.round((topPick.height_cm % 30.48) / 2.54)}"
                            </span>
                          )}
                          {topPick?.education_level && (
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                              {topPick.education_level}
                            </span>
                          )}
                          {topPick?.employment && (
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                              {topPick.employment}
                            </span>
                          )}
                          {topPick?.religion && (
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                              {topPick.religion}
                            </span>
                          )}
                        </div>

                        {/* View Full Profile Button */}
                        <button
                          type="button"
                          onClick={() => setShowProfileDetail(true)}
                          className="mt-3 flex items-center gap-2 rounded-full border border-[#1f419a]/30 bg-[#1f419a]/5 px-4 py-2 text-sm text-[#1f419a] hover:bg-[#1f419a]/10 transition-colors w-full justify-center"
                        >
                          <Eye className="h-4 w-4" />
                          View Full Profile
                        </button>

                        {/* Interaction buttons */}
                        {topPick && likedProfileIds.has(topPick.user_id) ? (
                          <div className="mt-6 flex flex-col gap-3">
                            <div className="flex items-center justify-center">
                            <div className="group flex items-center gap-2 rounded-full bg-gradient-to-r from-red-50 via-pink-50 to-red-50 px-6 py-3 border border-red-200 shadow-md transition-all duration-500 ease-out hover:shadow-lg hover:scale-105" style={{ animation: 'fadeIn 0.5s ease-out, slideUp 0.5s ease-out' }}>
                              <Heart className="h-5 w-5 text-red-500 fill-red-500 transition-all duration-300 group-hover:scale-110" style={{ animation: 'heartbeat 2s ease-in-out infinite' }} />
                              <span className="text-sm font-semibold text-red-700 tracking-wide">Liked!</span>
                            </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => topPick && handleRequestMeeting(topPick.user_id)}
                              className="h-11 w-full rounded-full border-2 border-[#1f419a] bg-white text-sm font-medium text-[#1f419a] shadow-sm flex items-center justify-center gap-2 transition-all hover:bg-[#eef2ff] hover:shadow-md hover:scale-105 active:scale-95"
                            >
                              <Video className="h-4 w-4" />
                              Request Video Meeting
                            </button>
                          </div>
                        ) : (
                          <div className="mt-6 flex flex-col gap-3">
                            <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => topPick && handleAnswer("no", topPick.user_id)}
                              disabled={processing}
                              className="h-11 flex-1 rounded-full border-2 border-gray-300 bg-white text-sm text-gray-700 shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-gray-50 hover:border-gray-400 hover:scale-105 active:scale-95"
                            >
                              <X className="h-4 w-4" />
                              Pass
                            </button>
                            <button
                              type="button"
                              onClick={() => topPick && handleAnswer("yes", topPick.user_id)}
                              disabled={processing}
                              className="h-11 flex-1 rounded-full bg-[#1f419a] text-sm text-white shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
                            >
                              {processing ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Heart className="h-4 w-4" />
                                  Yes
                                </>
                              )}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => topPick && handleRequestMeeting(topPick.user_id)}
                              className="h-11 w-full rounded-full border-2 border-[#1f419a] bg-white text-sm font-medium text-[#1f419a] shadow-sm flex items-center justify-center gap-2 transition-all hover:bg-[#eef2ff] hover:shadow-md hover:scale-105 active:scale-95"
                            >
                              <Video className="h-4 w-4" />
                              Request Video Meeting
                            </button>
                          </div>
                        )}

                      </div>
                    </div>
                  </div>
                </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Filter Modal */}
      {showFilters && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowFilters(false)} />
          <div className="relative max-h-[90vh] w-[94vw] max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl flex flex-col">
            {/* Header */}
            <div className="z-10 flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1f419a]/10">
                  <SlidersHorizontal className="h-4 w-4 text-[#1f419a]" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-900">Discover Filters</div>
                  {activeFilterCount > 0 && (
                    <div className="text-xs text-gray-500">{activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active</div>
                  )}
                </div>
              </div>
              <button type="button" onClick={() => setShowFilters(false)} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"><X className="h-5 w-5" /></button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Gender */}
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2"><User className="h-3.5 w-3.5" /> Gender</div>
                <div className="flex flex-wrap gap-2">
                  {["", "Male", "Female", "Non-binary"].map((opt) => (
                    <button key={opt || "any"} type="button" onClick={() => setFilterGender(opt)}
                      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${filterGender === opt ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm" : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
                    >{opt || "Any"}</button>
                  ))}
                </div>
              </div>

              {/* Age */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Age Range</div>
                  <div className="text-sm font-medium text-gray-900">{filterMinAge} – {filterMaxAge}</div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-6 text-right">{filterMinAge}</span>
                  <input type="range" min={18} max={70} value={filterMinAge} onChange={(e) => setFilterMinAge(Math.min(Number(e.target.value), filterMaxAge))} className="range-brand h-2 w-full cursor-pointer" />
                  <input type="range" min={18} max={70} value={filterMaxAge} onChange={(e) => setFilterMaxAge(Math.max(Number(e.target.value), filterMinAge))} className="range-brand h-2 w-full cursor-pointer" />
                  <span className="text-xs text-gray-400 w-6">{filterMaxAge}</span>
                </div>
              </div>

              {/* Location */}
              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Location</div>
                <input type="text" value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#1f419a] focus:ring-1 focus:ring-[#1f419a] focus:outline-none transition-colors"
                  placeholder="Enter city or country..."
                />
              </div>

              {/* Match Options */}
              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Match Options</div>
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-[#1f419a]" /><span className="text-sm text-gray-700">Verified profiles only</span></div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" checked={filterVerified} onChange={(e) => setFilterVerified(e.target.checked)} className="peer sr-only" />
                    <div className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-[#1f419a] after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-all peer-checked:after:translate-x-4"></div>
                  </label>
                </div>
              </div>

              {/* Relationship Status */}
              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Relationship Status</div>
                <div className="flex flex-wrap gap-2">
                  {["", "Single", "Divorced", "Widowed", "Separated"].map((opt) => (
                    <button key={opt || "any"} type="button" onClick={() => setFilterRelStatus(opt)}
                      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${filterRelStatus === opt ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm" : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
                    >{opt || "Any"}</button>
                  ))}
                </div>
              </div>

              {/* Height */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Height</div>
                  <div className="text-sm font-medium text-gray-900">{filterHeightMin} cm – {filterHeightMax} cm</div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-10 text-right">{filterHeightMin}</span>
                  <input type="range" min={140} max={220} value={filterHeightMin} onChange={(e) => setFilterHeightMin(Math.min(Number(e.target.value), filterHeightMax))} className="range-brand h-2 w-full cursor-pointer" />
                  <input type="range" min={140} max={220} value={filterHeightMax} onChange={(e) => setFilterHeightMax(Math.max(Number(e.target.value), filterHeightMin))} className="range-brand h-2 w-full cursor-pointer" />
                  <span className="text-xs text-gray-400 w-10">{filterHeightMax}</span>
                </div>
              </div>

              {/* Languages */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Languages</div>
                  {filterLanguages.length > 0 && <button type="button" onClick={() => setFilterLanguages([])} className="text-[10px] text-gray-400 hover:text-red-500">Clear</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {["English", "Pidgin English", "Hausa", "Igbo", "Yoruba", "French", "Spanish", "Arabic", "Portuguese", "Other"].map((opt) => {
                    const sel = filterLanguages.includes(opt);
                    return (
                      <button key={opt} type="button" onClick={() => setFilterLanguages(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt])}
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${sel ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm" : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
                      >{opt}</button>
                    );
                  })}
                </div>
              </div>

              {/* Ethnicity */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Ethnicity</div>
                  {filterEthnicities.length > 0 && <button type="button" onClick={() => setFilterEthnicities([])} className="text-[10px] text-gray-400 hover:text-red-500">Clear</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Hausa-Fulani (North)", "Yoruba (Southwest)", "Igbo (Southeast)", "Ijaw (Niger Delta)", "Kanuri (Northeast)", "Tiv (Middle Belt)", "Edo (South)", "Ibibio/Efik (South-South)", "White / caucasian", "Asian Black", "African Descent", "Mixed Race", "Mediterranean Middle Eastern", "East Indian", "Latin-American", "Other"].map((opt) => {
                    const sel = filterEthnicities.includes(opt);
                    return (
                      <button key={opt} type="button" onClick={() => setFilterEthnicities(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt])}
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${sel ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm" : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
                      >{opt}</button>
                    );
                  })}
                </div>
              </div>

              {/* Education */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Education</div>
                  {filterEducations.length > 0 && <button type="button" onClick={() => setFilterEducations([])} className="text-[10px] text-gray-400 hover:text-red-500">Clear</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {["High school", "Associates degree", "Some college", "Bachelors degree/Masters", "PhD / post doctoral"].map((opt) => {
                    const sel = filterEducations.includes(opt);
                    return (
                      <button key={opt} type="button" onClick={() => setFilterEducations(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt])}
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${sel ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm" : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
                      >{opt}</button>
                    );
                  })}
                </div>
              </div>

              {/* Religion */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Religion</div>
                  {filterReligions.length > 0 && <button type="button" onClick={() => setFilterReligions([])} className="text-[10px] text-gray-400 hover:text-red-500">Clear</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Christian / Christian", "Protestant", "Muslim / Islam", "Hindu", "Shinto", "Sikh", "Other"].map((opt) => {
                    const sel = filterReligions.includes(opt);
                    return (
                      <button key={opt} type="button" onClick={() => setFilterReligions(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt])}
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${sel ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm" : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
                      >{opt}</button>
                    );
                  })}
                </div>
              </div>

              {/* Want Children */}
              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Want Children</div>
                <div className="flex flex-wrap gap-2">
                  {[{ key: "any", label: "Any" }, { key: "yes", label: "Want kids" }, { key: "no", label: "Don't want kids" }, { key: "maybe", label: "Not sure yet" }].map((opt) => (
                    <button key={opt.key} type="button" onClick={() => setFilterChildren(opt.key)}
                      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${filterChildren === opt.key ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm" : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Smoking */}
              <div className="border-t border-gray-100 pt-4 pb-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Smoking Habits</div>
                <div className="flex flex-wrap gap-2">
                  {[{ key: "", label: "Any" }, { key: "Never", label: "Never" }, { key: "Smoke Socially", label: "Socially" }, { key: "Regularly", label: "Regularly" }, { key: "Trying to quit", label: "Trying to quit" }].map((opt) => (
                    <button key={opt.key} type="button" onClick={() => setFilterSmoking(opt.key)}
                      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${filterSmoking === opt.key ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm" : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="z-10 flex items-center justify-between border-t border-gray-100 bg-gray-50 px-5 py-3 rounded-b-2xl">
              <button type="button" onClick={resetAllFilters} className="text-sm text-gray-500 hover:text-red-500 transition-colors">Reset All</button>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && (
                  <span className="text-xs text-gray-400">{filteredProfiles.length} result{filteredProfiles.length !== 1 ? "s" : ""}</span>
                )}
                <button type="button" onClick={() => { setShowFilters(false); setCurrentIndex(0); setProfileImgSrc(null); }}
                  className="rounded-full bg-[#1f419a] px-6 py-2 text-sm font-medium text-white hover:bg-[#17357b] shadow-sm transition-colors"
                >Apply Filters</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            // Show success message
            setError(null);
          }}
        />
      )}

      {/* Profile Detail Modal */}
      <ProfileDetailModal
        userId={
          activeTab === "topPicks"
            ? topPick?.user_id || null
            : currentProfile?.user_id || null
        }
        isOpen={showProfileDetail}
        onClose={() => setShowProfileDetail(false)}
        onRequestMeeting={(uid) => handleRequestMeeting(uid)}
      />

    </div>
  );
}
