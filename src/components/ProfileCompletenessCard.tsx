"use client";

/**
 * ProfileCompletenessCard
 *
 * A reusable component that displays a circular progress ring
 * showing profile completeness, the user's tier, and up to 3
 * high-impact missing fields with a CTA to complete the profile.
 *
 * Usage:
 *   <ProfileCompletenessCard />
 *
 * The component fetches its own data on mount via the API.
 * It hides itself if the profile is 100% complete (or can show a congratulations).
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle,
  ArrowRight,
  Sparkles,
  Loader2,
  User,
  MapPin,
  Camera,
  Heart,
  Ruler,
  BookOpen,
  Globe,
  MessageCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  calculateCompleteness,
  getTopMissingFields,
  type CompletenessResult,
} from "@/lib/profile-completeness";

// Map field keys to icons for visual appeal
const FIELD_ICONS: Record<string, React.ReactNode> = {
  first_name: <User className="h-4 w-4" />,
  date_of_birth: <User className="h-4 w-4" />,
  gender: <User className="h-4 w-4" />,
  location: <MapPin className="h-4 w-4" />,
  about_yourself: <MessageCircle className="h-4 w-4" />,
  photos: <Camera className="h-4 w-4" />,
  height_cm: <Ruler className="h-4 w-4" />,
  ethnicity: <Globe className="h-4 w-4" />,
  religion: <BookOpen className="h-4 w-4" />,
  education_level: <BookOpen className="h-4 w-4" />,
  languages: <Globe className="h-4 w-4" />,
  love_languages: <Heart className="h-4 w-4" />,
  personality_type: <Sparkles className="h-4 w-4" />,
};

/** Variant: compact (for sidebar/header) or full (for profile page) */
type Variant = "compact" | "full";

interface ProfileCompletenessCardProps {
  variant?: Variant;
  /** If true, always show even when 100% complete */
  showWhenComplete?: boolean;
}

