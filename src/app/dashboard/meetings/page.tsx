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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  Clock,
  User,
  Video,
  Check,
  X,
  RefreshCw,
  Ban,
  CreditCard,
  ClipboardCheck,
  Loader2,
  ArrowRight,
  Eye,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import CancellationConfirmModal from "@/components/CancellationConfirmModal";
import NotificationBell from "@/components/NotificationBell";
import ProfileDetailModal from "@/components/ProfileDetailModal";
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
  workflow_state?: string | null;
  scheduled_at: string;
  canceled_at?: string | null;
  completed_at?: string | null;
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

const resolveMeetingTab = (tab: string | null): TabType => {
  if (tab === "pending" || tab === "past" || tab === "all") {
    return tab;
  }

  return "upcoming";
};

const BUY_CREDITS_HREF = "/dashboard/wallet?open=credits&source=meeting_insufficient_credits";
const TOP_UP_WALLET_HREF = "/dashboard/wallet?open=topup&source=meeting_insufficient_credits";

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

const formatStatusDateTime = (dateString: string): string =>
  new Date(dateString).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const isValidTimestamp = (value: string | null | undefined): value is string => {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
};

const getMeetingAcceptedAt = (meeting: Meeting): string | null => {
  const decisionParticipants =
    meeting.participants?.filter((participant) => participant.role !== "coordinator") || [];

  if (
    decisionParticipants.length === 0 ||
    !decisionParticipants.every(
      (participant) =>
        participant.response === "accepted" &&
        isValidTimestamp(participant.responded_at)
    )
  ) {
    return null;
  }

  return decisionParticipants.reduce((latest, participant) => {
    if (!participant.responded_at) return latest;
    if (!latest) return participant.responded_at;
    return new Date(participant.responded_at) > new Date(latest)
      ? participant.responded_at
      : latest;
  }, null as string | null);
};

const getMeetingCanceledAt = (meeting: Meeting): string | null => {
  if (isValidTimestamp(meeting.canceled_at)) {
    return meeting.canceled_at;
  }

  const participantDecisionTimes =
    meeting.participants
      ?.map((participant) => participant.responded_at)
      .filter(isValidTimestamp) || [];

  if (participantDecisionTimes.length === 0) {
    return null;
  }

  return participantDecisionTimes.reduce((latest, timestamp) =>
    new Date(timestamp) > new Date(latest) ? timestamp : latest
  );
};

const getMeetingActivityTimestamp = (meeting: Meeting): string => {
  if (meeting.status === "canceled") {
    return (
      getMeetingCanceledAt(meeting) ||
      meeting.finalized_at ||
      meeting.completed_at ||
      meeting.created_at ||
      meeting.scheduled_at
    );
  }

  if (meeting.status === "completed") {
    return (
      meeting.finalized_at ||
      meeting.completed_at ||
      getMeetingAcceptedAt(meeting) ||
      meeting.created_at ||
      meeting.scheduled_at
    );
  }

  return (
    getMeetingAcceptedAt(meeting) ||
    meeting.created_at ||
    meeting.scheduled_at
  );
};

const compareMeetingsByRecentActivity = (a: Meeting, b: Meeting): number =>
  new Date(getMeetingActivityTimestamp(b)).getTime() -
  new Date(getMeetingActivityTimestamp(a)).getTime();

const getParticipantDisplayName = (participant?: MeetingParticipant): string => {
  if (!participant) return "MatchIndeed member";
  return (
    participant.user_profile?.first_name ||
    participant.user?.display_name ||
    participant.user?.email?.split("@")[0] ||
    "MatchIndeed member"
  );
};

