"use client";

/**
 * PreferencesViewPage — MatchIndeed
 *
 * Enhanced read-only view of saved dating preferences with:
 * - Standard dashboard layout (header, sidebar)
 * - Grouped sections: Basics, Background, Lifestyle, Family
 * - Brand-consistent colors (#1f419a)
 * - Quick action links (Edit, Blocked Users, Blocked Locations)
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Heart,
  Pencil,
  Sliders,
  Shield,
  MapPin,
  Loader2,
  Ruler,
  Globe,
  Church,
  GraduationCap,
  Briefcase,
  Baby,
  Cigarette,
  Wine,
  Utensils,
  PawPrint,
  Users,
  CalendarRange,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type PreferencesData = {
  partner_location: string | null;
  partner_age_range: string | null;
  partner_height_min_cm: number | null;
  partner_height_max_cm: number | null;
  partner_ethnicity: string[] | null;
  partner_religion: string[] | null;
  partner_education: string[] | null;
  partner_employment: string | null;
  partner_have_children: string | null;
  partner_want_children: string | null;
  partner_smoking: string | null;
  partner_drinking: string | null;
  partner_diet: string | null;
  partner_pets: string | null;
  partner_experience: string | null;
  partner_plans: string | null;
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function titleCase(s: string | null): string {
  if (!s) return "Not set";
  return s
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatHeightRange(minCm: number | null, maxCm: number | null): string {
  if (!minCm || !maxCm) return "Open to any height";
  const fmtFt = (cm: number) => {
    const f = Math.floor(cm / 30.48);
    const i = Math.round((cm % 30.48) / 2.54);
    return `${f}'${i}"`;
  };
  return `${fmtFt(minCm)} – ${fmtFt(maxCm)} (${minCm}–${maxCm} cm)`;
}

function boolPref(val: string | null, yes: string, no: string, def = "No preference"): string {
  if (val === "yes") return yes;
  if (val === "no") return no;
  if (val === "doesnt_matter") return def;
  return titleCase(val);
}

type PrefRow = { icon: React.ReactNode; label: string; value: string };

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function PreferencesViewPage() {
  const [prefs, setPrefs] = useState<PreferencesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        const { data } = await supabase
          .from("user_preferences")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data) setPrefs(data as PreferencesData);
      } catch (err) {
        console.error("Error fetching preferences:", err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  // ---------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="mt-3 text-sm text-gray-500">Loading preferences...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Build rows
  // ---------------------------------------------------------------
  const basics: PrefRow[] = [];
  const background: PrefRow[] = [];
  const lifestyle: PrefRow[] = [];
  const family: PrefRow[] = [];

  if (prefs) {
    // Basics
    if (prefs.partner_location) basics.push({ icon: <MapPin className="h-4 w-4" />, label: "Location", value: prefs.partner_location });
    if (prefs.partner_age_range) basics.push({ icon: <CalendarRange className="h-4 w-4" />, label: "Age Range", value: prefs.partner_age_range });
    if (prefs.partner_height_min_cm || prefs.partner_height_max_cm) basics.push({ icon: <Ruler className="h-4 w-4" />, label: "Height", value: formatHeightRange(prefs.partner_height_min_cm, prefs.partner_height_max_cm) });

    // Background
    if (prefs.partner_ethnicity?.length) background.push({ icon: <Globe className="h-4 w-4" />, label: "Ethnicity", value: prefs.partner_ethnicity.join(", ") });
    if (prefs.partner_religion?.length) background.push({ icon: <Church className="h-4 w-4" />, label: "Religion", value: prefs.partner_religion.join(", ") });
    if (prefs.partner_education?.length) background.push({ icon: <GraduationCap className="h-4 w-4" />, label: "Education", value: prefs.partner_education.join(", ") });
    if (prefs.partner_employment) background.push({ icon: <Briefcase className="h-4 w-4" />, label: "Employment", value: titleCase(prefs.partner_employment) });

    // Lifestyle
    if (prefs.partner_smoking) lifestyle.push({ icon: <Cigarette className="h-4 w-4" />, label: "Smoking", value: boolPref(prefs.partner_smoking, "Smokes", "Doesn't smoke") });
    if (prefs.partner_drinking) lifestyle.push({ icon: <Wine className="h-4 w-4" />, label: "Drinking", value: boolPref(prefs.partner_drinking, "Drinks", "Doesn't drink") });
    if (prefs.partner_diet) lifestyle.push({ icon: <Utensils className="h-4 w-4" />, label: "Diet", value: titleCase(prefs.partner_diet) });
    if (prefs.partner_pets) lifestyle.push({ icon: <PawPrint className="h-4 w-4" />, label: "Pets", value: boolPref(prefs.partner_pets, "Has pets", "No pets") });

    // Family
    if (prefs.partner_have_children) family.push({ icon: <Baby className="h-4 w-4" />, label: "Has Children", value: boolPref(prefs.partner_have_children, "Has kids", "No kids") });
    if (prefs.partner_want_children) family.push({ icon: <Baby className="h-4 w-4" />, label: "Wants Children", value: boolPref(prefs.partner_want_children, "Wants kids", "Doesn't want kids") });
    if (prefs.partner_experience) family.push({ icon: <Heart className="h-4 w-4" />, label: "Experience", value: titleCase(prefs.partner_experience) });
    if (prefs.partner_plans) family.push({ icon: <Users className="h-4 w-4" />, label: "Plans", value: titleCase(prefs.partner_plans) });
  }

  const hasAny = basics.length + background.length + lifestyle.length + family.length > 0;

  // Section renderer
  const Section = ({ title, rows }: { title: string; rows: PrefRow[] }) =>
    rows.length > 0 ? (
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {title}
        </h3>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-gray-50"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#eef2ff] text-[#1f419a]">
                {r.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  {r.label}
                </p>
                <p className="truncate text-sm font-medium text-gray-900">{r.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null;

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
          <Sidebar active="preference" />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 space-y-5">
          {/* Page header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                <Sliders className="h-7 w-7 text-[#1f419a]" />
                My Preferences
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Your ideal partner preferences used for matching
              </p>
            </div>
            <Link
              href="/dashboard/profile/preferences?edit=1"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg"
            >
              <Pencil className="h-4 w-4" />
              Edit Preferences
            </Link>
          </div>

          {/* Quick links */}
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/profile/preferences/blocked-users"
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <Shield className="h-3.5 w-3.5" />
              Blocked Users
            </Link>
            <Link
              href="/dashboard/profile/preferences/blocked-locations"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50"
            >
              <MapPin className="h-3.5 w-3.5" />
              Blocked Locations
            </Link>
          </div>

          {/* Content */}
          {hasAny ? (
            <div className="space-y-4">
              <Section title="Basics" rows={basics} />
              <Section title="Background" rows={background} />
              <Section title="Lifestyle" rows={lifestyle} />
              <Section title="Family & Relationship" rows={family} />
            </div>
          ) : (
            <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-black/5">
              <Sliders className="mx-auto mb-3 h-10 w-10 text-gray-200" />
              <h3 className="font-semibold text-gray-900">No preferences set yet</h3>
              <p className="mt-1 text-sm text-gray-400">
                Set your preferences so we can match you with compatible people.
              </p>
              <Link
                href="/dashboard/profile/preferences?edit=1"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-5 py-2.5 text-sm font-semibold text-white shadow-md"
              >
                <Sliders className="h-4 w-4" />
                Set Preferences
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
