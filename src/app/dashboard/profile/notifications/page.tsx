"use client";

/**
 * Notification Preferences Page — MatchIndeed
 *
 * Lets users control which notification categories they receive
 * and through which channels (in-app, email, push).
 * Reads/writes to the notification_preferences table via API.
 */

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import {
  Bell,
  Heart,
  MessageCircle,
  Eye,
  Video,
  Shield,
  Megaphone,
  Star,
  Loader2,
  Save,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ---------------------------------------------------------------
// Preference categories config
// ---------------------------------------------------------------
interface PreferenceCategory {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  channels: {
    key: string;
    label: string;
    description: string;
  }[];
}

const CATEGORIES: PreferenceCategory[] = [
  {
    key: "likes",
    label: "Likes & Interest",
    description: "When someone likes you, winks at you, or expresses interest",
    icon: Heart,
    iconColor: "text-pink-600",
    iconBg: "bg-pink-50",
    channels: [
      { key: "likes_inapp", label: "In-App", description: "Show in notification feed" },
      { key: "likes_email", label: "Email", description: "Send email notification" },
      { key: "likes_push", label: "Push", description: "Browser push notification" },
    ],
  },
  {
    key: "matches",
    label: "Mutual Matches",
    description: "When you and another person both express interest",
    icon: Star,
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
    channels: [
      { key: "matches_inapp", label: "In-App", description: "Show in notification feed" },
      { key: "matches_email", label: "Email", description: "Send email notification" },
      { key: "matches_push", label: "Push", description: "Browser push notification" },
    ],
  },
  {
    key: "messages",
    label: "Messages",
    description: "When you receive a new message from a match",
    icon: MessageCircle,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-50",
    channels: [
      { key: "messages_inapp", label: "In-App", description: "Show in notification feed" },
      { key: "messages_email", label: "Email", description: "Send email notification" },
      { key: "messages_push", label: "Push", description: "Browser push notification" },
    ],
  },
  {
    key: "meetings",
    label: "Video Meetings",
    description: "Meeting requests, acceptances, reminders, and cancellations",
    icon: Video,
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
    channels: [
      { key: "meetings_inapp", label: "In-App", description: "Show in notification feed" },
      { key: "meetings_email", label: "Email", description: "Send email notification" },
      { key: "meetings_push", label: "Push", description: "Browser push notification" },
    ],
  },
  {
    key: "views",
    label: "Profile Views",
    description: "When someone views your profile",
    icon: Eye,
    iconColor: "text-teal-600",
    iconBg: "bg-teal-50",
    channels: [
      { key: "views_inapp", label: "In-App", description: "Show in notification feed" },
      { key: "views_email", label: "Email", description: "Send email notification" },
      { key: "views_push", label: "Push", description: "Browser push notification" },
    ],
  },
  {
    key: "system",
    label: "System & Account",
    description: "Account warnings, investigation updates, credit refunds",
    icon: Shield,
    iconColor: "text-gray-600",
    iconBg: "bg-gray-100",
    channels: [
      { key: "system_inapp", label: "In-App", description: "Show in notification feed" },
      { key: "system_email", label: "Email", description: "Send email notification" },
      { key: "system_push", label: "Push", description: "Browser push notification" },
    ],
  },
  {
    key: "marketing",
    label: "Marketing & Promotions",
    description: "Tips, special offers, and platform updates",
    icon: Megaphone,
    iconColor: "text-purple-600",
    iconBg: "bg-purple-50",
    channels: [
      { key: "marketing_email", label: "Email", description: "Receive promotional emails" },
    ],
  },
];

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function NotificationPreferencesPage() {
  const { toast } = useToast();

  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    likes: true,
    matches: true,
  });

  // ---- Fetch preferences on mount ----
  const fetchPreferences = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch("/api/profile/notification-preferences", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.preferences) {
        setPrefs(data.preferences);
      }
    } catch {
      console.error("Failed to load notification preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // ---- Toggle a single preference ----
  const togglePref = (key: string) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  // ---- Save preferences ----
  const handleSave = async () => {
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Please log in to save preferences");
        return;
      }

      const res = await fetch("/api/profile/notification-preferences", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(prefs),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Notification preferences saved");
        setDirty(false);
        if (data.preferences) setPrefs(data.preferences);
      } else {
        toast.error(data.error || "Failed to save preferences");
      }
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  // ---- Toggle expand/collapse ----
  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ---- Quick actions ----
  const enableAll = () => {
    const updated: Record<string, boolean> = {};
    CATEGORIES.forEach((cat) =>
      cat.channels.forEach((ch) => {
        updated[ch.key] = true;
      })
    );
    setPrefs((prev) => ({ ...prev, ...updated }));
    setDirty(true);
  };

  const disableNonEssential = () => {
    const updated: Record<string, boolean> = {};
    CATEGORIES.forEach((cat) =>
      cat.channels.forEach((ch) => {
        // Keep in-app and system ON, turn off email/push for non-essential
        if (ch.key.endsWith("_inapp") || cat.key === "system") {
          updated[ch.key] = true;
        } else {
          updated[ch.key] = false;
        }
      })
    );
    setPrefs((prev) => ({ ...prev, ...updated }));
    setDirty(true);
  };

  // ---- Count active channels ----
  const getActiveCount = (category: PreferenceCategory) =>
    category.channels.filter((ch) => prefs[ch.key]).length;

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
          <Sidebar active="notifications" />
        </aside>

        {/* Main Content */}
        <main className="flex-1 max-w-3xl">
          {/* Page heading */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Notification Preferences
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Control what notifications you receive and how
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/profile/notifications/../../../notifications"
                className="text-sm text-[#1f419a] hover:underline"
              >
                View notifications
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
            </div>
          ) : (
            <>
              {/* Quick actions */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={enableAll}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Enable all
                </button>
                <button
                  type="button"
                  onClick={disableNonEssential}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Essential only
                </button>
              </div>

              {/* Category list */}
              <div className="space-y-3">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isExpanded = expanded[cat.key] ?? false;
                  const activeCount = getActiveCount(cat);
                  const totalCount = cat.channels.length;

                  return (
                    <div
                      key={cat.key}
                      className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-100"
                    >
                      {/* Category header */}
                      <button
                        type="button"
                        onClick={() => toggleExpand(cat.key)}
                        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50"
                      >
                        <div
                          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${cat.iconBg}`}
                        >
                          <Icon className={`h-5 w-5 ${cat.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">
                              {cat.label}
                            </h3>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                              {activeCount}/{totalCount}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {cat.description}
                          </p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        )}
                      </button>

                      {/* Channel toggles */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-5 py-3 space-y-2.5">
                          {cat.channels.map((ch) => (
                            <label
                              key={ch.key}
                              className="flex items-center justify-between gap-3 cursor-pointer group"
                            >
                              <div>
                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                                  {ch.label}
                                </span>
                                <span className="ml-2 text-xs text-gray-400">
                                  {ch.description}
                                </span>
                              </div>
                              {/* Toggle switch */}
                              <button
                                type="button"
                                role="switch"
                                aria-checked={!!prefs[ch.key]}
                                onClick={() => togglePref(ch.key)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#1f419a]/30 focus:ring-offset-1 ${
                                  prefs[ch.key]
                                    ? "bg-[#1f419a]"
                                    : "bg-gray-200"
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${
                                    prefs[ch.key]
                                      ? "translate-x-6"
                                      : "translate-x-1"
                                  }`}
                                />
                              </button>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Info note */}
              <div className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-xs text-blue-700">
                <Bell className="mb-0.5 mr-1.5 inline h-3.5 w-3.5" />
                <strong>Note:</strong> System notifications about account security,
                investigations, and credit refunds cannot be fully disabled to
                keep your account safe. Push notifications require browser
                permission.
              </div>

              {/* Save button */}
              <div className="mt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save preferences
                    </>
                  )}
                </button>
                {dirty && (
                  <span className="text-xs text-amber-600">
                    You have unsaved changes
                  </span>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
