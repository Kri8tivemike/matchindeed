"use client";

/**
 * AdminCalendarPage - Calendar Management
 * 
 * Features per client request:
 * - View all user calendars and scheduled meetings
 * - Adjust and rebook meetings
 * - Send email alerts to users
 * - Calendar history tracking
 * - Handle meeting conflicts (3+ people on same date)
 */

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import {
  Calendar as CalendarIcon,
  Search,
  Mail,
  Edit,
  User,
  AlertCircle,
  Loader2,
  RefreshCw,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { adminPath } from "@/lib/admin/path";

type CalendarSlot = {
  id: string;
  user_id: string;
  slot_date: string;
  slot_time: string;
  scheduled_at_utc?: string | null;
  source: string;
  user: {
    email: string;
    display_name: string | null;
  } | null;
};

type MeetingConflict = {
  key: string;
  date: string;
  time: string;
  count: number;
  slots: CalendarSlot[];
};

type CalendarSlotRow = {
  id: string;
  user_id: string;
  slot_date: string;
  slot_time: string;
  scheduled_at_utc?: string | null;
  source: string;
  accounts:
    | {
        email: string;
        display_name: string | null;
      }
    | Array<{
        email: string;
        display_name: string | null;
      }>
    | null;
};

export default function AdminCalendarPage() {
  const { toast } = useToast();
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [timeFilter, setTimeFilter] = useState<string>("");
  const [conflicts, setConflicts] = useState<MeetingConflict[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const formatConflictDate = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const formatConflictTime = (time: string) => {
    const normalized = time.length === 5 ? `${time}:00` : time;
    return new Date(`1970-01-01T${normalized}`).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  /**
   * Fetch all calendar slots
   */
  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("meeting_availability")
        .select(`
          id,
          user_id,
          slot_date,
          slot_time,
          scheduled_at_utc,
          source,
          accounts!user_id (
            email,
            display_name
          )
        `)
        .order("scheduled_at_utc", { ascending: true, nullsFirst: false })
        .order("slot_date", { ascending: true })
        .order("slot_time", { ascending: true });

      if (dateFilter) query = query.eq("slot_date", dateFilter);
      if (timeFilter) query = query.eq("slot_time", timeFilter);

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching slots:", error);
        return;
      }

      const transformedSlots: CalendarSlot[] = ((data || []) as CalendarSlotRow[]).map((slot) => ({
        id: slot.id,
        user_id: slot.user_id,
        slot_date: slot.slot_date,
        slot_time: slot.slot_time,
        scheduled_at_utc: slot.scheduled_at_utc,
        source: slot.source,
        user: Array.isArray(slot.accounts) ? slot.accounts[0] : slot.accounts,
      }));

      setSlots(transformedSlots);

      // Detect exact date+time collisions so admins can review real conflicts.
      detectConflicts(transformedSlots);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, timeFilter]);

  /**
   * Detect meeting conflicts
   */
  const detectConflicts = (allSlots: CalendarSlot[]) => {
    const slotGroups = new Map<string, CalendarSlot[]>();

    allSlots.forEach((slot) => {
      const key = slot.scheduled_at_utc || `${slot.slot_date}|${slot.slot_time}`;
      const existing = slotGroups.get(key) || [];
      existing.push(slot);
      slotGroups.set(key, existing);
    });

    const conflictList = Array.from(slotGroups.entries())
      .filter(([, groupedSlots]) => groupedSlots.length >= 2)
      .map(([key, groupedSlots]) => ({
        key,
        date: groupedSlots[0].slot_date,
        time: groupedSlots[0].slot_time,
        count: groupedSlots.length,
        slots: groupedSlots,
      }))
      .sort((a, b) =>
        (a.slots[0]?.scheduled_at_utc || `${a.date}T${a.time}`).localeCompare(
          b.slots[0]?.scheduled_at_utc || `${b.date}T${b.time}`
        )
      );

    setConflicts(conflictList);
  };

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  /**
   * Update calendar slot
   */
  const handleUpdateSlot = async () => {
    if (!selectedSlot || !newDate || !newTime) return;

    try {
      const { error } = await supabase
        .from("meeting_availability")
        .update({
          slot_date: newDate,
          slot_time: newTime,
        })
        .eq("id", selectedSlot.id);

      if (error) throw error;

      // Send email alert (would integrate with email service)
      // await sendEmailAlert(selectedSlot.user_id, { oldDate, newDate, newTime });

      // Log admin action
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("admin_logs").insert({
          admin_id: user.id,
          action: "calendar_slot_updated",
          meta: {
            slot_id: selectedSlot.id,
            old_date: selectedSlot.slot_date,
            new_date: newDate,
            new_time: newTime,
          },
        });
      }

      setShowEditModal(false);
      setSelectedSlot(null);
      fetchSlots();
    } catch (error) {
      console.error("Error updating slot:", error);
    }
  };

  /**
   * Send email alert to user
   */
  const handleSendAlert = async (slot: CalendarSlot) => {
    if (!slot.user?.email) {
      toast.error("No email address found for this user.");
      return;
    }

    const subject = encodeURIComponent("Matchindeed calendar update");
    const body = encodeURIComponent(
      `Hello${slot.user.display_name ? ` ${slot.user.display_name}` : ""},\n\nYour calendar slot on ${formatConflictDate(slot.slot_date)} at ${formatConflictTime(slot.slot_time)} requires attention. Please log in to Matchindeed to review the latest update.\n\nMatchindeed Admin`
    );
    window.location.href = `mailto:${slot.user.email}?subject=${subject}&body=${body}`;
    toast.info(`Opening your email app for ${slot.user.email}`);
  };

  const handleReviewConflict = (conflict: MeetingConflict) => {
    setDateFilter(conflict.date);
    setTimeFilter(conflict.time);
    toast.info(
      `Showing ${conflict.count} overlapping slots for ${formatConflictDate(conflict.date)} at ${formatConflictTime(conflict.time)}.`
    );
  };

  const handleNotifyConflict = (conflict: MeetingConflict) => {
    const uniqueEmails = Array.from(
      new Set(conflict.slots.map((slot) => slot.user?.email).filter(Boolean))
    ) as string[];

    if (uniqueEmails.length === 0) {
      toast.error("No user emails found for this conflict.");
      return;
    }

    const subject = encodeURIComponent("Matchindeed scheduling conflict review");
    const body = encodeURIComponent(
      `Hello,\n\nWe are reviewing a scheduling conflict for ${formatConflictDate(conflict.date)} at ${formatConflictTime(conflict.time)}. Our admin team is currently reallocating the affected slots and will follow up with the confirmed update shortly.\n\nMatchindeed Admin`
    );
    window.location.href = `mailto:${uniqueEmails.join(",")}?subject=${subject}&body=${body}`;
    toast.info(`Opening your email app for ${uniqueEmails.length} affected user(s).`);
  };

  const filteredSlots = slots.filter(slot => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      slot.user?.email?.toLowerCase().includes(query) ||
      slot.user?.display_name?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar Management</h1>
          <p className="text-gray-500">View and manage all user calendars</p>
        </div>
        <button
          onClick={() => fetchSlots()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by user email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none"
            />
          </div>
          <div className="w-full sm:w-48">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
            />
          </div>
          <div className="w-full sm:w-40">
            <input
              type="time"
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
            />
          </div>
          {(dateFilter || timeFilter) && (
            <button
              type="button"
              onClick={() => {
                setDateFilter("");
                setTimeFilter("");
              }}
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Exact Conflict Console */}
      {conflicts.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-amber-900">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                Exact Time Conflicts
              </h3>
              <p className="mt-1 text-sm text-amber-700">
                These are overlapping slots at the same date and time. Review the affected users below and reallocate or notify them.
              </p>
            </div>
            <Link
              href={adminPath("/meetings")}
              className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              Open Meeting Management
            </Link>
          </div>

          <div className="mt-4 max-h-[46vh] overflow-auto pr-2">
            <div className="grid gap-3">
              {conflicts.map((conflict) => (
                <div
                  key={conflict.key}
                  className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          <CalendarIcon className="h-3.5 w-3.5" />
                          {formatConflictDate(conflict.date)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                          <Clock className="h-3.5 w-3.5" />
                          {formatConflictTime(conflict.time)}
                        </span>
                        <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                          {conflict.count} overlapping slots
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {conflict.slots.map((slot) => (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => {
                              setSelectedSlot(slot);
                              setNewDate(slot.slot_date);
                              setNewTime(slot.slot_time);
                              setShowEditModal(true);
                            }}
                            className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-[#1f419a]/20 hover:bg-[#1f419a]/5"
                          >
                            {slot.user?.display_name || slot.user?.email || "Unknown user"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleReviewConflict(conflict)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Review Slots
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNotifyConflict(conflict)}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                      >
                        <Mail className="h-4 w-4" />
                        Notify Users
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Calendar Slots Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          </div>
        ) : filteredSlots.length === 0 ? (
          <div className="text-center py-12">
            <CalendarIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No calendar slots found</p>
          </div>
        ) : (
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full min-w-[900px]">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-100 shadow-sm">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSlots.map((slot) => (
                  <tr key={slot.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {slot.user?.display_name || "Unknown"}
                          </p>
                          <p className="text-xs text-gray-500">{slot.user?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {new Date(slot.slot_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{slot.slot_time}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        slot.source === "customized" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"
                      }`}>
                        {slot.source === "customized" ? "Custom" : "MatchIndeed"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedSlot(slot);
                            setNewDate(slot.slot_date);
                            setNewTime(slot.slot_time);
                            setShowEditModal(true);
                          }}
                          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleSendAlert(slot)}
                          className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"
                          title="Send Alert"
                        >
                          <Mail className="h-4 w-4" />
                        </button>
                        <Link
                          href={adminPath(`/users/${slot.user_id}`)}
                          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                          title="View User"
                        >
                          <User className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedSlot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Calendar Slot</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Time</label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedSlot(null);
                  }}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateSlot}
                  className="flex-1 py-2 rounded-lg bg-[#1f419a] text-white hover:bg-[#17357b]"
                >
                  Update & Send Alert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
