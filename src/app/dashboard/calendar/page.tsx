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
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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
import { useDashboardAccess } from "@/components/dashboard/DashboardAccessProvider";
import { supabase } from "@/lib/supabase";
import {
  type CalendarSlotPolicy,
  type CalendarSlotUsage,
  doesNextCustomSlotUseCredits,
  getRemainingIncludedCustomSlots,
  MIN_SLOT_LEAD_TIME_HOURS,
  isUnlimitedSlotCount,
} from "@/lib/calendar/slot-allocation";
import {
  getDateKeyInTimeZone,
  getDateLabelInTimeZone,
  getTimeLabelInTimeZone,
  getSafeTimeZone,
  toScheduledAtIso,
} from "@/lib/timezones";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type AvailabilitySlot = {
  id: string;
  user_id: string;
  slot_date: string;
  slot_time: string;
  scheduled_at?: string | null;
  source: "self_customized" | "matchindeed";
  created_at: string;
};

type TierConfig = CalendarSlotPolicy;
type SlotUsage = CalendarSlotUsage;

type Meeting = {
  id: string;
  scheduled_at: string;
  status: string;
  host_id: string;
  user_role: string;
  partner_name: string;
};

type StarterTrialData = {
  has_trial: boolean;
  eligible: boolean;
  has_paid_membership_history: boolean;
  has_active_membership: boolean;
  has_active_slot: boolean;
  active_slot_id: string | null;
  consumed: boolean;
  consumed_meeting_id: string | null;
  remaining_slots: number;
  slot_limit: number;
  upgrade_required: boolean;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CUSTOM_SLOT_CREDIT_COST_BY_TIER: Record<string, number> = {
  basic: 4,
  standard: 6,
  premium: 8,
  vip: 10,
};
const CREDIT_PURCHASE_HREF = "/dashboard/wallet?open=credits";
const SUBSCRIPTION_HREF = "/dashboard/profile/subscription?source=starter_trial";
const DEFAULT_SLOT_WINDOW_DAYS = 30;
const CREDIT_LOCKED_PROFILE_STATUS = "offline_credits_locked";
const SLEEK_SCROLLBAR_CLASS =
  "overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300/80 hover:[&::-webkit-scrollbar-thumb]:bg-slate-400";

function getCreditBackedSlotMessage(creditCost: number, tier?: string | null) {
  return `You have used your included slot allowance for this subscription cycle. You need at least ${creditCost} available credit${creditCost === 1 ? "" : "s"} to create another slot while your ${tier || "current"} subscription is active.`;
}

function getCreditUsageSummary(
  creditCost: number,
  creditsRemaining: number,
  tier?: string | null
) {
  const formattedTier = tier || "current";
  const remainingAfterCharge = Math.max(creditsRemaining - creditCost, 0);

  if (creditsRemaining >= creditCost) {
    return `This slot will use ${creditCost} credit${creditCost === 1 ? "" : "s"}. You have ${creditsRemaining} available, so it will go through and leave ${remainingAfterCharge} credit${remainingAfterCharge === 1 ? "" : "s"} remaining while your ${formattedTier} subscription is active.`;
  }

  return `This slot needs ${creditCost} credit${creditCost === 1 ? "" : "s"}, but you only have ${creditsRemaining} available. Add more credits to continue while your ${formattedTier} subscription is active.`;
}

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function getBrowserLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
}

function getDefaultMaxSlotDateKey() {
  const today = new Date();
  const maxDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    0,
    0,
    0,
    0
  );
  maxDate.setDate(maxDate.getDate() + DEFAULT_SLOT_WINDOW_DAYS - 1);
  return maxDate.toISOString().slice(0, 10);
}

function formatSlotTimeLabel(slotTime: string, locale: string) {
  const [hourRaw = "0", minuteRaw = "0"] = slotTime.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return slotTime;
  }

  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSlotScheduledAt(slot: AvailabilitySlot) {
  return slot.scheduled_at
    ? new Date(slot.scheduled_at)
    : new Date(`${slot.slot_date}T${slot.slot_time}`);
}

function getCalendarDayAnchor(date: Date) {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)
  );
}

