"use client";

/**
 * BlockedLocationsPage — Manage blocked countries/locations
 *
 * Users can add countries or cities they want to block.
 * Profiles from blocked locations won't appear in their
 * discover/search results, and those users can't contact them.
 *
 * URL: /dashboard/profile/preferences/blocked-locations
 */

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Plus,
  X,
  Trash2,
  Shield,
  Loader2,
  Search,
  Globe,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------
// Common countries/regions for quick-add
// ---------------------------------------------------------------
const POPULAR_COUNTRIES = [
  "Nigeria",
  "United Kingdom",
  "United States",
  "Canada",
  "Ghana",
  "South Africa",
  "Kenya",
  "India",
  "Germany",
  "France",
  "Australia",
  "United Arab Emirates",
  "Saudi Arabia",
  "Brazil",
  "Mexico",
  "China",
  "Japan",
  "South Korea",
  "Turkey",
  "Egypt",
  "Morocco",
  "Italy",
  "Spain",
  "Netherlands",
  "Sweden",
  "Norway",
  "Russia",
  "Philippines",
  "Indonesia",
  "Pakistan",
];

// ---------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------

export default function BlockedLocationsPage() {
  const [blockedLocations, setBlockedLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  /**
   * Fetch blocked locations on mount
   */
  const fetchBlockedLocations = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/profile/blocked-locations", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setBlockedLocations(data.blocked_locations || []);
      }
    } catch (err) {
      console.error("Error fetching blocked locations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlockedLocations();
  }, [fetchBlockedLocations]);

  /**
   * Add a location to the blocked list
   */
  const addLocation = async (location: string) => {
    const clean = location.trim();
    if (!clean) return;

    // Check if already blocked
    if (
      blockedLocations.some(
        (loc) => loc.toLowerCase() === clean.toLowerCase()
      )
    ) {
      setToast({ type: "error", text: `"${clean}" is already blocked` });
      return;
    }

    if (blockedLocations.length >= 50) {
      setToast({ type: "error", text: "Maximum 50 blocked locations reached" });
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/profile/blocked-locations", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "add", location: clean }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setBlockedLocations(data.blocked_locations || [...blockedLocations, clean]);
        setCustomLocation("");
        setToast({ type: "success", text: `Blocked "${clean}"` });
      } else {
        setToast({
          type: "error",
          text: data.error || "Failed to add location",
        });
      }
    } catch {
      setToast({ type: "error", text: "Something went wrong" });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Remove a location from the blocked list
   */
  const removeLocation = async (location: string) => {
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/profile/blocked-locations", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "remove", location }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setBlockedLocations(
          data.blocked_locations ||
            blockedLocations.filter(
              (loc) => loc.toLowerCase() !== location.toLowerCase()
            )
        );
        setToast({ type: "success", text: `Unblocked "${location}"` });
      } else {
        setToast({
          type: "error",
          text: data.error || "Failed to remove location",
        });
      }
    } catch {
      setToast({ type: "error", text: "Something went wrong" });
    } finally {
      setSaving(false);
    }
  };

  // Filter countries by search term
  const filteredCountries = POPULAR_COUNTRIES.filter(
    (country) =>
      country.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !blockedLocations.some(
        (loc) => loc.toLowerCase() === country.toLowerCase()
      )
  );

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/matchindeed.svg" alt="Matchindeed" width={140} height={36} style={{ width: "auto", height: "auto" }} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden md:block w-56 flex-shrink-0">
          <Sidebar active="preference" />
        </aside>

        <section className="space-y-6">
          {/* Back Link */}
          <Link
            href="/dashboard/profile/preferences"
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Preferences
          </Link>

          {/* Header Card */}
          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Blocked Locations
                </h1>
                <p className="text-gray-600 mt-1">
                  Block specific countries or cities. Users from blocked
                  locations won&apos;t appear in your discover/search and
                  can&apos;t contact you.
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 flex items-center gap-4">
              <div className="rounded-full bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 border border-red-200">
                {blockedLocations.length} location{blockedLocations.length !== 1 ? "s" : ""} blocked
              </div>
              <div className="text-xs text-gray-400">
                Max 50 locations
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
            </div>
          ) : (
            <>
              {/* Currently Blocked */}
              <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-red-500" />
                  Currently Blocked
                </h2>

                {blockedLocations.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Globe className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No locations blocked yet</p>
                    <p className="text-sm mt-1">
                      Add countries or cities below to filter them out
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {blockedLocations.map((loc) => (
                      <div
                        key={loc}
                        className="group flex items-center gap-2 rounded-full bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-800 transition-all hover:bg-red-100"
                      >
                        <MapPin className="h-3.5 w-3.5 text-red-500" />
                        <span>{loc}</span>
                        <button
                          type="button"
                          onClick={() => removeLocation(loc)}
                          disabled={saving}
                          className="ml-1 rounded-full p-0.5 text-red-400 hover:text-red-600 hover:bg-red-200 transition-colors disabled:opacity-50"
                          title={`Unblock ${loc}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Custom Location */}
              <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-[#1f419a]" />
                  Add Custom Location
                </h2>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customLocation.trim()) {
                        addLocation(customLocation);
                      }
                    }}
                    placeholder="Type a country, city, or region..."
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => addLocation(customLocation)}
                    disabled={saving || !customLocation.trim()}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-5 py-3 text-sm font-medium text-white hover:opacity-90 transition disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Block
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Press Enter or click Block. You can type any country name,
                  city, or region.
                </p>
              </div>

              {/* Quick-Add Countries */}
              <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Globe className="h-5 w-5 text-[#1f419a]" />
                  Quick-Add Countries
                </h2>

                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search countries..."
                    className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-2.5 text-sm focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none transition"
                  />
                </div>

                {/* Countries Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                  {filteredCountries.map((country) => (
                    <button
                      key={country}
                      type="button"
                      onClick={() => addLocation(country)}
                      disabled={saving}
                      className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-all disabled:opacity-50 text-left"
                    >
                      <Plus className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{country}</span>
                    </button>
                  ))}
                  {filteredCountries.length === 0 && (
                    <div className="col-span-full text-center py-6 text-gray-400 text-sm">
                      {searchTerm
                        ? "No matching countries found. Use custom location above."
                        : "All popular countries are already blocked."}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`flex items-center gap-3 rounded-2xl px-5 py-3 shadow-xl border ${
              toast.type === "success"
                ? "bg-white text-gray-900 border-green-200"
                : "bg-white text-gray-900 border-red-200"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500" />
            )}
            <span className="text-sm font-medium">{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 rounded-full p-1 hover:bg-gray-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
