"use client";

/**
 * MeetingsPage — MatchIndeed
 *
 * Enhanced meetings/appointments page with:
 * - Standard dashboard layout (no overlay)
 * - Tab-based filtering (Upcoming, Pending, Past, All)
 * - Cleaner card layouts with brand-consistent colors
 * - Global toast notifications instead of inline banners
 * - All business logic preserved (accept, decline, cancel, finalize)
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  User,
  Video,
  Check,
  X,
  ChevronRight,
  RefreshCw,
  Ban,
  CreditCard,
  ClipboardCheck,
  Loader2,
  ArrowRight,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import CancellationConfirmModal from "@/components/CancellationConfirmModal";
import NotificationBell from "@/components/NotificationBell";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type Meeting = {
  id: string;
  host_id: string;
  type: "group" | "one_on_one";
  status: "pending" | "confirmed" | "canceled" | "completed";
  scheduled_at: string;
  location_pref: string | null;
  fee_cents: number | null;
  charge_status: "pending" | "captured" | "refunded" | "pending_review";
  cancellation_fee_cents: number | null;
  canceled_by: string | null;
  outcome: string | null;
  fault_determination: string | null;
  finalized_at: string | null;
  created_at: string;
  host_profile?: { first_name: string | null; profile_photo_url: string | null };
  participants?: MeetingParticipant[];
};

type MeetingParticipant = {
  user_id: string;
  role: "host" | "guest" | "coordinator";
  response: "requested" | "accepted" | "declined";
  responded_at: string | null;
  user_profile?: { first_name: string | null; profile_photo_url: string | null };
  user?: { id: string; tier: string; display_name: string | null; email: string };
};

type TabType = "upcoming" | "pending" | "past" | "all";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
const formatDate = (dateString: string): string =>
  new Date(dateString).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const formatTime = (dateString: string): string =>
  new Date(dateString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  confirmed: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  pending: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  canceled: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  completed: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
};

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function MeetingsPage() {
  const { toast } = useToast();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("upcoming");
  const [processing, setProcessing] = useState<string | null>(null);

  // Cancellation modal
  const [cancelModal, setCancelModal] = useState<{
    isOpen: boolean;
    meetingId: string;
    isConfirmed: boolean;
    cancellationFeeCents: number;
  }>({ isOpen: false, meetingId: "", isConfirmed: false, cancellationFeeCents: 0 });

  // Finalization modal
  const [finalizeModal, setFinalizeModal] = useState<{ isOpen: boolean; meetingId: string }>({
    isOpen: false,
    meetingId: "",
  });
  const [finalizeForm, setFinalizeForm] = useState({
    outcome: "completed",
    fault: "no_fault",
    charge_decision: "capture",
    notes: "",
  });
  const [finalizing, setFinalizing] = useState(false);

  // ---------------------------------------------------------------
  // Fetch meetings
  // ---------------------------------------------------------------
  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          setLoading(false);
          return;
        }
        setUserId(user.id);

        // Host meetings
        const { data: hostMeetings } = await supabase
          .from("meetings")
          .select(
            `*, meeting_participants (user_id, role, response, responded_at, user:accounts!meeting_participants_user_id_fkey(id, tier, display_name, email))`
          )
          .eq("host_id", user.id)
          .order("scheduled_at", { ascending: false });

        // Participant meetings
        const { data: participantMeetings } = await supabase
          .from("meeting_participants")
          .select(
            `meeting_id, role, response, responded_at, meetings!meeting_id (id, host_id, type, status, scheduled_at, location_pref, fee_cents, charge_status, created_at, meeting_participants (user_id, role, response, user:accounts!meeting_participants_user_id_fkey(id, tier, display_name, email)))`
          )
          .eq("user_id", user.id)
          .neq("role", "host");

        const allMeetings: Meeting[] = [];

        (hostMeetings || []).forEach((m: Record<string, unknown>) => {
          const parts = (m.meeting_participants as Array<Record<string, unknown>>) || [];
          allMeetings.push({
            ...(m as unknown as Meeting),
            participants: parts.map((p) => ({
              user_id: p.user_id as string,
              role: p.role as MeetingParticipant["role"],
              response: p.response as MeetingParticipant["response"],
              responded_at: p.responded_at as string | null,
              user: (p.user as MeetingParticipant["user"]) || undefined,
            })),
          });
        });

        (participantMeetings || []).forEach((p: Record<string, unknown>) => {
          const meeting = p.meetings as Record<string, unknown> | null;
          if (!meeting || allMeetings.find((m) => m.id === meeting.id)) return;
          const parts =
            (meeting.meeting_participants as Array<Record<string, unknown>>) || [];
          allMeetings.push({
            ...(meeting as unknown as Meeting),
            participants: parts.map((pt) => ({
              user_id: pt.user_id as string,
              role: pt.role as MeetingParticipant["role"],
              response: pt.response as MeetingParticipant["response"],
              responded_at: pt.responded_at as string | null,
              user: (pt.user as MeetingParticipant["user"]) || undefined,
            })),
          });
        });

        setMeetings(allMeetings);
      } catch (error) {
        console.error("Error fetching meetings:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMeetings();
  }, []);

  // ---------------------------------------------------------------
  // Filtered meetings
  // ---------------------------------------------------------------
  const filteredMeetings = meetings.filter((m) => {
    const now = new Date();
    const d = new Date(m.scheduled_at);
    switch (activeTab) {
      case "upcoming":
        return m.status === "confirmed" && d > now;
      case "pending":
        return m.status === "pending";
      case "past":
        return d < now || m.status === "completed" || m.status === "canceled";
      default:
        return true;
    }
  });

  const counts = {
    upcoming: meetings.filter(
      (m) => m.status === "confirmed" && new Date(m.scheduled_at) > new Date()
    ).length,
    pending: meetings.filter((m) => m.status === "pending").length,
    past: meetings.filter(
      (m) =>
        new Date(m.scheduled_at) < new Date() ||
        m.status === "completed" ||
        m.status === "canceled"
    ).length,
    all: meetings.length,
  };

  // ---------------------------------------------------------------
  // Accept / Decline
  // ---------------------------------------------------------------
  const acceptMeeting = async (meetingId: string) => {
    if (!userId) return;
    setProcessing(meetingId);

    try {
      const { error: participantError } = await supabase
        .from("meeting_participants")
        .update({ response: "accepted", responded_at: new Date().toISOString() })
        .eq("meeting_id", meetingId)
        .eq("user_id", userId);
      if (participantError) throw participantError;

      const { data: participants } = await supabase
        .from("meeting_participants")
        .select("response")
        .eq("meeting_id", meetingId);

      const allAccepted = participants?.every((p) => p.response === "accepted");

      if (allAccepted) {
        await supabase.from("meetings").update({ status: "confirmed" }).eq("id", meetingId);
      }

      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                status: allAccepted ? ("confirmed" as const) : m.status,
                participants: m.participants?.map((p) =>
                  p.user_id === userId
                    ? { ...p, response: "accepted" as const, responded_at: new Date().toISOString() }
                    : p
                ),
              }
            : m
        )
      );

      if (allAccepted) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            await fetch("/api/meetings/notifications/schedule", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ meeting_id: meetingId }),
            });
          }
        } catch {
          // Non-critical
        }
      }

      toast.success("Meeting request accepted!");
    } catch {
      toast.error("Failed to accept meeting. Please try again.");
    } finally {
      setProcessing(null);
    }
  };

  const declineMeeting = async (meetingId: string) => {
    if (!userId) return;
    setProcessing(meetingId);

    try {
      await supabase
        .from("meeting_participants")
        .update({ response: "declined", responded_at: new Date().toISOString() })
        .eq("meeting_id", meetingId)
        .eq("user_id", userId);

      await supabase.from("meetings").update({ status: "canceled" }).eq("id", meetingId);

      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                status: "canceled" as const,
                participants: m.participants?.map((p) =>
                  p.user_id === userId
                    ? { ...p, response: "declined" as const, responded_at: new Date().toISOString() }
                    : p
                ),
              }
            : m
        )
      );

      toast.success("Meeting request declined.");
    } catch {
      toast.error("Failed to decline meeting.");
    } finally {
      setProcessing(null);
    }
  };

  // ---------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------
  const openCancelModal = (meeting: Meeting) => {
    setCancelModal({
      isOpen: true,
      meetingId: meeting.id,
      isConfirmed: meeting.status === "confirmed",
      cancellationFeeCents: meeting.cancellation_fee_cents || meeting.fee_cents || 0,
    });
  };

  const handleCanceled = (result: { cancellation_fee_applied: boolean; credit_refunded: boolean }) => {
    setCancelModal({ isOpen: false, meetingId: "", isConfirmed: false, cancellationFeeCents: 0 });
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === cancelModal.meetingId ? { ...m, status: "canceled" as const, canceled_by: userId } : m
      )
    );
    toast.success(
      result.cancellation_fee_applied
        ? "Meeting canceled. A cancellation fee has been charged."
        : "Meeting canceled successfully."
    );
  };

  // ---------------------------------------------------------------
  // Finalize
  // ---------------------------------------------------------------
  const handleFinalize = async (meetingId: string) => {
    setFinalizing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch("/api/meetings/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ meeting_id: meetingId, ...finalizeForm }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Failed to finalize meeting.");
        return;
      }

      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                status: "completed" as const,
                charge_status: data.charge_status,
                outcome: finalizeForm.outcome,
                fault_determination: finalizeForm.fault,
                finalized_at: new Date().toISOString(),
              }
            : m
        )
      );

      setFinalizeModal({ isOpen: false, meetingId: "" });
      setFinalizeForm({ outcome: "completed", fault: "no_fault", charge_decision: "capture", notes: "" });
      toast.success(
        data.refund_issued
          ? "Meeting finalized. Credits refunded to the requester."
          : "Meeting finalized. Charges captured."
      );
    } catch {
      toast.error("Failed to finalize meeting.");
    } finally {
      setFinalizing(false);
    }
  };

  // ---------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="mt-3 text-sm text-gray-500">Loading meetings...</p>
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
          <Sidebar active="appointments" />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 space-y-5">
          {/* Page header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                <Video className="h-7 w-7 text-[#1f419a]" />
                My Appointments
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage your video dating meetings
              </p>
            </div>
            <Link
              href="/dashboard/calendar"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg"
            >
              <Calendar className="h-4 w-4" />
              Set Availability
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(["upcoming", "pending", "past", "all"] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-[#1f419a] text-white shadow-sm"
                    : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                <span
                  className={`min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${
                    activeTab === tab ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {counts[tab]}
                </span>
              </button>
            ))}
          </div>

          {/* Meeting list */}
          {filteredMeetings.length === 0 ? (
            <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-black/5">
              <Video className="mx-auto mb-3 h-12 w-12 text-gray-200" />
              <h3 className="font-semibold text-gray-900">
                No {activeTab === "all" ? "" : activeTab + " "}meetings
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                {activeTab === "pending"
                  ? "No pending meeting requests."
                  : activeTab === "upcoming"
                    ? "No upcoming meetings scheduled."
                    : "Your meeting history will appear here."}
              </p>
              <Link
                href="/dashboard/discover"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#1f419a] hover:underline"
              >
                Discover people <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMeetings.map((meeting) => {
                const isHost = meeting.host_id === userId;
                const myPart = meeting.participants?.find((p) => p.user_id === userId);
                const needsResponse = myPart?.response === "requested" && !isHost;
                const sc = statusConfig[meeting.status] || statusConfig.completed;
                const isPastMeeting =
                  new Date(meeting.scheduled_at) < new Date() || meeting.status === "completed";

                return (
                  <div
                    key={meeting.id}
                    className={`overflow-hidden rounded-xl bg-white shadow-sm ring-1 transition-all ${
                      needsResponse ? "ring-amber-300 ring-2" : "ring-black/5"
                    }`}
                  >
                    {/* Card body */}
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        {/* Left: info */}
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1f419a] to-[#4463cf]">
                            <Video className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold text-gray-900">
                                {meeting.type === "one_on_one" ? "1-on-1 Meeting" : "Group Meeting"}
                              </h4>
                              {/* Status badge */}
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${sc.bg} ${sc.text}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                {meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)}
                              </span>
                              {isHost && (
                                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                                  Host
                                </span>
                              )}
                            </div>

                            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {formatDate(meeting.scheduled_at)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {formatTime(meeting.scheduled_at)}
                              </span>
                              {meeting.location_pref && (
                                <span className="text-gray-400">{meeting.location_pref}</span>
                              )}
                            </div>

                            {/* Requester tier for pending */}
                            {needsResponse &&
                              meeting.participants &&
                              (() => {
                                const requester = meeting.participants.find((p) => p.role === "guest");
                                const tier = requester?.user?.tier;
                                return tier ? (
                                  <p className="mt-1.5 text-xs font-medium text-blue-600">
                                    Request from {tier.charAt(0).toUpperCase() + tier.slice(1)} account
                                  </p>
                                ) : null;
                              })()}
                          </div>
                        </div>

                        {/* Right: actions */}
                        <div className="flex flex-wrap items-center gap-2">
                          {needsResponse && (
                            <>
                              <button
                                onClick={() => acceptMeeting(meeting.id)}
                                disabled={processing === meeting.id}
                                className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                              >
                                {processing === meeting.id ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                                Accept
                              </button>
                              <button
                                onClick={() => declineMeeting(meeting.id)}
                                disabled={processing === meeting.id}
                                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                Decline
                              </button>
                            </>
                          )}

                          {meeting.status === "confirmed" &&
                            new Date(meeting.scheduled_at) > new Date() && (
                              <>
                                <Link
                                  href={`/dashboard/meetings/join?id=${meeting.id}`}
                                  className="flex items-center gap-1.5 rounded-lg bg-[#1f419a] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#17357b]"
                                >
                                  <Video className="h-3.5 w-3.5" />
                                  Join
                                </Link>
                                <button
                                  onClick={() => openCancelModal(meeting)}
                                  className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                                >
                                  <Ban className="h-3 w-3" />
                                  Cancel
                                </button>
                              </>
                            )}

                          {meeting.status === "pending" && !needsResponse && (
                            <button
                              onClick={() => openCancelModal(meeting)}
                              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                            >
                              <Ban className="h-3 w-3" />
                              Cancel
                            </button>
                          )}

                          {meeting.status === "completed" && !meeting.finalized_at && isHost && (
                            <Link
                              href={`/dashboard/meetings/${meeting.id}/conclude`}
                              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              Conclude
                            </Link>
                          )}

                          {meeting.status === "completed" && (
                            <Link
                              href={`/dashboard/meetings/${meeting.id}/response`}
                              className="flex items-center gap-1.5 rounded-lg bg-[#1f419a] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#17357b]"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Respond
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card footer — participants + charge status */}
                    {(meeting.participants?.length || meeting.charge_status || meeting.status === "canceled") && (
                      <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 sm:px-5">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          {/* Participants */}
                          {meeting.participants && meeting.participants.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                                Participants
                              </span>
                              <div className="flex items-center gap-1">
                                {meeting.participants.map((p, idx) => (
                                  <div key={idx} className="flex items-center gap-1">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200">
                                      <User className="h-3 w-3 text-gray-500" />
                                    </div>
                                    <span className="text-xs text-gray-600">
                                      {p.role === "host" ? "Host" : "Guest"}
                                    </span>
                                    <span
                                      className={`h-2 w-2 rounded-full ${
                                        p.response === "accepted"
                                          ? "bg-green-500"
                                          : p.response === "declined"
                                            ? "bg-red-500"
                                            : "bg-amber-400"
                                      }`}
                                      title={p.response}
                                    />
                                    {idx < (meeting.participants?.length || 0) - 1 && (
                                      <span className="mx-1 text-gray-300">·</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Charge status */}
                          {meeting.charge_status && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                meeting.charge_status === "captured"
                                  ? "bg-green-50 text-green-700"
                                  : meeting.charge_status === "refunded"
                                    ? "bg-blue-50 text-blue-700"
                                    : meeting.charge_status === "pending_review"
                                      ? "bg-orange-50 text-orange-700"
                                      : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              <CreditCard className="h-2.5 w-2.5" />
                              {meeting.charge_status === "captured"
                                ? "Finalized"
                                : meeting.charge_status === "refunded"
                                  ? "Refunded"
                                  : meeting.charge_status === "pending_review"
                                    ? "Under Review"
                                    : "Pending"}
                            </span>
                          )}

                          {/* Outcome */}
                          {meeting.finalized_at && meeting.outcome && (
                            <span className="text-[11px] text-gray-400">
                              {meeting.outcome.replace(/_/g, " ")}
                            </span>
                          )}

                          {/* Canceled info */}
                          {meeting.status === "canceled" && meeting.canceled_by && (
                            <span className="text-[11px] text-red-400">
                              Canceled by {meeting.canceled_by === userId ? "you" : "other party"}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Cancellation modal */}
      <CancellationConfirmModal
        isOpen={cancelModal.isOpen}
        onClose={() =>
          setCancelModal({ isOpen: false, meetingId: "", isConfirmed: false, cancellationFeeCents: 0 })
        }
        meetingId={cancelModal.meetingId}
        isConfirmed={cancelModal.isConfirmed}
        cancellationFeeCents={cancelModal.cancellationFeeCents}
        creditRefunded={!cancelModal.isConfirmed}
        onCanceled={handleCanceled}
      />

      {/* Host finalization modal */}
      {finalizeModal.isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                  <ClipboardCheck className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Finalize Meeting</h3>
                  <p className="text-xs text-gray-500">Determine outcome and charges</p>
                </div>
              </div>
              <button
                onClick={() => setFinalizeModal({ isOpen: false, meetingId: "" })}
                className="rounded-lg p-1.5 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Meeting Outcome</label>
                <select
                  value={finalizeForm.outcome}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, outcome: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#1f419a] focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                >
                  <option value="completed">Completed Successfully</option>
                  <option value="no_show">No Show</option>
                  <option value="early_leave">Early Leave</option>
                  <option value="network_disconnect">Network Issue</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Fault Determination</label>
                <select
                  value={finalizeForm.fault}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, fault: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#1f419a] focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                >
                  <option value="no_fault">No Fault</option>
                  <option value="requester_fault">Requester at Fault</option>
                  <option value="accepter_fault">Accepter at Fault</option>
                  <option value="both_fault">Both at Fault</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Charge Decision</label>
                <select
                  value={finalizeForm.charge_decision}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, charge_decision: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:border-[#1f419a] focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20"
                >
                  <option value="capture">Capture — Requester pays</option>
                  <option value="refund">Refund — Return credits</option>
                  <option value="pending_review">Submit for Review (1-2 days)</option>
                </select>
                <p className="mt-1 text-[11px] text-gray-400">
                  {finalizeForm.charge_decision === "capture"
                    ? "Credits permanently deducted from requester."
                    : finalizeForm.charge_decision === "refund"
                      ? "Credits returned to requester's account."
                      : "MatchIndeed reviews within 1-2 business days."}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  value={finalizeForm.notes}
                  onChange={(e) => setFinalizeForm({ ...finalizeForm, notes: e.target.value })}
                  placeholder="Meeting observations..."
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:border-[#1f419a] focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 border-t border-gray-100 p-4">
              <button
                onClick={() => setFinalizeModal({ isOpen: false, meetingId: "" })}
                disabled={finalizing}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleFinalize(finalizeModal.meetingId)}
                disabled={finalizing}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50"
              >
                {finalizing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Finalizing...
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="h-4 w-4" />
                    Finalize
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