function getScheduledAtKey(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function CalendarPage() {
  const { toast } = useToast();
  const { walletAccessEnabled } = useDashboardAccess();

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierConfig, setTierConfig] = useState<TierConfig | null>(null);
  const [slotUsage, setSlotUsage] = useState<SlotUsage | null>(null);
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [creditsExhausted, setCreditsExhausted] = useState(false);
  const [creditLockRequired, setCreditLockRequired] = useState(false);
  const [customSlotCreditCost, setCustomSlotCreditCost] = useState(1);
  const [nextCustomSlotUsesCredits, setNextCustomSlotUsesCredits] = useState(false);
  const [starterTrial, setStarterTrial] = useState<StarterTrialData | null>(null);
  const [slotWindowDays, setSlotWindowDays] = useState(DEFAULT_SLOT_WINDOW_DAYS);
  const [maxSlotDateKey, setMaxSlotDateKey] = useState(getDefaultMaxSlotDateKey());
  const [calendarTimeZone, setCalendarTimeZone] = useState(
    getSafeTimeZone(getBrowserTimeZone())
  );
  const [browserLocale] = useState(getBrowserLocale());
  const [activeTimePicker, setActiveTimePicker] = useState<"single" | null>(null);

  // Time picker modal
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState("10:00:00");
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

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const currentMonth = `${currentDate.getFullYear()}-${String(
        currentDate.getMonth() + 1
      ).padStart(2, "0")}`;
      const calendarRes = await fetch(`/api/calendar?month=${currentMonth}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!calendarRes.ok) {
        const errorData = await calendarRes.json().catch(() => ({}));
        toast.error(errorData.error || "Failed to load calendar data.");
        setLoading(false);
        return;
      }

      const calendarData = await calendarRes.json();
      const detectedTimeZone = getSafeTimeZone(getBrowserTimeZone());
      const storedTimeZone = getSafeTimeZone(
        calendarData.timezone || detectedTimeZone
      );
      setSlots(calendarData.slots || []);
      setTierConfig(calendarData.tier_config || null);
      setSlotUsage(calendarData.usage || null);
      setCreditsRemaining(calendarData.credits_remaining ?? 0);
      setCreditsExhausted(calendarData.credits_exhausted ?? false);
      setCreditLockRequired(calendarData.credit_lock_required ?? false);
      setCustomSlotCreditCost(
        Number(
          calendarData.custom_slot_credit_cost ||
            CUSTOM_SLOT_CREDIT_COST_BY_TIER[calendarData.tier_config?.tier || ""] ||
            1
        )
      );
      setNextCustomSlotUsesCredits(
        calendarData.next_custom_slot_uses_credits ?? false
      );
      setStarterTrial(calendarData.starter_trial || null);
      setSlotWindowDays(calendarData.slot_window_days ?? DEFAULT_SLOT_WINDOW_DAYS);
      setMaxSlotDateKey(calendarData.max_slot_date || getDefaultMaxSlotDateKey());
      setCalendarEnabled(calendarData.calendar_enabled ?? true);
      setCalendarTimeZone(detectedTimeZone);

      if (storedTimeZone !== detectedTimeZone) {
        fetch("/api/calendar", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ timezone: detectedTimeZone }),
        }).catch(() => undefined);
      }

      // Fetch calendar visibility
      if (session) {
        try {
          const visRes = await fetch("/api/profile/visibility", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (visRes.ok) {
            const visData = await visRes.json();
            const currentCalendarEnabled = visData.calendar_enabled ?? true;
            const currentProfileStatus = String(
              visData.profile_status || ""
            ).toLowerCase();
            const shouldLockForCredits = calendarData.credit_lock_required ?? false;

            // Auto-lock calendar only when there are no available credits left.
            if (shouldLockForCredits && currentCalendarEnabled) {
              const lockRes = await fetch("/api/profile/visibility", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  calendar_enabled: false,
                  lock_reason: "credits_exhausted",
                }),
              });

              if (lockRes.ok) {
                setCalendarEnabled(false);
              } else {
                setCalendarEnabled(currentCalendarEnabled);
              }
            } else if (
              !shouldLockForCredits &&
              !currentCalendarEnabled &&
              currentProfileStatus === CREDIT_LOCKED_PROFILE_STATUS
            ) {
              const unlockRes = await fetch("/api/profile/visibility", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ calendar_enabled: true }),
              });

              if (unlockRes.ok) {
                setCalendarEnabled(true);
              } else {
                setCalendarEnabled(currentCalendarEnabled);
              }
            } else {
              setCalendarEnabled(currentCalendarEnabled);
            }
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
  }, [currentDate, toast]);

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

  const formatDateKey = useCallback(
    (date: Date): string =>
      getDateKeyInTimeZone(getCalendarDayAnchor(date), calendarTimeZone),
    [calendarTimeZone]
  );

  const currentCalendarDateKey = getDateKeyInTimeZone(
    new Date(),
    calendarTimeZone
  );
  const minimumSlotCreationDate = useMemo(
    () => new Date(Date.now() + MIN_SLOT_LEAD_TIME_HOURS * 60 * 60 * 1000),
    []
  );
  const minimumSlotDateKey = getDateKeyInTimeZone(
    minimumSlotCreationDate,
    calendarTimeZone
  );
  const minimumSlotDateLabel = useMemo(
    () =>
      getDateLabelInTimeZone(
        minimumSlotCreationDate,
        calendarTimeZone,
        browserLocale
      ),
    [browserLocale, calendarTimeZone, minimumSlotCreationDate]
  );

  const getSlotsForDate = (dateKey: string): AvailabilitySlot[] =>
    slots.filter((s) => {
      const scheduledAt = s.scheduled_at || `${s.slot_date}T${s.slot_time}`;
      return getDateKeyInTimeZone(scheduledAt, calendarTimeZone) === dateKey;
    });

  const getMeetingsForDate = (dateKey: string): Meeting[] =>
    meetings.filter(
      (m) => getDateKeyInTimeZone(m.scheduled_at, calendarTimeZone) === dateKey
    );

  const isCurrentMonth = (date: Date): boolean =>
    date.getMonth() === currentDate.getMonth();

  const isToday = (date: Date): boolean =>
    formatDateKey(date) === currentCalendarDateKey;

  const isPast = useCallback(
    (date: Date): boolean => {
      return formatDateKey(date) < currentCalendarDateKey;
    },
    [currentCalendarDateKey, formatDateKey]
  );

  const isBeyondSlotWindow = useCallback(
    (date: Date): boolean => formatDateKey(date) > maxSlotDateKey,
    [formatDateKey, maxSlotDateKey]
  );

  const isBeforeMinimumSlotLeadTime = useCallback(
    (date: Date): boolean => formatDateKey(date) < minimumSlotDateKey,
    [formatDateKey, minimumSlotDateKey]
  );

  const maxSlotDateLabel = useMemo(
    () =>
      getDateLabelInTimeZone(
        `${maxSlotDateKey}T12:00:00Z`,
        calendarTimeZone,
        browserLocale
      ),
    [browserLocale, calendarTimeZone, maxSlotDateKey]
  );

  const prevMonth = () =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

  const canGoToNextMonth = useMemo(() => {
    const nextMonthDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      1
    );
    return formatDateKey(nextMonthDate) <= maxSlotDateKey;
  }, [currentDate, formatDateKey, maxSlotDateKey]);

  const nextMonth = () => {
    if (!canGoToNextMonth) return;
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => setCurrentDate(new Date());
  const goToFirstAvailableDate = () => {
    setCurrentDate(
      new Date(
        minimumSlotCreationDate.getFullYear(),
        minimumSlotCreationDate.getMonth(),
        1
      )
    );
    setFocusedDate(minimumSlotDateKey);
  };

  // ---------------------------------------------------------------
  // Date click → open time picker for adding availability
  // ---------------------------------------------------------------
  const handleDateClick = (date: Date) => {
    if (creditsExhausted) {
      toast.warningAction(
        getCreditBackedSlotMessage(
          customSlotCreditCost,
          tierConfig?.tier || "current"
        ),
        walletAccessEnabled ? "Get more credits" : "View plans",
        walletAccessEnabled ? CREDIT_PURCHASE_HREF : SUBSCRIPTION_HREF
      );
      return;
    }

    const dateKey = formatDateKey(date);
    setFocusedDate(dateKey);

    if (starterTrial?.upgrade_required) {
      toast.warningAction(
        "Your free starter slot has already been used. Subscribe to create more availability.",
        "View plans",
        SUBSCRIPTION_HREF
      );
      return;
    }

    if (starterTrial?.has_active_slot) {
      toast.warningAction(
        "Starter slot active — remove it first, or upgrade for unlimited slots.",
        "Upgrade plan",
        SUBSCRIPTION_HREF
      );
      return;
    }

    if (isBeyondSlotWindow(date)) {
      toast.warning(
        `You can create availability only within the next ${slotWindowDays} days of your active subscription. The last available date is ${maxSlotDateLabel}.`
      );
      return;
    }

    if (isBeforeMinimumSlotLeadTime(date)) {
      toast.warning(
        `Availability must be scheduled at least ${MIN_SLOT_LEAD_TIME_HOURS} hours in advance. The earliest available date is ${minimumSlotDateLabel}.`
      );
      return;
    }

    const nextAvailableTimes = getAvailableTimesForDate(dateKey);
    if (nextAvailableTimes.length === 0) {
      toast.warning(
        `No time slots remain on this day after the ${MIN_SLOT_LEAD_TIME_HOURS}-hour advance notice window.`
      );
      return;
    }

    if (!isPast(date)) {
      setSelectedDate(dateKey);
      setSelectedTime(nextAvailableTimes[0] || "");
      setShowTimePicker(true);
    }
  };

  // ---------------------------------------------------------------
  // Add / remove slots
  // ---------------------------------------------------------------
  const addSlot = async () => {
    if (!selectedDate || !selectedTime) return;

    const upgradeHref = walletAccessEnabled ? CREDIT_PURCHASE_HREF : SUBSCRIPTION_HREF;
    const upgradeLabel = walletAccessEnabled ? "Get more credits" : "View plans";

    if (selectedDate > maxSlotDateKey) {
      toast.warning(
        `You can create availability only within the next ${slotWindowDays} days of your active subscription. The last available date is ${maxSlotDateLabel}.`
      );
      return;
    }

    const selectedScheduledAt = toScheduledAtIso(
      selectedDate,
      selectedTime,
      calendarTimeZone
    );
    if (
      !selectedScheduledAt ||
      new Date(selectedScheduledAt) < minimumSlotCreationDate
    ) {
      toast.warning(
        `Availability must be scheduled at least ${MIN_SLOT_LEAD_TIME_HOURS} hours in advance.`
      );
      return;
    }

    if (starterTrial?.upgrade_required) {
      toast.warningAction(
        "Your free starter slot has already been used. Subscribe to create more availability.",
        "View plans",
        SUBSCRIPTION_HREF
      );
      return;
    }

    if (starterTrial?.has_active_slot) {
      toast.warningAction(
        "Starter slot active — remove it first, or upgrade for unlimited slots.",
        "Upgrade plan",
        SUBSCRIPTION_HREF
      );
      return;
    }

    if (creditsExhausted) {
      toast.warningAction(
        getCreditBackedSlotMessage(
          customSlotCreditCost,
          tierConfig?.tier || "current"
        ),
        upgradeLabel,
        upgradeHref
      );
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to add availability.");
        return;
      }

      if (
        slots.find(
          (s) =>
            s.slot_date === selectedDate &&
            s.slot_time.slice(0, 5) === selectedTime.slice(0, 5)
        )
      ) {
        toast.warning("You already have a slot at this time.");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          slot_date: selectedDate,
          slot_time: selectedTime,
          source: "self_customized",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (
          data.error === "credits_exhausted" ||
          data.error === "max_slots_reached" ||
          data.error === "max_custom_slots_reached"
        ) {
          toast.errorAction(
            data.message || "You need more credits to continue.",
            upgradeLabel,
            upgradeHref
          );
        } else if (data.error === "starter_trial_exhausted") {
          toast.errorAction(
            data.message || "Your free starter slot has already been used.",
            "View plans",
            SUBSCRIPTION_HREF
          );
        } else if (data.error === "starter_trial_slot_in_use") {
          toast.warningAction(
            "Starter slot active — remove it first, or upgrade for unlimited slots.",
            "Upgrade plan",
            SUBSCRIPTION_HREF
          );
        } else if (data.error === "access_denied") {
          toast.errorAction(
            data.message || "Please subscribe to a plan to schedule meetings.",
            "View plans",
            SUBSCRIPTION_HREF
          );
        } else {
          toast.error(data.message || data.error || "Failed to add slot. Please try again.");
        }
        return;
      }

      if (data.slot) {
        setSlots((prev) => [...prev, data.slot]);
      }
      if (data.usage) {
        setSlotUsage(data.usage);
      }
      if (data.tier_config) {
        setTierConfig(data.tier_config);
      }
      if (typeof data.credits_remaining === "number") {
        setCreditsRemaining(data.credits_remaining);
      }
      if (typeof data.credits_exhausted === "boolean") {
        setCreditsExhausted(data.credits_exhausted);
      }
      if (typeof data.credit_lock_required === "boolean") {
        setCreditLockRequired(data.credit_lock_required);
      }
      if (typeof data.custom_slot_credit_cost === "number") {
        setCustomSlotCreditCost(data.custom_slot_credit_cost);
      }
      if (typeof data.next_custom_slot_uses_credits === "boolean") {
        setNextCustomSlotUsesCredits(data.next_custom_slot_uses_credits);
      }
      if (data.starter_trial) {
        setStarterTrial(data.starter_trial);
      }
      if (data.charged_credit) {
        const chargedCost = Number(data.custom_slot_credit_cost || customSlotCreditCost || 1);
        toast.success(
          `Availability slot added. ${chargedCost} credit${chargedCost === 1 ? "" : "s"} used for this time slot.`
        );
      } else if (typeof data.message === "string" && data.message) {
        toast.success(data.message);
      } else {
        toast.success("Availability slot added!");
      }
      setShowTimePicker(false);
      setSelectedDate(null);
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const removeSlot = async (slotId: string) => {
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to remove a slot.");
        return;
      }

      const res = await fetch(`/api/calendar?slot_id=${encodeURIComponent(slotId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.message || data.error || "Failed to remove slot.");
        return;
      }

      setSlots((prev) => prev.filter((s) => s.id !== slotId));
      if (data.usage) {
        setSlotUsage(data.usage);
      }
      if (data.tier_config) {
        setTierConfig(data.tier_config);
      }
      if (typeof data.credits_remaining === "number") {
        setCreditsRemaining(data.credits_remaining);
      }
      if (typeof data.credits_exhausted === "boolean") {
        setCreditsExhausted(data.credits_exhausted);
      }
      if (typeof data.credit_lock_required === "boolean") {
        setCreditLockRequired(data.credit_lock_required);
      }
      if (typeof data.next_custom_slot_uses_credits === "boolean") {
        setNextCustomSlotUsesCredits(data.next_custom_slot_uses_credits);
      }
      if (data.starter_trial) {
        setStarterTrial(data.starter_trial);
      }
      if (typeof data.refunded_credit_amount === "number" && data.refunded_credit_amount > 0) {
        toast.success(
          data.message ||
            `Slot removed. ${data.refunded_credit_amount} credit${data.refunded_credit_amount === 1 ? "" : "s"} returned to your balance.`
        );
      } else {
        toast.success(data.message || "Slot removed.");
      }
      await fetchData();
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
    if (starterTrial?.upgrade_required && !calendarEnabled) {
      toast.warningAction(
        "Your free starter slot has already been used. Subscribe to go live again.",
        "View plans",
        SUBSCRIPTION_HREF
      );
      return;
    }
    if (creditLockRequired && !calendarEnabled) {
      toast.warningAction(
        "No available credits. Add credits to enable your calendar.",
        walletAccessEnabled ? "Get more credits" : "View plans",
        walletAccessEnabled ? CREDIT_PURCHASE_HREF : SUBSCRIPTION_HREF
      );
      return;
    }

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
        if (data?.code === "starter_trial_exhausted") {
          toast.errorAction(
            data.error || "Your free starter slot has already been used.",
            "View plans",
            SUBSCRIPTION_HREF
          );
        } else {
          toast.error(data.error || "Failed to update visibility.");
        }
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
  const usedCustomSlots = slotUsage?.custom_slots_used ?? 0;
  const maxCustomSlots = tierConfig?.customized_slots || 0;
  const starterTrialActive = Boolean(
    starterTrial?.eligible && !starterTrial?.upgrade_required
  );
  const starterTrialHasActiveSlot = Boolean(starterTrial?.has_active_slot);
  const starterTrialRemainingSlots = starterTrial?.remaining_slots ?? 0;
  const unlimitedCustomSlots = isUnlimitedSlotCount(maxCustomSlots);
  const extraCustomSlotsUsed = unlimitedCustomSlots
    ? 0
    : Math.max(usedCustomSlots - maxCustomSlots, 0);
  const includedCustomSlotsUsed = unlimitedCustomSlots
    ? usedCustomSlots
    : Math.min(usedCustomSlots, Math.max(maxCustomSlots, 0));
  const includedCustomSlotsRemaining = tierConfig
    ? unlimitedCustomSlots
      ? null
      : getRemainingIncludedCustomSlots(tierConfig, slotUsage || {
          total_slots_used: 0,
          custom_slots_used: 0,
          matchindeed_slots_used: 0,
          month_start: "",
          month_end: "",
        })
    : null;
  const derivedNextCustomSlotUsesCredits =
    tierConfig && slotUsage
      ? doesNextCustomSlotUseCredits(tierConfig, slotUsage)
      : nextCustomSlotUsesCredits;
  const capitalizedTierLabel = tierConfig
    ? `${tierConfig.tier.charAt(0).toUpperCase()}${tierConfig.tier.slice(1)}`
    : "Current";
  const slotPlanSummary = starterTrialActive
    ? starterTrialHasActiveSlot
      ? "Starter trial · One free slot is currently live"
      : "Starter trial · One free host-only slot available"
    : unlimitedCustomSlots
      ? `${capitalizedTierLabel} plan · Unlimited custom slots`
      : maxCustomSlots > 0
        ? `${capitalizedTierLabel} plan · ${maxCustomSlots} included per cycle`
        : `${capitalizedTierLabel} plan · No included custom slots`;
  const slotWindowSummary = starterTrialActive
    ? `${slotWindowDays} free-plan day${slotWindowDays === 1 ? "" : "s"} left · until ${maxSlotDateLabel}`
    : `Create slots until ${maxSlotDateLabel}`;
  const slotLeadTimeSummary = `Earliest slot: ${minimumSlotDateLabel} after ${MIN_SLOT_LEAD_TIME_HOURS} hours`;
  const slotUsageSummary = starterTrialActive
    ? starterTrialHasActiveSlot
      ? "Starter slot already in use"
      : `${starterTrialRemainingSlots} free slot remaining`
    : unlimitedCustomSlots
      ? "Unlimited custom slots"
      : `${includedCustomSlotsUsed} included • ${extraCustomSlotsUsed} extra`;
  const includedSlotsSummary = starterTrialActive
    ? `${starterTrialRemainingSlots} starter slot${starterTrialRemainingSlots === 1 ? "" : "s"} left`
    : unlimitedCustomSlots
      ? "No cycle cap"
      : `${includedCustomSlotsRemaining || 0} included slot${includedCustomSlotsRemaining === 1 ? "" : "s"} left this cycle`;
  const nextSlotSummary = starterTrialActive
    ? starterTrialHasActiveSlot
      ? "Remove the active starter slot to change it"
      : "Next slot uses your free starter allowance"
    : derivedNextCustomSlotUsesCredits
      ? `Next slot uses ${customSlotCreditCost} credit${customSlotCreditCost === 1 ? "" : "s"}`
      : "Next slot uses included allowance";
  const renewalSummary = starterTrialActive
    ? `Free starter plan active until ${maxSlotDateLabel}, or sooner if you accept your first booking.`
    : unlimitedCustomSlots
      ? "Credits can still be used for other paid features."
      : "Allowance resets on renewal.";

  const timeOptions = Array.from({ length: 32 }, (_, i) => {
    const totalMinutes = 8 * 60 + i * 30;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${hour.toString().padStart(2, "0")}:${minute
      .toString()
      .padStart(2, "0")}:00`;
  });

  const getAvailableTimesForDate = useCallback(
    (dateKey: string) => {
      return timeOptions.filter((time) => {
        const scheduledAtIso = toScheduledAtIso(dateKey, time, calendarTimeZone);
        return scheduledAtIso
          ? new Date(scheduledAtIso) >= minimumSlotCreationDate
          : false;
      });
    },
    [calendarTimeZone, minimumSlotCreationDate, timeOptions]
  );

  const availableTimeOptions = useMemo(() => {
    if (!selectedDate) {
      return timeOptions;
    }

    return getAvailableTimesForDate(selectedDate);
  }, [getAvailableTimesForDate, selectedDate, timeOptions]);

  useEffect(() => {
    if (!showTimePicker || !selectedDate) {
      return;
    }

    if (availableTimeOptions.length === 0) {
      setSelectedTime("");
      return;
    }

    if (!availableTimeOptions.includes(selectedTime)) {
      setSelectedTime(availableTimeOptions[0]);
    }
  }, [availableTimeOptions, selectedDate, selectedTime, showTimePicker]);

  // Upcoming items for side panel
  const bookedSlotKeys = useMemo(
    () =>
      new Set(
        meetings
          .filter((meeting) => meeting.status === "pending" || meeting.status === "confirmed")
          .map((meeting) => getScheduledAtKey(meeting.scheduled_at))
          .filter((value): value is string => Boolean(value))
      ),
    [meetings]
  );

  const availableUpcomingSlots = useMemo(
    () =>
      slots.filter((slot) => {
        const scheduledAtValue = slot.scheduled_at || `${slot.slot_date}T${slot.slot_time}`;
        const scheduledAtKey = getScheduledAtKey(scheduledAtValue);
        const isFuture = slot.scheduled_at
          ? new Date(slot.scheduled_at) > new Date()
          : !isPast(new Date(slot.slot_date));

        return isFuture && (!scheduledAtKey || !bookedSlotKeys.has(scheduledAtKey));
      }),
    [bookedSlotKeys, isPast, slots]
  );

  const bookedUpcomingSlots = useMemo(
    () =>
      slots.filter((slot) => {
        const scheduledAtValue = slot.scheduled_at || `${slot.slot_date}T${slot.slot_time}`;
        const scheduledAtKey = getScheduledAtKey(scheduledAtValue);
        const isFuture = slot.scheduled_at
          ? new Date(slot.scheduled_at) > new Date()
          : !isPast(new Date(slot.slot_date));

        return isFuture && Boolean(scheduledAtKey && bookedSlotKeys.has(scheduledAtKey));
      }),
    [bookedSlotKeys, isPast, slots]
  );

  const activeStarterSlot = useMemo(() => {
    if (!starterTrial?.active_slot_id) {
      return null;
    }

    return slots.find((slot) => slot.id === starterTrial.active_slot_id) || null;
  }, [slots, starterTrial?.active_slot_id]);

  const upcomingSlots = [...availableUpcomingSlots]
    .sort((a, b) => {
      const aTime = getSlotScheduledAt(a).getTime();
      const bTime = getSlotScheduledAt(b).getTime();
      return aTime - bTime;
    });

  const availabilityPanelSlots = useMemo(() => {
    const missingActiveStarterSlot =
      activeStarterSlot &&
      !upcomingSlots.some((slot) => slot.id === activeStarterSlot.id) &&
      !bookedUpcomingSlots.some((slot) => slot.id === activeStarterSlot.id)
        ? activeStarterSlot
        : null;

    const combined = missingActiveStarterSlot
      ? [...upcomingSlots, missingActiveStarterSlot]
      : upcomingSlots;

    return combined.sort(
      (a, b) => getSlotScheduledAt(a).getTime() - getSlotScheduledAt(b).getTime()
    );
  }, [activeStarterSlot, bookedUpcomingSlots, upcomingSlots]);

  const upcomingMeetings = meetings
    .filter((m) => m.status === "confirmed" && new Date(m.scheduled_at) > new Date())
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, 5);

  const activeTimeValue = activeTimePicker === "single" ? selectedTime : null;

  const handleTimeOptionSelect = useCallback(
    (time: string) => {
      if (activeTimePicker === "single") {
        setSelectedTime(time);
      }

      setActiveTimePicker(null);
    },
    [activeTimePicker]
  );

  useEffect(() => {
    if (!showTimePicker) {
      setActiveTimePicker(null);
    }
  }, [showTimePicker]);

  const closeTimeSlotModal = useCallback(() => {
    setActiveTimePicker(null);
    setShowTimePicker(false);
    setSelectedDate(null);
  }, []);

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
            <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={110} height={28} style={{ width: "auto", height: "auto" }} />
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
                Set available times for face to face video date meetings
              </p>
            </div>

            {/* Visibility toggle */}
            <button
              onClick={toggleCalendar}
              disabled={togglingVisibility || creditsExhausted}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                calendarEnabled
                  ? "bg-green-50 text-green-700 ring-1 ring-green-200 hover:bg-green-100"
                  : "bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100"
              }`}
            >
              {togglingVisibility ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : creditLockRequired ? (
                <AlertCircle className="h-4 w-4" />
              ) : calendarEnabled ? (
                <ToggleRight className="h-5 w-5" />
              ) : (
                <ToggleLeft className="h-5 w-5" />
              )}
              {creditLockRequired
                ? "Video Dating Calendar Hidden (More Credits Required)"
                : calendarEnabled
                  ? "Profile Visible"
                  : "Profile Hidden"}
            </button>
          </div>

          {starterTrialActive && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <CalendarCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#1f419a]" />
              <div>
                <p className="text-sm font-semibold text-[#173278]">
                  {starterTrialHasActiveSlot
                    ? "Your free starter slot is live"
                    : "You have one free starter slot"}
                </p>
                <p className="mt-0.5 text-xs text-[#26418d]">
                  {starterTrialHasActiveSlot
                    ? "Other users can request this slot now. Once you accept your first booking, you’ll need a paid plan for more availability."
                    : "Create one host-only slot so other users can book you. After you accept your first booking, subscribe for more availability."}
                </p>
                <p className="mt-1 text-[11px] font-medium text-[#173278]">
                  Free starter plan active until {maxSlotDateLabel}.
                </p>
              </div>
            </div>
          )}

          {starterTrial?.upgrade_required && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-indigo-600" />
              <div>
                <p className="text-sm font-semibold text-indigo-900">Starter slot used</p>
                <p className="mt-0.5 text-xs text-indigo-800">
                  Your free starter slot has already been used. Subscribe to create more availability and go live again.
                </p>
                <Link
                  href={SUBSCRIPTION_HREF}
                  className="mt-2 inline-flex text-xs font-semibold text-indigo-900 underline decoration-indigo-400 underline-offset-2"
                >
                  View subscription plans
                </Link>
              </div>
            </div>
          )}

          {creditLockRequired && !starterTrial?.upgrade_required && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Video Dating Calendar Locked</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  You do not have enough credits for your next paid slot
                  {creditsRemaining !== null ? ` (${creditsRemaining} remaining)` : ""}.
                  Add credits to unlock additional calendar slots and new bookings.
                </p>
                <Link
                  href={walletAccessEnabled ? "/dashboard/wallet" : SUBSCRIPTION_HREF}
                  className="mt-2 inline-flex text-xs font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2"
                >
                  {walletAccessEnabled ? "Open wallet" : "View plans"}
                </Link>
              </div>
            </div>
          )}

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
                  <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-700">Custom Slots</span>
                        {unlimitedCustomSlots ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                            unlimited
                          </span>
                        ) : derivedNextCustomSlotUsesCredits ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                            using credits
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#1f419a] ring-1 ring-[#d9e2ff]">
                            using included slots
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{slotPlanSummary}</p>
                    </div>
                    <div className="text-right min-w-[150px]">
                      <div className="font-bold text-[#1f419a]">
                        {usedCustomSlots} total slot created this cycle
                      </div>
                      <div className="text-[11px] text-gray-400">{slotUsageSummary}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 font-medium text-slate-600 ring-1 ring-slate-200">
                      {slotWindowSummary}
                    </span>
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 font-medium text-slate-600 ring-1 ring-slate-200">
                      {slotLeadTimeSummary}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">
                      {includedSlotsSummary}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-[#1f419a] ring-1 ring-[#d9e2ff]">
                      {nextSlotSummary}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#1f419a] to-[#4463cf] transition-all"
                      style={{
                        width: unlimitedCustomSlots
                          ? "100%"
                          : `${Math.min((includedCustomSlotsUsed / Math.max(maxCustomSlots, 1)) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    {creditsRemaining !== null && (
                      <div className="rounded-lg bg-[#f6f8ff] px-3 py-2 text-[11px] text-[#1f419a] ring-1 ring-[#d9e2ff]">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-semibold">
                            Credits: {creditsRemaining}
                          </span>
                          <span>{nextSlotSummary}</span>
                        </div>
                        {!unlimitedCustomSlots && extraCustomSlotsUsed > 0 && (
                          <div className="mt-1 font-medium text-amber-700">
                            {extraCustomSlotsUsed} extra slot{extraCustomSlotsUsed === 1 ? "" : "s"} already using credits beyond your included allowance.
                          </div>
                        )}
                        <div className="mt-1 text-gray-600">{renewalSummary}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Calendar card */}
              <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                {/* Month nav */}
                <div className="mb-4 flex items-center justify-between">
                  <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-gray-100">
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900">
                      {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </h2>
                    <button
                      onClick={goToToday}
                      className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-[#1f419a]/10 hover:text-[#1f419a]"
                    >
                      Today
                    </button>
                    <button
                      onClick={goToFirstAvailableDate}
                      className="inline-flex items-center gap-1 rounded-md bg-[#1f419a]/10 px-2 py-0.5 text-[11px] font-semibold text-[#1f419a] hover:bg-[#1f419a]/15"
                    >
                      <ArrowRight className="h-3 w-3" />
                      First available
                    </button>
                  </div>
                  <button
                    onClick={nextMonth}
                    disabled={!canGoToNextMonth}
                    className="rounded-lg p-1.5 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="h-5 w-5 text-gray-600" />
                  </button>
                </div>

                {/* Day names */}
                <div className="mb-1 grid grid-cols-7 gap-1">
                  {DAY_NAMES.map((d) => (
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
                    const beyondWindow = isBeyondSlotWindow(date);
                    const beforeMinimumLeadTime = isBeforeMinimumSlotLeadTime(date);
                    const today = isToday(date);
                    const inMonth = isCurrentMonth(date);
                    const isFocused = focusedDate === dk;
                    const disabledDate =
                      !inMonth || past || beyondWindow || beforeMinimumLeadTime;

                    return (
                      <button
                        key={i}
                        onClick={() => handleDateClick(date)}
                        disabled={disabledDate}
                        className={`relative flex flex-col items-center justify-center rounded-lg border p-1 transition-all ${
                          !inMonth
                            ? "cursor-default opacity-20"
                            : past || beyondWindow || beforeMinimumLeadTime
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
                  <div className="relative">
                    <div className={`max-h-[320px] space-y-2 pb-8 sm:max-h-[360px] ${SLEEK_SCROLLBAR_CLASS}`}>
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
                                {d.toLocaleDateString(browserLocale, {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </p>
                              <p className="text-[11px] text-gray-500">
                                {d.toLocaleTimeString(browserLocale, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                                {" · "}
                                <span className="capitalize">{m.user_role}</span>
                              </p>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                          </Link>
                        );
                      })}
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-xl bg-gradient-to-t from-white via-white/95 to-white/0" />
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
                {availabilityPanelSlots.length === 0 ? (
                  <div className="py-4 text-center">
                    <CalendarIcon className="mx-auto mb-2 h-8 w-8 text-gray-200" />
                    <p className="text-xs text-gray-400">No slots set yet</p>
                    <p className="text-[11px] text-gray-400">Click a date to add one</p>
                  </div>
                ) : (
                  <div className="relative">
                    <div className={`max-h-[320px] space-y-2 pb-8 sm:max-h-[360px] lg:max-h-[560px] ${SLEEK_SCROLLBAR_CLASS}`}>
                      {availabilityPanelSlots.map((slot) => (
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
                                {getDateLabelInTimeZone(
                                  slot.scheduled_at || `${slot.slot_date}T${slot.slot_time}`,
                                  calendarTimeZone
                                )}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                                <span>
                                  {getTimeLabelInTimeZone(
                                    slot.scheduled_at || `${slot.slot_date}T${slot.slot_time}`,
                                    calendarTimeZone,
                                    browserLocale
                                  )}
                                </span>
                                {starterTrial?.active_slot_id === slot.id && (
                                  <span className="rounded-full bg-white px-2 py-0.5 font-semibold uppercase tracking-wide text-[#1f419a] ring-1 ring-[#d9e2ff]">
                                    starter slot
                                  </span>
                                )}
                              </div>
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
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-xl bg-gradient-to-t from-white via-white/95 to-white/0" />
                  </div>
                )}

              </div>

              {/* Reserved / booked slots */}
              {bookedUpcomingSlots.length > 0 && (
                <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                    <Video className="h-4 w-4 text-amber-500" />
                    Reserved Slots
                  </h3>
                  <div className="relative">
                    <div className={`max-h-[320px] space-y-2 pb-8 sm:max-h-[360px] ${SLEEK_SCROLLBAR_CLASS}`}>
                      {bookedUpcomingSlots.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/60 p-2.5"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded bg-amber-100">
                              <Clock className="h-3.5 w-3.5 text-amber-600" />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-900">
                                {getDateLabelInTimeZone(
                                  slot.scheduled_at || `${slot.slot_date}T${slot.slot_time}`,
                                  calendarTimeZone
                                )}
                              </p>
                              <p className="text-[11px] text-gray-500">
                                {getTimeLabelInTimeZone(
                                  slot.scheduled_at || `${slot.slot_date}T${slot.slot_time}`,
                                  calendarTimeZone,
                                  browserLocale
                                )}
                              </p>
                            </div>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                            booked
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-xl bg-gradient-to-t from-white via-white/95 to-white/0" />
                  </div>

                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ---- Time Picker Modal ---- */}
      {showTimePicker && selectedDate && (
        <>
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Add Time Slot</h3>
              <button
                onClick={closeTimeSlotModal}
                className="rounded-lg p-1.5 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <p className="mb-2 text-sm text-gray-500">
              <span className="font-medium text-gray-900">
                {getDateLabelInTimeZone(
                  `${selectedDate}T12:00:00Z`,
                  calendarTimeZone,
                  browserLocale
                )}
                {", "}
                {selectedDate.slice(0, 4)}
              </span>
            </p>
            <p className="mb-4 text-xs font-medium text-gray-500">
              Time zone: <span className="text-gray-700">{calendarTimeZone}</span>
            </p>
            <div className="mb-4 grid gap-4">
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Select time slot
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (availableTimeOptions.length > 0) {
                      setActiveTimePicker("single");
                    }
                  }}
                  disabled={availableTimeOptions.length === 0}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-3 text-left text-sm text-gray-700 shadow-sm transition-all focus:border-[#1f419a] focus:outline-none focus:ring-2 focus:ring-[#1f419a]/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <span className="font-medium text-gray-800">
                    {selectedTime
                      ? formatSlotTimeLabel(selectedTime, browserLocale)
                      : "No times after the 48-hour window"}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${
                      activeTimePicker === "single" ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>

              {starterTrial?.eligible ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-[#1f419a]">
                  <p className="font-semibold">This is your free starter slot</p>
                  <p className="mt-1">
                    New accounts can create one host-only slot so other users can request a meeting. After you accept your first booking, subscribe to unlock more availability.
                  </p>
                </div>
              ) : creditsExhausted ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">More credits needed for this slot</p>
                  <p className="mt-1">
                    {getCreditUsageSummary(
                      customSlotCreditCost,
                      creditsRemaining ?? 0,
                      tierConfig?.tier || "current"
                    )}
                  </p>
                  <Link
                    href={walletAccessEnabled ? CREDIT_PURCHASE_HREF : SUBSCRIPTION_HREF}
                    className="mt-2 inline-flex font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2"
                  >
                    {walletAccessEnabled ? "Get more credits" : "View plans"}
                  </Link>
                </div>
              ) : derivedNextCustomSlotUsesCredits ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-[#1f419a]">
                  <p className="font-semibold">Your next slot will use credits</p>
                  <p className="mt-1">
                    {getCreditUsageSummary(
                      customSlotCreditCost,
                      creditsRemaining ?? 0,
                      tierConfig?.tier || "current"
                    )}
                  </p>
                </div>
              ) : null}

              {getSlotsForDate(selectedDate).length > 0 && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="mb-1.5 text-xs font-medium text-green-800">
                    Already set for this day:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {getSlotsForDate(selectedDate).map((slot) => (
                      <span
                        key={slot.id}
                        className="rounded bg-green-200 px-2 py-0.5 text-xs font-medium text-green-800"
                      >
                        {formatSlotTimeLabel(slot.slot_time, browserLocale)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {availableTimeOptions.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  There are no times on this day that satisfy the 48-hour advance notice window.
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeTimeSlotModal}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={
                  !selectedTime ||
                  saving ||
                  Boolean(starterTrial?.has_active_slot || starterTrial?.upgrade_required) ||
                  slots.some(
                    (s) =>
                      s.slot_date === selectedDate &&
                      s.slot_time.slice(0, 5) === selectedTime.slice(0, 5)
                  )
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50"
                type="button"
                onClick={addSlot}
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
          {activeTimePicker && activeTimeValue && (
            <>
              <button
                type="button"
                aria-label="Close time picker"
                className="fixed inset-0 z-[70] bg-black/20"
                onClick={() => setActiveTimePicker(null)}
              />

              <div className="fixed inset-x-0 bottom-0 z-[80] rounded-t-[28px] border border-gray-200 bg-white shadow-2xl sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
                <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-gray-200 sm:hidden" />
                <div className="flex items-center justify-between px-4 pb-3 pt-4 sm:border-b sm:border-gray-100">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Choose time</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Smooth, mobile-friendly time picker.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTimePicker(null)}
                    className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="max-h-[55vh] overflow-y-auto overscroll-contain scroll-smooth px-2 pb-3 sm:max-h-96 sm:px-2 sm:pt-2">
                  {availableTimeOptions.map((time) => {
                    const isSelected = time === activeTimeValue;
                    const isDisabled =
                      activeTimePicker === "single" &&
                      slots.some(
                        (slot) =>
                          slot.slot_date === selectedDate &&
                          slot.slot_time.slice(0, 5) === time.slice(0, 5)
                      );

                    return (
                      <button
                        key={`${activeTimePicker}-${time}`}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleTimeOptionSelect(time)}
                        className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition-colors ${
                          isSelected
                            ? "bg-[#1f419a] text-white shadow-sm"
                            : isDisabled
                              ? "cursor-not-allowed text-gray-300"
                              : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <span className="pr-3 leading-5">
                          {formatSlotTimeLabel(time, browserLocale)}
                          {isDisabled ? "  (Already added)" : ""}
                        </span>
                        {isSelected && <Check className="h-4 w-4 flex-shrink-0" />}
                      </button>
                    );
                  })}

                  {availableTimeOptions.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-gray-500">
                      No times satisfy the 48-hour advance notice window.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