export default function ProfileCompletenessCard({
  variant = "full",
  showWhenComplete = false,
}: ProfileCompletenessCardProps) {
  const [result, setResult] = useState<CompletenessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isCompleteBannerCollapsed, setIsCompleteBannerCollapsed] = useState(false);

  const fetchCompleteness = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Fetch the full profile
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) {
        const completeness = calculateCompleteness(profile);
        setResult(completeness);
      } else {
        // No profile at all — 0%
        setResult(calculateCompleteness({}));
      }
    } catch (err) {
      console.error("Error fetching completeness:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompleteness();
  }, [fetchCompleteness]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);
    updateIsMobile();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateIsMobile);
      return () => mediaQuery.removeEventListener("change", updateIsMobile);
    }

    mediaQuery.addListener(updateIsMobile);
    return () => mediaQuery.removeListener(updateIsMobile);
  }, []);

  useEffect(() => {
    if (!userId || typeof window === "undefined" || !result) return;

    const storageKey = `profile-completeness-collapsed:${userId}`;

    if (result.percentage < 100) {
      setIsCompleteBannerCollapsed(false);
      window.localStorage.removeItem(storageKey);
      return;
    }

    setIsCompleteBannerCollapsed(window.localStorage.getItem(storageKey) === "1");
  }, [isMobile, result, userId]);

  // Don't render while loading
  if (loading) {
    return variant === "compact" ? null : (
      <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5 flex items-center justify-center min-h-[120px]">
        <Loader2 className="h-6 w-6 animate-spin text-[#1f419a]" />
      </div>
    );
  }

  // Don't render if no data
  if (!result) return null;

  // Hide if 100% complete (unless forced to show)
  if (result.percentage >= 100 && !showWhenComplete) return null;

  const canToggleCompleteBanner =
    variant === "full" && showWhenComplete && result.percentage >= 100 && !!userId;

  const handleCollapseCompleteBanner = () => {
    if (!userId || typeof window === "undefined") return;
    const storageKey = `profile-completeness-collapsed:${userId}`;
    window.localStorage.setItem(storageKey, "1");
    setIsCompleteBannerCollapsed(true);
  };

  const handleExpandCompleteBanner = () => {
    if (!userId || typeof window === "undefined") return;
    const storageKey = `profile-completeness-collapsed:${userId}`;
    window.localStorage.removeItem(storageKey);
    setIsCompleteBannerCollapsed(false);
  };

  if (canToggleCompleteBanner && isCompleteBannerCollapsed) {
    return (
      <div className="rounded-2xl bg-white p-4 shadow-lg ring-1 ring-black/5">
        <button
          type="button"
          onClick={handleExpandCompleteBanner}
          className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-left transition-colors hover:bg-emerald-100"
        >
          <span className="flex items-center gap-2">
            <CheckCircle className="h-4.5 w-4.5 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-800">
              Show profile completeness
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-emerald-700" />
        </button>
      </div>
    );
  }

  const topMissing = getTopMissingFields(result, 3);

  // ---------------------------------------------------------------
  // SVG circular progress ring
  // ---------------------------------------------------------------
  const size = variant === "compact" ? 56 : isMobile ? 68 : 80;
  const strokeWidth = variant === "compact" ? 5 : isMobile ? 5 : 6;
  const percentageFontSize = variant === "compact" ? 14 : isMobile ? 16 : 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (result.percentage / 100) * circumference;

  const ringColor =
    result.percentage >= 100
      ? "#10b981"
      : result.percentage >= 75
      ? "#3b82f6"
      : result.percentage >= 50
      ? "#f59e0b"
      : result.percentage >= 25
      ? "#f97316"
      : "#ef4444";

  // ---------------------------------------------------------------
  // COMPACT VARIANT — minimal inline display
  // ---------------------------------------------------------------
  if (variant === "compact") {
    return (
      <Link
        href="/dashboard/profile/edit"
        className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-[#1f419a]/5 to-[#2a44a3]/5 border border-[#1f419a]/10 px-3 py-2 hover:from-[#1f419a]/10 hover:to-[#2a44a3]/10 transition-all group"
      >
        {/* Mini Ring */}
        <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            className="transition-all duration-1000"
          />
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-gray-900 font-bold"
            fontSize={percentageFontSize}
            transform={`rotate(90, ${size / 2}, ${size / 2})`}
          >
            {result.percentage}%
          </text>
        </svg>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {result.percentage >= 100 ? "Profile Complete!" : "Complete Profile"}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {result.percentage >= 100
              ? "All fields filled"
              : `${result.missingFields.length} field${result.missingFields.length !== 1 ? "s" : ""} remaining`}
          </p>
        </div>

        {result.percentage < 100 && (
          <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-[#1f419a] transition-colors flex-shrink-0" />
        )}
      </Link>
    );
  }

  // ---------------------------------------------------------------
  // FULL VARIANT — detailed card with missing fields
  // ---------------------------------------------------------------
  return (
    <div className="rounded-2xl bg-white p-4 shadow-lg ring-1 ring-black/5 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-5">
        {/* Progress Ring */}
        <div className="flex-shrink-0">
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#f3f4f6"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={ringColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              className="transition-all duration-1000"
            />
            <text
              x={size / 2}
              y={size / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-gray-900 font-bold"
              fontSize={percentageFontSize}
              transform={`rotate(90, ${size / 2}, ${size / 2})`}
            >
              {result.percentage}%
            </text>
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="mb-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="text-lg font-bold leading-tight text-gray-900 sm:text-xl">
                Profile Completeness
              </h3>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  result.percentage >= 100
                    ? "bg-emerald-50 text-emerald-700"
                    : result.percentage >= 75
                    ? "bg-blue-50 text-blue-700"
                    : result.percentage >= 50
                    ? "bg-amber-50 text-amber-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {result.tierLabel}
              </span>
              {canToggleCompleteBanner && (
                <button
                  type="button"
                  onClick={handleCollapseCompleteBanner}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Collapse
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500">
            {result.filledCount} of {result.totalCount} fields completed
          </p>

          {/* Progress Bar */}
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-gray-100 sm:mt-3">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${result.percentage}%`,
                backgroundColor: ringColor,
              }}
            />
          </div>
        </div>
      </div>

      {/* 100% Complete State */}
      {result.percentage >= 100 ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 sm:mt-5 sm:gap-3 sm:p-4">
          <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-500 sm:h-6 sm:w-6" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              Your profile is 100% complete!
            </p>
            <p className="mt-0.5 text-xs text-emerald-600">
              Complete profiles get 3x more matches. You&apos;re all set!
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Missing Fields — Top 3 Suggestions */}
          {topMissing.length > 0 && (
            <div className="mt-4 space-y-2 sm:mt-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Complete these to boost your score
              </p>
              {topMissing.map((field) => (
                <Link
                  key={field.key}
                  href="/dashboard/profile/edit"
                  className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-gray-50 to-white border border-gray-100 px-4 py-3 hover:border-[#1f419a]/30 hover:from-[#1f419a]/5 transition-all group"
                >
                  <div className="h-8 w-8 rounded-lg bg-[#1f419a]/10 flex items-center justify-center text-[#1f419a] flex-shrink-0 group-hover:bg-[#1f419a]/20 transition-colors">
                    {FIELD_ICONS[field.key] || <Sparkles className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      Add {field.label}
                    </p>
                    <p className="text-xs text-gray-500">
                      +{field.weight}% boost
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-[#1f419a] transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}

          {/* CTA Button */}
          <div className="mt-4 sm:mt-5">
            <Link
              href="/dashboard/profile/edit"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
            >
              <Sparkles className="h-4 w-4" />
              Complete My Profile
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
