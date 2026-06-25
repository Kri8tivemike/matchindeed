"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  UserCog,
  XCircle,
} from "lucide-react";

type GenderChangeEvent = {
  id: string;
  user_id: string;
  old_gender: string | null;
  new_gender: string;
  changed_at: string;
  pause_until: string;
  status: string;
  approval_notes: string | null;
  approval_reviewed_at: string | null;
  restored_at: string | null;
  metadata: Record<string, unknown> | null;
  user: {
    email: string | null;
    display_name: string | null;
    account_status: string | null;
    profile_visible: boolean | null;
    profile_status: string | null;
  } | null;
  profile: {
    first_name: string | null;
  } | null;
  reviewer: {
    email: string | null;
    display_name: string | null;
  } | null;
};

const STATUS_STYLES: Record<string, string> = {
  pending_verification: "bg-amber-100 text-amber-800",
  pending_approval: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  restored: "bg-slate-100 text-slate-700",
};

function formatGender(value: string | null) {
  if (!value) return "Not set";
  const map: Record<string, string> = {
    male: "Male",
    female: "Female",
    other: "Other",
    prefer_not_to_say: "Prefer not to say",
  };
  return map[value] || value.replace(/_/g, " ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function verificationText(event: GenderChangeEvent) {
  const text = event.metadata?.verification_statement;
  return typeof text === "string" && text.trim() ? text : "No statement provided.";
}

export default function AdminGenderChangesPage() {
  const { toast } = useToast();
  const [events, setEvents] = useState<GenderChangeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending_approval");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<GenderChangeEvent | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Your admin session expired. Please log in again.");
        return;
      }

      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const response = await fetch(`/api/admin/gender-changes?${params}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to load requests");
      }

      setEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch (error) {
      console.error("[admin/gender-changes] load failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const filteredEvents = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return events;
    return events.filter((event) => {
      const haystack = [
        event.user?.email,
        event.user?.display_name,
        event.profile?.first_name,
        event.old_gender,
        event.new_gender,
        event.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [events, searchTerm]);

  const pendingCount = events.filter((event) =>
    ["pending_verification", "pending_approval"].includes(event.status)
  ).length;

  const reviewSelected = async () => {
    if (!selectedEvent) return;
    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Your admin session expired. Please log in again.");
      }

      const response = await fetch("/api/admin/gender-changes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          decision,
          notes,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to submit decision");
      }

      toast.success(
        payload.restored
          ? "Gender change approved and profile restored."
          : `Gender change ${decision}.`
      );
      setSelectedEvent(null);
      setNotes("");
      setDecision("approved");
      fetchEvents();
    } catch (error) {
      console.error("[admin/gender-changes] review failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to submit decision");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gender Changes</h1>
          <p className="mt-1 text-gray-500">
            Review gender setting updates before hidden profiles become visible again.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchEvents}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600">Pending Review</p>
              <p className="mt-1 text-2xl font-bold text-blue-900">{pendingCount}</p>
            </div>
            <Clock className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-600">Approved</p>
              <p className="mt-1 text-2xl font-bold text-green-900">
                {events.filter((event) => event.status === "approved").length}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600">Rejected</p>
              <p className="mt-1 text-2xl font-bold text-red-900">
                {events.filter((event) => event.status === "rejected").length}
              </p>
            </div>
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by email, name, or gender..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 outline-none focus:border-[#1f419a]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-[#1f419a]"
        >
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="restored">Restored</option>
          <option value="all">All Statuses</option>
        </select>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-gray-400" />
          <p className="text-gray-500">Loading gender change requests...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <AlertCircle className="mx-auto mb-4 h-8 w-8 text-gray-400" />
          <p className="text-gray-500">No gender change requests found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEvents.map((event) => (
            <div
              key={event.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <p className="font-semibold text-gray-900">
                      {event.profile?.first_name ||
                        event.user?.display_name ||
                        event.user?.email ||
                        "Unknown user"}
                    </p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                        STATUS_STYLES[event.status] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {event.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{event.user?.email}</p>
                  <p className="mt-2 text-sm text-gray-700">
                    <span className="font-medium">Gender:</span>{" "}
                    {formatGender(event.old_gender)} → {formatGender(event.new_gender)}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    <span className="font-medium">Visibility:</span>{" "}
                    {event.user?.profile_visible ? "Visible" : "Hidden"} ·{" "}
                    {event.user?.profile_status || "unknown"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Submitted {formatDate(event.changed_at)} · Pause until{" "}
                    {formatDate(event.pause_until)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEvent(event);
                    setDecision("approved");
                    setNotes(event.approval_notes || "");
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1f419a] px-4 py-2 font-medium text-white hover:bg-[#17357b]"
                >
                  <UserCog className="h-4 w-4" />
                  {["pending_verification", "pending_approval"].includes(event.status)
                    ? "Review"
                    : "View"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
            <h2 className="mb-5 text-2xl font-bold text-gray-900">
              Review Gender Change
            </h2>
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">User:</span>{" "}
                  {selectedEvent.profile?.first_name ||
                    selectedEvent.user?.display_name ||
                    "N/A"}{" "}
                  ({selectedEvent.user?.email || "no email"})
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  <span className="font-medium">Change:</span>{" "}
                  {formatGender(selectedEvent.old_gender)} →{" "}
                  {formatGender(selectedEvent.new_gender)}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  <span className="font-medium">Pause until:</span>{" "}
                  {formatDate(selectedEvent.pause_until)}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  Verification Statement
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {verificationText(selectedEvent)}
                </p>
              </div>

              {["pending_verification", "pending_approval"].includes(selectedEvent.status) ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Decision
                    </label>
                    <select
                      value={decision}
                      onChange={(event) =>
                        setDecision(event.target.value as "approved" | "rejected")
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#1f419a]"
                    >
                      <option value="approved">Approve</option>
                      <option value="rejected">Reject</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Admin Notes
                    </label>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#1f419a]"
                      placeholder="Optional note shown in admin history and rejection status."
                    />
                  </div>
                </>
              ) : (
                <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                  <p>
                    <span className="font-medium">Reviewed:</span>{" "}
                    {formatDate(selectedEvent.approval_reviewed_at)}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium">Reviewer:</span>{" "}
                    {selectedEvent.reviewer?.display_name ||
                      selectedEvent.reviewer?.email ||
                      "N/A"}
                  </p>
                  {selectedEvent.approval_notes && (
                    <p className="mt-1">
                      <span className="font-medium">Notes:</span>{" "}
                      {selectedEvent.approval_notes}
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                {["pending_verification", "pending_approval"].includes(selectedEvent.status) && (
                  <button
                    type="button"
                    onClick={reviewSelected}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#1f419a] px-4 py-2 font-semibold text-white hover:bg-[#17357b] disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Submit Decision
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
