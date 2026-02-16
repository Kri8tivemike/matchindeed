"use client";

/**
 * CalendarPage — MatchIndeed
 *
 * Enhanced calendar page for managing availability and viewing meetings.
 * - Month-view calendar showing availability slots AND confirmed meetings
 * - Add/remove availability slots with time selection
 * - Tier-based slot limits with progress bar
 * - Calendar visibility toggle
 * - Upcoming meetings + availability sidebar panel
 * - Uses global toast system for feedback
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Clock,
  Trash2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Video,
  Loader2,
  CalendarCheck,
  ArrowRight,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type AvailabilitySlot = {
  id: string;
  user_id: string;
  slot_date: string;
  slot_time: string;
  source: "self_customized" | "matchindeed";
  created_at: string;
};

type TierConfig = {
  tier: string;
  monthly_outgoing_credits: number;
  max_outgoing_slots: number;
  customized_slots: number;
  matchindeed_slots: number;
  credit_rollover: boolean;
};

type Meeting = {
  id: string;
  scheduled_at: string;
  status: string;
  host_id: string;
  user_role: string;
  partner_name: string;
};

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function CalendarPage() {
  const { toast } = useToast();

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierConfig, setTierConfig] = useState<TierConfig | null>(null);
  const [calendarEnabled, setCalendarEnabled] = useState(true);

  // Time picker modal
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  // Day detail panel (shown below calendar on mobile, side on desktop)
  const [focusedDate, setFocusedDate] = useState<string | null>(null);

  // ---------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------
  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        setLoading(false);
        return;
      }

      // Fetch availability slots
      const { data: slotsData } = await supabase
        .from("meeting_availability")
        .select("*")
        .eq("user_id", user.id)
        .order("slot_date", { ascending: true });
      setSlots(slotsData || []);

      // Fetch tier config
      const { data: accountData } = await supabase
        .from("accounts")
        .select("tier")
        .eq("id", user.id)
        .single();
      if (accountData) {
        const { data: configData } = await supabase
          .from("account_tier_config")
          .select("*")
          .eq("tier", accountData.tier)
          .single();
        if (configData) setTierConfig(configData);
      }

      // Fetch calendar visibility
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        try {
          const visRes = await fetch("/api/profile/visibility", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (visRes.ok) {
            const visData = await visRes.json();
            setCalendarEnabled(visData.calendar_enabled ?? true);
          }
        } catch {
          // Silently continue with default
        }
      }

      // Fetch confirmed/pending meetings for this user
      try {
        // Host meetings
        const { data: hostMeetings } = await supabase
          .from("meetings")
          .select("id, scheduled_at, status, host_id, meeting_participants(user_id, role)")
          .eq("host_id", user.id)
          .in("status", ["confirmed", "pending", "completed"]);

        // Participant meetings
        const { data: partMeetings } = await supabase
          .from("meeting_participants")
          .select("user_id, role, meetings(id, scheduled_at, status, host_id)")
          .eq("user_id", user.id)
          .neq("role", "host");

        const meetingMap = new Map<string, Meeting>();

        // Process host meetings
        (hostMeetings || []).forEach((m: Record<string, unknown>) => {
          const participants = m.meeting_participants as Array<{ user_id: string; role: string }> | null;
          const partnerId = participants?.find((p) => p.role !== "host")?.user_id;
          meetingMap.set(m.id as string, {
            id: m.id as string,
            scheduled_at: m.scheduled_at as string,
            status: m.status as string,
            host_id: m.host_id as string,
            user_role: "host",
            partner_name: partnerId ? "Partner" : "Unknown",
          });
        });

        // Process participant meetings
        (partMeetings || []).forEach((p: Record<string, unknown>) => {
          const meeting = p.meetings as Record<string, unknown> | null;
          if (!meeting || meetingMap.has(meeting.id as string)) return;
          meetingMap.set(meeting.id as string, {
            id: meeting.id as string,
            scheduled_at: meeting.scheduled_at as string,
            status: meeting.status as string,
            host_id: meeting.host_id as string,
            user_role: "participant",
            partner_name: "Partner",
          });
        });

        setMeetings(Array.from(meetingMap.values()));
      } catch {
        // Meetings fetch optional — silently continue
      }
    } catch (error) {
      console.error("Error fetching calendar data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------
  // Calendar helpers
  // ---------------------------------------------------------------
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
    const days: Date[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [currentDate]);

  const formatDateKey = (date: Date): string => date.toISOString().split("T")[0];

  const getSlotsForDate = (dateKey: string): AvailabilitySlot[] =>
    slots.filter((s) => s.slot_date === dateKey);

  const getMeetingsForDate = (dateKey: string): Meeting[] =>
    meetings.filter((m) => m.scheduled_at?.startsWith(dateKey));

  const isCurrentMonth = (date: Date): boolean =>
    date.getMonth() === currentDate.getMonth();

  const isToday = (date: Date): boolean =>
    formatDateKey(date) === formatDateKey(new Date());

  const isPast = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const prevMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

  const nextMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const goToToday = () => setCurrentDate(new Date());

  // ---------------------------------------------------------------
  // Date click → open time picker for adding availability
  // ---------------------------------------------------------------
  const handleDateClick = (date: Date) => {
    const dateKey = formatDateKey(date);
    setFocusedDate(dateKey);
    if (!isPast(date)) {
      setSelectedDate(dateKey);
      setShowTimePicker(true);
    }
  };

  // ---------------------------------------------------------------
  // Add / remove slots
  // ---------------------------------------------------------------
  const addSlot = async () => {
    if (!selectedDate || !selectedTime) return;

    const usedSlots = slots.filter((s) => s.source === "self_customized").length;
    if (tierConfig && usedSlots >= tierConfig.customized_slots) {
      toast.warning(
        `You've reached your limit of ${tierConfig.customized_slots} custom slots for your ${tierConfig.tier} plan.`
      );
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to add availability.");
        return;
      }

      if (slots.find((s) => s.slot_date === selectedDate && s.slot_time === selectedTime)) {
        toast.warning("You already have a slot at this time.");
        setSaving(false);
        return;
      }

      const { data, error } = await supabase
        .from("meeting_availability")
        .insert({
          user_id: user.id,
          slot_date: selectedDate,
          slot_time: selectedTime,
          source: "self_customized",
        })
        .select()
        .single();

      if (error) {
        toast.error("Failed to add slot. Please try again.");
      } else if (data) {
        setSlots((prev) => [...prev, data]);
        toast.success("Availability slot added!");
        setShowTimePicker(false);
        setSelectedDate(null);
      }
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const removeSlot = async (slotId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("meeting_availability")
        .delete()
        .eq("id", slotId);

      if (error) {
        toast.error("Failed to remove slot.");
      } else {
        setSlots((prev) => prev.filter((s) => s.id !== slotId));
        toast.success("Slot removed.");
      }
    } catch {
      toast.error("An error occurred.");
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------
  // Toggle calendar visibility
  // ---------------------------------------------------------------
  const toggleCalendar = async () => {
    if (togglingVisibility) return;
    const newState = !calendarEnabled;
    setTogglingVisibility(true);
    setCalendarEnabled(newState);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setCalendarEnabled(!newState);
        toast.error("Please log in to change visibility.");
        return;
      }

      const res = await fetch("/api/profile/visibility", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ calendar_enabled: newState }),
      });

      if (!res.ok) {
        setCalendarEnabled(!newState);
        const data = await res.json();
        toast.error(data.error || "Failed to update visibility.");
        return;
      }

      toast.success(
        newState
          ? "Calendar enabled — your profile is now visible."
          : "Calendar disabled — your profile is now hidden."
      );
    } catch {
      setCalendarEnabled(!newState);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setTogglingVisibility(false);
    }
  };

  // ---------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------
  const usedCustomSlots = slots.filter((s) => s.source === "self_customized").length;
  const maxCustomSlots = tierConfig?.customized_slots || 0;

  const timeOptions = Array.from({ length: 13 }, (_, i) => {
    const hour = i + 9;
    return `${hour.toString().padStart(2, "0")}:00`;
  });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Upcoming items for side panel
  const upcomingSlots = slots
    .filter((s) => !isPast(new Date(s.slot_date)))
    .sort((a, b) => a.slot_date.localeCompare(b.slot_date) || a.slot_time.localeCompare(b.slot_time))
    .slice(0, 5);

  const upcomingMeetings = meetings
    .filter((m) => m.status === "confirmed" && new Date(m.scheduled_at) > new Date())
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, 5);

  // ---------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="mt-3 text-sm text-gray-500">Loading calendar...</p>
        </div>
      </div>
    );
  }

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
          <Sidebar active="calendar" />
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {/* Page header */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                <CalendarIcon className="h-7 w-7 text-[#1f419a]" />
                My Availability
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Set times for video dates &amp; view upcoming meetings
              </p>
            </div>

            {/* Visibility toggle */}
            <button
              onClick={toggleCalendar}
              disabled={togglingVisibility}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                calendarEnabled
                  ? "bg-green-50 text-green-700 ring-1 ring-green-200 hover:bg-green-100"
                  : "bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100"
              }`}
            >
              {togglingVisibility ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : calendarEnabled ? (
                <ToggleRight className="h-5 w-5" />
              ) : (
                <ToggleLeft className="h-5 w-5" />
              )}
              {calendarEnabled ? "Profile Visible" : "Profile Hidden"}
            </button>
          </div>

          {/* Profile hidden warning */}
          {!calendarEnabled && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <ToggleLeft className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-semibold text-red-900">Profile is Hidden</p>
                <p className="mt-0.5 text-xs text-red-700">
                  Your profile is not visible to other users. Toggle above to go live.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            {/* ---- Left: Calendar ---- */}
            <div className="space-y-4">
              {/* Slot usage bar */}
              {tierConfig && (
                <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">Custom Slots</span>
                    <span className="font-bold text-[#1f419a]">
                      {usedCustomSlots} / {maxCustomSlots}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#1f419a] to-[#4463cf] transition-all"
                      style={{ width: `${Math.min((usedCustomSlots / Math.max(maxCustomSlots, 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">
                    {tierConfig.tier.charAt(0).toUpperCase() + tierConfig.tier.slice(1)} plan
                    &middot; {Math.max(maxCustomSlots - usedCustomSlots, 0)} remaining
                  </p>
                </div>
              )}

              {/* Calendar card */}
              <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                {/* Month nav */}
                <div className="mb-4 flex items-center justify-between">
                  <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-gray-100">
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900">
                      {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </h2>
                    <button
                      onClick={goToToday}
                      className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-[#1f419a]/10 hover:text-[#1f419a]"
                    >
                      Today
                    </button>
                  </div>
                  <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-gray-100">
                    <ChevronRight className="h-5 w-5 text-gray-600" />
                  </button>
                </div>

                {/* Day names */}
                <div className="mb-1 grid grid-cols-7 gap-1">
                  {dayNames.map((d) => (
                    <div key={d} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((date, i) => {
                    const dk = formatDateKey(date);
                    const dateSlots = getSlotsForDate(dk);
                    const dateMeetings = getMeetingsForDate(dk);
                    const hasSlots = dateSlots.length > 0;
                    const hasMeetings = dateMeetings.length > 0;
                    const past = isPast(date);
                    const today = isToday(date);
                    const inMonth = isCurrentMonth(date);
                    const isFocused = focusedDate === dk;

                    return (
                      <button
                        key={i}
                        onClick={() => handleDateClick(date)}
                        disabled={!inMonth}
                        className={`relative flex flex-col items-center justify-center rounded-lg border p-1 transition-all ${
                          !inMonth
                            ? "cursor-default opacity-20"
                            : past
                              ? "cursor-default opacity-40"
                              : "cursor-pointer hover:bg-[#1f419a]/5 hover:border-[#1f419a]/20"
                        } ${
                          today
                            ? "border-[#1f419a] border-2 bg-[#1f419a]/5"
                            : isFocused
                              ? "border-[#1f419a]/40 bg-[#1f419a]/5"
                              : "border-transparent"
                        } aspect-square`}
                      >
                        <span
                          className={`text-sm font-medium ${
                            today ? "text-[#1f419a] font-bold" : inMonth ? "text-gray-700" : "text-gray-400"
                          }`}
                        >
                          {date.getDate()}
                        </span>

                        {/* Dots row */}
                        {(hasSlots || hasMeetings) && (
                          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                            {hasSlots && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                            {hasMeetings && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Available
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Meeting
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded border border-[#1f419a]" /> Today
                  </span>
                </div>
              </div>

              {/* Cancellation policy */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <div className="text-xs text-amber-800 space-y-1">
                    <p className="font-semibold text-amber-900">Cancellation Policy</p>
                    <p>Once booked and confirmed, cancelling incurs a fee. Remove slots before anyone books.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ---- Right: Sidebar panels ---- */}
            <div className="space-y-4">
              {/* Upcoming meetings */}
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                  <Video className="h-4 w-4 text-blue-500" />
                  Upcoming Meetings
                </h3>
                {upcomingMeetings.length === 0 ? (
                  <p className="py-4 text-center text-xs text-gray-400">No upcoming meetings</p>
                ) : (
                  <div className="space-y-2">
                    {upcomingMeetings.map((m) => {
                      const d = new Date(m.scheduled_at);
                      return (
                        <Link
                          key={m.id}
                          href="/dashboard/meetings"
                          className="flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-2.5 transition-colors hover:bg-blue-50"
                        >
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100">
                            <Video className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-gray-900">
                              {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              {d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                              {" · "}
                              <span className="capitalize">{m.user_role}</span>
                            </p>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                        </Link>
                      );
                    })}
                  </div>
                )}
                <Link
                  href="/dashboard/meetings"
                  className="mt-3 block text-center text-xs font-medium text-[#1f419a] hover:underline"
                >
                  View all meetings
                </Link>
              </div>

              {/* Available slots */}
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                  <CalendarCheck className="h-4 w-4 text-green-500" />
                  My Availability
                </h3>
                {upcomingSlots.length === 0 ? (
                  <div className="py-4 text-center">
                    <CalendarIcon className="mx-auto mb-2 h-8 w-8 text-gray-200" />
                    <p className="text-xs text-gray-400">No slots set yet</p>
                    <p className="text-[11px] text-gray-400">Click a date to add one</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingSlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between rounded-lg border border-green-100 bg-green-50/50 p-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-green-100">
                            <Clock className="h-3.5 w-3.5 text-green-600" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-900">
                              {new Date(slot.slot_date).toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                            <p className="text-[11px] text-gray-500">{slot.slot_time}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeSlot(slot.id)}
                          disabled={saving}
                          className="rounded p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {slots.filter((s) => !isPast(new Date(s.slot_date))).length > 5 && (
                  <p className="mt-2 text-center text-[11px] text-gray-400">
                    +{slots.filter((s) => !isPast(new Date(s.slot_date))).length - 5} more slots
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ---- Time Picker Modal ---- */}
      {showTimePicker && selectedDate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Add Time Slot</h3>
              <button
                onClick={() => {
                  setShowTimePicker(false);
                  setSelectedDate(null);
                }}
                className="rounded-lg p-1.5 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <p className="mb-4 text-sm text-gray-500">
              <span className="font-medium text-gray-900">
                {new Date(selectedDate).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </p>

            {/* Time grid */}
            <label className="mb-2 block text-xs font-medium text-gray-500 uppercase tracking-wider">
              Select time
            </label>
            <div className="mb-4 grid grid-cols-4 gap-2">
              {timeOptions.map((time) => {
                const isSelected = selectedTime === time;
                const isBooked = slots.some(
                  (s) => s.slot_date === selectedDate && s.slot_time === time
                );
                return (
                  <button
                    key={time}
                    onClick={() => setSelectedTime(time)}
                    disabled={isBooked}
                    className={`rounded-lg py-2 text-sm font-medium transition-all ${
                      isBooked
                        ? "bg-gray-100 text-gray-300 cursor-not-allowed line-through"
                        : isSelected
                          ? "bg-[#1f419a] text-white shadow-md"
                          : "bg-gray-50 text-gray-700 hover:bg-[#1f419a]/10"
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>

            {/* Existing slots */}
            {getSlotsForDate(selectedDate).length > 0 && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="mb-1.5 text-xs font-medium text-green-800">
                  Already set for this day:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {getSlotsForDate(selectedDate).map((slot) => (
                    <span
                      key={slot.id}
                      className="rounded bg-green-200 px-2 py-0.5 text-xs font-medium text-green-800"
                    >
                      {slot.slot_time}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowTimePicker(false);
                  setSelectedDate(null);
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addSlot}
                disabled={
                  saving ||
                  slots.some((s) => s.slot_date === selectedDate && s.slot_time === selectedTime)
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {saving ? "Adding..." : "Add Slot"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