const getCancellationActorLabel = (
  meeting: Meeting,
  currentUserId: string | null
): string | null => {
  if (!meeting.canceled_by) return null;
  if (meeting.canceled_by === currentUserId) return "you";

  if (["host", "guest", "coordinator"].includes(meeting.canceled_by)) {
    const roleParticipant = meeting.participants?.find(
      (participant) => participant.role === meeting.canceled_by
    );

    if (roleParticipant) {
      return roleParticipant.user_id === currentUserId
        ? "you"
        : getParticipantDisplayName(roleParticipant);
    }
  }

  const cancelingParticipant = meeting.participants?.find(
    (participant) => participant.user_id === meeting.canceled_by
  );

  if (cancelingParticipant) {
    return getParticipantDisplayName(cancelingParticipant);
  }

  return "MatchIndeed team";
};

const isPastMeeting = (meeting: Meeting): boolean => {
  const scheduledAt = new Date(meeting.scheduled_at);
  const hasStarted = !Number.isNaN(scheduledAt.getTime()) && scheduledAt < new Date();

  return (
    meeting.status === "completed" ||
    meeting.status === "canceled" ||
    (meeting.status === "confirmed" && hasStarted)
  );
};

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(
    resolveMeetingTab(searchParams.get("tab"))
  );
  const [processing, setProcessing] = useState<string | null>(null);
  const [profilePreviewUserId, setProfilePreviewUserId] = useState<string | null>(null);

  // Cancellation modal
  const [cancelModal, setCancelModal] = useState<{
    isOpen: boolean;
    meetingId: string;
    isConfirmed: boolean;
    cancellationFeeCredits: number;
    creditRefunded: boolean;
  }>({
    isOpen: false,
    meetingId: "",
    isConfirmed: false,
    cancellationFeeCredits: 0,
    creditRefunded: false,
  });

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
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (sessionError || !user) {
          setLoading(false);
          return;
        }
        setUserId(user.id);
        const response = await fetch("/api/meetings", {
          headers: {
            Authorization: `Bearer ${user ? session?.access_token || "" : ""}`,
          },
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Failed to load appointments."
          );
        }

        const apiMeetings = Array.isArray(data?.meetings)
          ? (data.meetings as Meeting[])
          : [];

        setMeetings(
          apiMeetings.map((meeting) => ({
            ...meeting,
            canceled_at: meeting.canceled_at || null,
            completed_at: meeting.completed_at || null,
            finalized_at: meeting.finalized_at || meeting.completed_at || null,
          }))
        );
      } catch (error) {
        console.error("Error fetching meetings:", error);
        toast.error("We couldn't load your appointments right now. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchMeetings();
  }, [toast]);

  useEffect(() => {
    setActiveTab(resolveMeetingTab(searchParams.get("tab")));
  }, [searchParams]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);

    const params = new URLSearchParams(searchParams.toString());
    if (tab === "upcoming") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }

    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  };

  // ---------------------------------------------------------------
  // Filtered meetings
  // ---------------------------------------------------------------
  const filteredMeetings = meetings
    .filter((m) => {
      const now = new Date();
      const d = new Date(m.scheduled_at);
      switch (activeTab) {
        case "upcoming":
          return m.status === "confirmed" && d > now;
        case "pending":
          return m.status === "pending";
        case "past":
          return isPastMeeting(m);
        default:
          return true;
      }
    })
    .sort(compareMeetingsByRecentActivity);

  const counts = {
    upcoming: meetings.filter(
      (m) => m.status === "confirmed" && new Date(m.scheduled_at) > new Date()
    ).length,
    pending: meetings.filter((m) => m.status === "pending").length,
    past: meetings.filter((m) => isPastMeeting(m)).length,
    all: meetings.length,
  };

  // ---------------------------------------------------------------
  // Accept / Decline
  // ---------------------------------------------------------------
  const acceptMeeting = async (meetingId: string) => {
    if (!userId) return;
    setProcessing(meetingId);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please log in and try again.");
        return;
      }

      const response = await fetch("/api/meetings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meeting_id: meetingId, action: "accept" }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 402) {
          toast.errorActions(
            data.error || "Insufficient credits to accept this meeting.",
            [
              { label: "Buy Credits", href: BUY_CREDITS_HREF },
              { label: "Top Up Wallet", href: TOP_UP_WALLET_HREF },
            ]
          );
          return;
        }
        if (response.status === 403) {
          toast.error(data.message || "Your current subscription cannot accept this meeting.");
          return;
        }
        toast.error(data.error || "Failed to accept meeting. Please try again.");
        return;
      }

      const nextStatus =
        data.meeting_status === "confirmed" ? ("confirmed" as const) : ("pending" as const);

      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                status: nextStatus,
                workflow_state:
                  typeof data.workflow_state === "string"
                    ? data.workflow_state
                    : m.workflow_state || null,
                participants: m.participants?.map((p) =>
                  p.user_id === userId
                    ? { ...p, response: "accepted" as const, responded_at: new Date().toISOString() }
                    : p
                ),
              }
            : m
        )
      );

      toast.success(
        data.starter_trial_consumed
          ? "Meeting accepted. Your free starter slot is now used, and MatchIndeed admin will review this booking next."
          : data.requires_admin_approval
            ? "Meeting accepted. Waiting for admin approval before the Zoom meeting is created."
            : "Meeting request accepted!"
      );
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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please log in and try again.");
        return;
      }

      const response = await fetch("/api/meetings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meeting_id: meetingId, action: "decline" }),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Failed to decline meeting.");
        return;
      }

      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                status: "canceled" as const,
                workflow_state: "canceled",
                canceled_at: new Date().toISOString(),
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
  const openCancelModal = async (meeting: Meeting) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(
        `/api/meetings/cancel?meeting_id=${encodeURIComponent(meeting.id)}`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token || ""}`,
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.error || data.message || "Unable to load cancellation details.");
        return;
      }

      setCancelModal({
        isOpen: true,
        meetingId: meeting.id,
        isConfirmed: meeting.status === "confirmed",
        cancellationFeeCredits:
          data.cancellation_fee_credits || 0,
        creditRefunded: Boolean(data.fee_details?.credit_refund),
      });
    } catch {
      toast.error("Unable to load cancellation details.");
    }
  };

  const handleCanceled = (result: { cancellation_fee_applied: boolean; credit_refunded: boolean }) => {
    setCancelModal({
      isOpen: false,
      meetingId: "",
      isConfirmed: false,
      cancellationFeeCredits: 0,
      creditRefunded: false,
    });
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === cancelModal.meetingId
          ? {
              ...m,
              status: "canceled" as const,
              workflow_state: "canceled",
              canceled_by: userId,
              canceled_at: new Date().toISOString(),
            }
          : m
      )
    );
    toast.success(
      result.cancellation_fee_applied
        ? result.credit_refunded
          ? "Meeting canceled. Cancellation credits have been charged and the other participant has been refunded."
          : "Meeting canceled. Cancellation credits have been charged."
        : result.credit_refunded
          ? "Meeting canceled. The other participant has been refunded."
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
            <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={110} height={28} style={{ width: "auto", height: "auto" }} />
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
              <h1 className="flex items-center gap-2 text-[26px] font-bold leading-tight text-gray-900 sm:text-2xl">
                <Video className="h-6 w-6 text-[#1f419a] sm:h-7 sm:w-7" />
                My Appointments
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage your video dating meetings
              </p>
            </div>
            <Link
              href="/dashboard/calendar"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg sm:w-auto sm:rounded-xl sm:px-4 sm:py-2.5"
            >
              <Calendar className="h-4 w-4" />
              Set Availability
            </Link>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-1.5 sm:overflow-x-auto sm:pb-1">
            {(["upcoming", "pending", "past", "all"] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-colors sm:justify-center sm:gap-1.5 sm:rounded-lg sm:py-2 ${
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
                const needsResponse = myPart?.response === "requested";
                const otherParticipant =
                  meeting.participants?.find(
                    (participant) =>
                      participant.user_id !== userId && participant.role !== "coordinator"
                  ) ||
                  meeting.participants?.find((participant) => participant.user_id !== userId);
                const requesterName = getParticipantDisplayName(otherParticipant);
                const requesterTier = otherParticipant?.user?.tier
                  ? otherParticipant.user.tier.charAt(0).toUpperCase() +
                    otherParticipant.user.tier.slice(1)
                  : null;
                const canceledByLabel = getCancellationActorLabel(meeting, userId);
                const acceptedAt = getMeetingAcceptedAt(meeting);
                const canceledAt = getMeetingCanceledAt(meeting);
                const awaitingAdminApproval =
                  meeting.status === "pending" &&
                  Boolean(meeting.participants?.length) &&
                  meeting.participants?.every((participant) => participant.response === "accepted");
                const sc = statusConfig[meeting.status] || statusConfig.completed;

                return (
                  <div
                    key={meeting.id}
                    className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition-all ${
                      needsResponse ? "ring-amber-300 ring-[1.5px]" : "ring-black/5"
                    }`}
                  >
                    {/* Card body */}
                    <div className="p-3 sm:p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        {/* Left: info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2.5">
                            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1f419a] to-[#4463cf] shadow-sm">
                              <Video className="h-5 w-5 text-white" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-[15px] font-semibold leading-5 text-gray-900 sm:text-base">
                                  {meeting.type === "one_on_one" ? "1-on-1 Meeting" : "Video Meeting"}
                                </h4>
                                {/* Status badge */}
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${sc.bg} ${sc.text}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                  {awaitingAdminApproval
                                    ? "Awaiting Admin Approval"
                                    : meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)}
                                </span>
                                {isHost && (
                                  <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
                                    Host
                                  </span>
                                )}
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-500">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5" />
                                  {formatDate(meeting.scheduled_at)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {formatTime(meeting.scheduled_at)}
                                </span>
                                {meeting.location_pref && (
                                  <span className="truncate text-gray-400">{meeting.location_pref}</span>
                                )}
                                {meeting.status === "canceled" && canceledAt && (
                                  <span className="text-red-500">
                                    Canceled {formatStatusDateTime(canceledAt)}
                                  </span>
                                )}
                                {meeting.status !== "canceled" && acceptedAt && (
                                  <span className="text-green-600">
                                    Accepted {formatStatusDateTime(acceptedAt)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {needsResponse && otherParticipant && (
                            <div className="mt-2 rounded-2xl border border-[#1f419a]/10 bg-gradient-to-br from-[#1f419a]/[0.035] to-[#2a44a3]/[0.02] px-2.5 py-2 shadow-[0_8px_24px_rgba(31,65,154,0.05)] sm:p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                  <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1f419a]/10 ring-2 ring-white">
                                    {otherParticipant.user_profile?.profile_photo_url ? (
                                      <Image
                                        src={otherParticipant.user_profile.profile_photo_url}
                                        alt={requesterName}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                      />
                                    ) : (
                                      <User className="h-5 w-5 text-[#1f419a]" />
                                    )}
                                  </div>

                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold leading-5 text-gray-900">
                                      {requesterName}
                                    </p>
                                    <p className="text-[12px] leading-4 text-gray-500">
                                      Meeting request
                                      {requesterTier ? ` · ${requesterTier}` : ""}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setProfilePreviewUserId(otherParticipant.user_id)}
                                    aria-label="View requester profile"
                                    title="View Profile"
                                    className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-[#1f419a]/15 bg-white text-[#1f419a] shadow-sm transition-colors hover:bg-[#1f419a]/5"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => acceptMeeting(meeting.id)}
                                    disabled={processing === meeting.id}
                                    aria-label="Accept meeting request"
                                    title="Accept"
                                    className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-green-500 text-white shadow-sm transition-colors hover:bg-green-600 disabled:opacity-50"
                                  >
                                    {processing === meeting.id ? (
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Check className="h-4 w-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => declineMeeting(meeting.id)}
                                    disabled={processing === meeting.id}
                                    aria-label="Decline meeting request"
                                    title="Decline"
                                    className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-red-500 text-white shadow-sm transition-colors hover:bg-red-600 disabled:opacity-50"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {awaitingAdminApproval && (
                            <div className="mt-2.5 rounded-2xl border border-[#1f419a]/10 bg-[#1f419a]/[0.035] px-3 py-2.5">
                              <p className="text-[12px] font-medium leading-5 text-[#1f419a]">
                                Both parties accepted this meeting. MatchIndeed admin will approve it and create the Zoom link automatically.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Right: actions */}
                        <div className="flex w-full flex-row items-center gap-2 pt-0.5 sm:flex-row sm:flex-wrap lg:w-auto lg:min-w-0 lg:flex-row lg:items-center">

                          {meeting.status === "confirmed" &&
                            new Date(meeting.scheduled_at) > new Date() && (
                              <>
                                <Link
                                  href={`/dashboard/meetings/join?id=${meeting.id}`}
                                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:from-[#17357b] hover:to-[#2340a0] sm:flex-1 sm:rounded-xl sm:py-2.5 lg:w-auto lg:flex-none lg:min-w-[144px]"
                                >
                                  <Video className="h-3.5 w-3.5" />
                                  Join
                                </Link>
                                <button
                                  onClick={() => openCancelModal(meeting)}
                                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 sm:flex-1 sm:rounded-xl sm:py-2.5 lg:w-auto lg:flex-none lg:min-w-[144px]"
                                >
                                  <Ban className="h-3 w-3" />
                                  Cancel
                                </button>
                              </>
                            )}

                          {meeting.status === "pending" && !needsResponse && (
                            <button
                              onClick={() => openCancelModal(meeting)}
                              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 sm:w-auto sm:rounded-xl sm:py-2.5 lg:w-auto lg:min-w-[144px]"
                            >
                              <Ban className="h-3 w-3" />
                              Cancel
                            </button>
                          )}

                          {meeting.status === "completed" && !meeting.finalized_at && isHost && (
                            <Link
                              href={`/dashboard/meetings/${meeting.id}/conclude`}
                              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-600 sm:w-auto sm:rounded-xl sm:py-2.5"
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              Conclude
                            </Link>
                          )}

                          {meeting.status === "completed" && (
                            <Link
                              href={`/dashboard/meetings/${meeting.id}/response`}
                              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#1f419a] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#17357b] sm:w-auto sm:rounded-xl sm:py-2.5"
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
                      <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-2.5 sm:px-5 sm:py-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          {/* Participants */}
                          {meeting.participants && meeting.participants.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-gray-400">
                                Participants
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {meeting.participants.map((p, idx) => (
                                  <div key={idx} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 ring-1 ring-gray-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200">
                                      <User className="h-3 w-3 text-gray-500" />
                                    </div>
                                    <span className="text-[11px] font-medium text-gray-600">
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
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Charge status */}
                          {meeting.charge_status && meeting.charge_status !== "pending" && (
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
                          {meeting.status === "canceled" && canceledByLabel && (
                            <span className="text-[11px] text-red-400">
                              Canceled by {canceledByLabel}
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
          setCancelModal({
            isOpen: false,
            meetingId: "",
            isConfirmed: false,
            cancellationFeeCredits: 0,
            creditRefunded: false,
          })
        }
        meetingId={cancelModal.meetingId}
        isConfirmed={cancelModal.isConfirmed}
        cancellationFeeCredits={cancelModal.cancellationFeeCredits}
        creditRefunded={cancelModal.creditRefunded}
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

      <ProfileDetailModal
        userId={profilePreviewUserId}
        isOpen={Boolean(profilePreviewUserId)}
        onClose={() => setProfilePreviewUserId(null)}
      />
    </div>
  );
}
