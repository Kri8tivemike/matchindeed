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

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import {
  Calendar as CalendarIcon,
  Search,
  Filter,
  Mail,
  Edit,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

type CalendarSlot = {
  id: string;
  user_id: string;
  slot_date: string;
  slot_time: string;
  source: string;
  user: {
    email: string;
    display_name: string | null;
  } | null;
};

type MeetingConflict = {
  date: string;
  count: number;
  meetings: any[];
};

export default function AdminCalendarPage() {
  const { toast } = useToast();
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [conflicts, setConflicts] = useState<MeetingConflict[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  /**
   * Fetch all calendar slots
   */
  const fetchSlots = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("meeting_availability")
        .select(`
          id,
          user_id,
          slot_date,
          slot_time,
          source,
          accounts!user_id (
            email,
            display_name
          )
        `)
        .order("slot_date", { ascending: true })
        .order("slot_time", { ascending: true });

      if (dateFilter) {
        query = query.eq("slot_date", dateFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching slots:", error);
        return;
      }

      const transformedSlots: CalendarSlot[] = (data || []).map((slot: any) => ({
        id: slot.id,
        user_id: slot.user_id,
        slot_date: slot.slot_date,
        slot_time: slot.slot_time,
        source: slot.source,
        user: Array.isArray(slot.accounts) ? slot.accounts[0] : slot.accounts,
      }));

      setSlots(transformedSlots);

      // Detect conflicts (3+ meetings on same date)
      detectConflicts(transformedSlots);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Detect meeting conflicts
   */
  const detectConflicts = (allSlots: CalendarSlot[]) => {
    const dateGroups: Record<string, CalendarSlot[]> = {};
    
    allSlots.forEach(slot => {
      if (!dateGroups[slot.slot_date]) {
        dateGroups[slot.slot_date] = [];
      }
      dateGroups[slot.slot_date].push(slot);
    });

    const conflictList: MeetingConflict[] = [];
    Object.entries(dateGroups).forEach(([date, slots]) => {
      if (slots.length >= 3) {
        conflictList.push({
          date,
          count: slots.length,
          meetings: slots,
        });
      }
    });

    setConflicts(conflictList);
  };

  useEffect(() => {
    fetchSlots();
  }, [dateFilter]);

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
    // This would integrate with email service
    toast.info(`Email alert would be sent to ${slot.user?.email}`);
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

      {/* Conflicts Alert */}
      {conflicts.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold text-amber-900">Meeting Conflicts Detected</h3>
          </div>
          <p className="text-sm text-amber-700 mb-3">
            {conflicts.length} date(s) have 3 or more meetings scheduled. Review and allocate accordingly.
          </p>
          <div className="space-y-2">
            {conflicts.map((conflict, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg">
                <span className="text-sm font-medium">{conflict.date}</span>
                <span className="text-sm text-amber-600">{conflict.count} meetings</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
        </div>
      </div>

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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
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
                          href={`/admin/users/${slot.user_id}`}
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
