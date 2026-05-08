"use client";

/**
 * AdminMeetingsPage - Meeting Management
 *
 * Features per client request:
 * - Verify if both users sent requests to each other
 * - Mark and verify user profiles
 * - Add coordinator name, date, IP address
 * - Handle meeting allocations (3+ people on same date)
 * - View meeting details and participants
 */

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import {
  Video,
  Search,
  UserCheck,
  Calendar,
  Clock,
  Loader2,
  RefreshCw,
  Eye,
  User,
  Users,
  Mail,
  CalendarClock,
  ExternalLink,
  FileText,
  LogIn,
  ChevronLeft,
  ChevronRight,
  Link2,
  AlertTriangle,
  XCircle,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import { adminPath } from "@/lib/admin/path";

const MEETINGS_PAGE_SIZE = 10;

type Meeting = {
  id: string;
  host_id: string;
  type: string;
  status: string;
  workflow_state: string | null;
  scheduled_at: string;
  location_pref: string | null;
  fee_cents: number;
  charge_status: string;
  video_link: string | null;
  zoom_meeting_id: string | null;
  video_link_is_fallback: boolean;
  created_at: string;
  host: {
    email: string;
    display_name: string | null;
  } | null;
  participants: {
    user_id: string;
    role: string;
    response: string | null;
    user: {
      email: string;
      display_name: string | null;
    } | null;
  }[];
  coordinator_feedback?: {
    id: string;
    coordinator_id: string | null;
    coordinator_name: string | null;
    status: "successful" | "not_successful" | null;
    status_label: string | null;
    note: string;
    joined_at: string | null;
    submitted_at: string | null;
    finalized: boolean;
  }[];
  chat_match?: {
    id: string;
    messaging_enabled: boolean;
    relationship_agreement_status: string | null;
  } | null;
};

type Coordinator = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  enabled: boolean;
};

const getMeetingUsers = (meeting: Meeting) =>
  meeting.participants.filter((participant) =>
    ["host", "guest"].includes(participant.role)
  );

const getAssignedCoordinator = (meeting: Meeting) =>
  meeting.participants.find((participant) => participant.role === "coordinator") ||
  null;

const formatFeedbackDate = (value: string | null) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getFeedbackTone = (status: "successful" | "not_successful" | null) => {
  if (status === "successful") return "bg-emerald-100 text-emerald-700";
  if (status === "not_successful") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
};

const hasCoordinatorOutcome = (
  meeting: Meeting,
  status: "successful" | "not_successful"
) =>
  Boolean(
    meeting.coordinator_feedback?.some((feedback) => feedback.status === status)
  );

const RESCHEDULABLE_MEETING_STATUSES = new Set(["pending", "confirmed"]);
const COORDINATOR_ASSIGNABLE_MEETING_STATUSES = new Set(["pending", "confirmed"]);

const isMeetingReschedulable = (meeting: Meeting | null) =>
  Boolean(meeting && RESCHEDULABLE_MEETING_STATUSES.has(meeting.status));

const isMeetingCoordinatorAssignable = (meeting: Meeting | null) =>
  Boolean(meeting && COORDINATOR_ASSIGNABLE_MEETING_STATUSES.has(meeting.status));

const shouldShowCoordinationSection = (meeting: Meeting | null) =>
  Boolean(meeting && meeting.status !== "canceled");

const isMeetingAwaitingApproval = (meeting: Meeting) =>
  meeting.status === "pending" &&
  getMeetingUsers(meeting).length >= 2 &&
  getMeetingUsers(meeting).every(
    (participant) => participant.response === "accepted"
  );

const getStatusTone = (meeting: Meeting) => {
  if (isMeetingAwaitingApproval(meeting)) return "bg-blue-100 text-blue-700";
  if (meeting.status === "completed") return "bg-green-100 text-green-700";
  if (meeting.status === "confirmed") return "bg-emerald-100 text-emerald-700";
  if (meeting.status === "declined" || meeting.status === "canceled") {
    return "bg-red-100 text-red-700";
  }
  if (meeting.status === "pending") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-700";
};

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function AdminMeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState("");
  const [assigningCoordinator, setAssigningCoordinator] = useState(false);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [savingReschedule, setSavingReschedule] = useState(false);
  const [generatingLinkId, setGeneratingLinkId] = useState<string | null>(null);
  const [approvingMeetingId, setApprovingMeetingId] = useState<string | null>(null);
  const [enablingChatMeetingId, setEnablingChatMeetingId] = useState<string | null>(null);
  const [disablingChatMeetingId, setDisablingChatMeetingId] = useState<string | null>(null);
  const [chatConfirmMeeting, setChatConfirmMeeting] = useState<Meeting | null>(null);
  const [chatConfirmAction, setChatConfirmAction] = useState<"enable" | "disable">("enable");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [cancelingMeeting, setCancelingMeeting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  const isAwaitingApproval = isMeetingAwaitingApproval;

  const getZoomStatus = (meeting: Meeting) => {
    if (meeting.status !== "confirmed") {
      return {
        label: "not ready",
        tone: "bg-gray-100 text-gray-600",
      };
    }

    if (meeting.video_link && meeting.zoom_meeting_id && !meeting.video_link_is_fallback) {
      return {
        label: "zoom ready",
        tone: "bg-emerald-100 text-emerald-700",
      };
    }

    return {
      label: "zoom missing",
      tone: "bg-red-100 text-red-700",
    };
  };

  const upcomingMeetings = meetings.filter(
    (meeting) =>
      ["pending", "confirmed"].includes(meeting.status) &&
      new Date(meeting.scheduled_at) > new Date()
  );
  const meetingsAwaitingApproval = meetings.filter(isAwaitingApproval);
  const meetingsNeedingReview = meetings.filter(
    (meeting) => meeting.charge_status === "pending_review"
  );

  /**
   * Fetch all meetings
   */
  const fetchMeetings = useCallback(async (): Promise<Meeting[]> => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to load meetings.");
        setMeetings([]);
        setCoordinators([]);
        return [];
      }

      const [response, coordinatorsResponse] = await Promise.all([
        fetch("/api/admin/meetings", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }),
        fetch("/api/admin/coordinators", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }),
      ]);

      const data = await response.json().catch(() => ({}));
      const coordinatorsData = await coordinatorsResponse.json().catch(() => ({}));

      if (!response.ok) {
        console.error("Error fetching meetings:", data);
        toast.error(data.error || "Failed to load admin meetings.");
        setMeetings([]);
        return [];
      }

      if (coordinatorsResponse.ok) {
        setCoordinators((coordinatorsData.coordinators || []) as Coordinator[]);
      } else {
        console.warn("Error fetching coordinators:", coordinatorsData);
        setCoordinators([]);
      }

      const fetchedMeetings = (data.meetings || []) as Meeting[];
      setMeetings(fetchedMeetings);
      return fetchedMeetings;
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load admin meetings.");
      setMeetings([]);
      setCoordinators([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchMeetings();
  }, [fetchMeetings]);

  useEffect(() => {
    if (!selectedMeeting) return;

    const latestMeeting = meetings.find(
      (meeting) => meeting.id === selectedMeeting.id
    );
    if (!latestMeeting) {
      setSelectedMeeting(null);
      setRescheduleValue("");
      return;
    }

    if (latestMeeting !== selectedMeeting) {
      setSelectedMeeting(latestMeeting);
    }
  }, [meetings, selectedMeeting]);

  useEffect(() => {
    if (!selectedMeeting) {
      setSelectedCoordinatorId("");
      setCancelDialogOpen(false);
      setCancelPassword("");
      setCancelReason("");
      setCancelConfirmed(false);
      setChatConfirmMeeting(null);
      setChatConfirmAction("enable");
      return;
    }

    const assignedCoordinator = getAssignedCoordinator(selectedMeeting);
    const linkedCoordinator = coordinators.find(
      (coordinator) => coordinator.user_id === assignedCoordinator?.user_id
    );
    setSelectedCoordinatorId(linkedCoordinator?.id || "");
  }, [coordinators, selectedMeeting]);

  /**
   * Check if both users sent requests to each other
   */
  const checkMutualRequests = async (userId1: string, userId2: string) => {
    const { data } = await supabase
      .from("meetings")
      .select("id, host_id")
      .or(
        `and(host_id.eq.${userId1},participants.user_id.eq.${userId2}),and(host_id.eq.${userId2},participants.user_id.eq.${userId1})`
      );

    return data && data.length >= 2;
  };

  const refreshSelectedMeeting = async (meetingId: string) => {
    const refreshed = await fetchMeetings();
    setSelectedMeeting(
      refreshed.find((meeting) => meeting.id === meetingId) || null
    );
  };

  const handleAssignCoordinator = async () => {
    if (!selectedMeeting) return;
    if (!isMeetingCoordinatorAssignable(selectedMeeting)) {
      toast.warning("Only pending or confirmed meetings can be assigned to a coordinator.");
      return;
    }
    if (!selectedCoordinatorId) {
      toast.warning("Choose a coordinator to assign.");
      return;
    }

    setAssigningCoordinator(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to assign a coordinator.");
        return;
      }

      const response = await fetch("/api/admin/meetings/coordinator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          meeting_id: selectedMeeting.id,
          coordinator_id: selectedCoordinatorId,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Failed to assign coordinator.");
        return;
      }

      toast.success("Coordinator assigned to this meeting.");
      await refreshSelectedMeeting(selectedMeeting.id);
    } catch (error) {
      console.error("Error assigning coordinator:", error);
      toast.error("Failed to assign coordinator.");
    } finally {
      setAssigningCoordinator(false);
    }
  };

  const handleUnassignCoordinator = async () => {
    if (!selectedMeeting) return;

    setAssigningCoordinator(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to remove this coordinator.");
        return;
      }

      const response = await fetch("/api/admin/meetings/coordinator", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meeting_id: selectedMeeting.id }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Failed to remove coordinator.");
        return;
      }

      setSelectedCoordinatorId("");
      toast.success("Coordinator removed from this meeting.");
      await refreshSelectedMeeting(selectedMeeting.id);
    } catch (error) {
      console.error("Error removing coordinator:", error);
      toast.error("Failed to remove coordinator.");
    } finally {
      setAssigningCoordinator(false);
    }
  };

  const handleNotifyMeetingParticipants = (meeting: Meeting) => {
    const meetingUsers = getMeetingUsers(meeting);
    const recipients = Array.from(
      new Set(
        [
          meeting.host?.email,
          ...meetingUsers.map((participant) => participant.user?.email),
        ].filter(Boolean)
      )
    ) as string[];

    if (recipients.length === 0) {
      toast.error("No participant email addresses found for this meeting.");
      return;
    }

    const meetingDate = new Date(meeting.scheduled_at);
    const subject = encodeURIComponent("Matchindeed meeting update");
    const body = encodeURIComponent(
      `Hello,\n\nThis is an admin update regarding your Matchindeed meeting scheduled for ${meetingDate.toLocaleDateString()} at ${meetingDate.toLocaleTimeString()}.\n\nPlease log in to your Matchindeed dashboard to review the latest details.\n\nMatchindeed Admin`
    );
    window.location.href = `mailto:${recipients.join(",")}?subject=${subject}&body=${body}`;
    toast.info(`Opening your email app for ${recipients.length} participant(s).`);
  };

  const openEnableChatDialog = (meeting: Meeting) => {
    const meetingUsers = getMeetingUsers(meeting);
    if (meetingUsers.length !== 2) {
      toast.error("Chat can only be enabled when a meeting has exactly two users.");
      return;
    }

    if (meeting.chat_match?.messaging_enabled) {
      setChatConfirmAction("disable");
      setChatConfirmMeeting(meeting);
      return;
    }

    if (["canceled", "cancelled", "declined"].includes(meeting.status)) {
      toast.error("Chat cannot be enabled for a canceled or declined meeting.");
      return;
    }

    if (!hasCoordinatorOutcome(meeting, "successful")) {
      toast.warning(
        "Chat can only be enabled after a coordinator report is marked Successful."
      );
      return;
    }

    setChatConfirmAction("enable");
    setChatConfirmMeeting(meeting);
  };

  const handleEnableChat = async (meeting: Meeting) => {
    setEnablingChatMeetingId(meeting.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to enable chat.");
        return;
      }

      const response = await fetch("/api/admin/meetings/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meeting_id: meeting.id }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || data.message || "Failed to enable chat.");
        return;
      }

      toast.success(data.message || "Chat enabled for this match.");
      setChatConfirmMeeting(null);
      await refreshSelectedMeeting(meeting.id);
    } catch (error) {
      console.error("Error enabling chat:", error);
      toast.error("Failed to enable chat.");
    } finally {
      setEnablingChatMeetingId(null);
    }
  };

  const handleDisableChat = async (meeting: Meeting) => {
    setDisablingChatMeetingId(meeting.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to disable chat.");
        return;
      }

      const response = await fetch("/api/admin/meetings/chat", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meeting_id: meeting.id }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || data.message || "Failed to disable chat.");
        return;
      }

      toast.success(data.message || "Chat disabled for this match.");
      setChatConfirmMeeting(null);
      await refreshSelectedMeeting(meeting.id);
    } catch (error) {
      console.error("Error disabling chat:", error);
      toast.error("Failed to disable chat.");
    } finally {
      setDisablingChatMeetingId(null);
    }
  };

  const handleApproveMeeting = async (meetingId: string) => {
    setApprovingMeetingId(meetingId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to approve this meeting.");
        return;
      }

      const response = await fetch("/api/admin/meetings/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meeting_id: meetingId }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || data.message || "Failed to approve meeting.");
        return;
      }

      toast.success(
        data.already_confirmed
          ? "Meeting was already approved."
          : "Meeting approved. Zoom link created automatically."
      );

      if (selectedMeeting?.id === meetingId) {
        setSelectedMeeting((current) =>
          current
            ? {
                ...current,
                status: "confirmed",
                workflow_state: "confirmed",
              }
            : current
        );
      }

      await fetchMeetings();
    } catch (error) {
      console.error("Error approving meeting:", error);
      toast.error("Failed to approve meeting.");
    } finally {
      setApprovingMeetingId(null);
    }
  };

  const handleJoinMeeting = async (meetingId: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to join this meeting.");
        return;
      }

      const response = await fetch(`/api/meetings/video-link?meeting_id=${meetingId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.error || data.message || "Unable to open meeting link.");
        return;
      }

      if (!data.video_link) {
        toast.error("Meeting link is not ready yet.");
        return;
      }

      window.open(data.video_link as string, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Error joining meeting:", error);
      toast.error("Unable to open meeting link.");
    }
  };

  const handleRegenerateMeetingLink = async (meetingId: string) => {
    setGeneratingLinkId(meetingId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to generate the meeting link.");
        return;
      }

      const response = await fetch("/api/meetings/video-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meeting_id: meetingId }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(
          data.error || data.message || "Failed to generate Zoom meeting link."
        );
        return;
      }

      toast.success("Zoom meeting link is ready.");
      if (selectedMeeting?.id === meetingId) {
        setSelectedMeeting((current) =>
          current
            ? {
                ...current,
                video_link: data.video_link || current.video_link,
                zoom_meeting_id:
                  data.zoom_meeting_id?.toString() ||
                  current.zoom_meeting_id,
                video_link_is_fallback: Boolean(data.is_fallback),
              }
            : current
        );
      }
      await refreshSelectedMeeting(meetingId);
    } catch (error) {
      console.error("Error generating meeting link:", error);
      toast.error("Failed to generate Zoom meeting link.");
    } finally {
      setGeneratingLinkId(null);
    }
  };

  const handleRescheduleMeeting = async () => {
    if (!selectedMeeting || !rescheduleValue) {
      toast.warning("Select a new date and time first.");
      return;
    }

    if (savingReschedule) return;

    if (!isMeetingReschedulable(selectedMeeting)) {
      toast.warning(
        `Only pending or confirmed meetings can be rescheduled. This meeting is ${selectedMeeting.status}.`
      );
      return;
    }

    setSavingReschedule(true);
    try {
      const scheduledAt = new Date(rescheduleValue);
      if (Number.isNaN(scheduledAt.getTime())) {
        toast.error("Invalid reschedule date.");
        return;
      }

      if (scheduledAt <= new Date()) {
        toast.error("Choose a future meeting time.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to reschedule this meeting.");
        return;
      }

      const response = await fetch("/api/admin/meetings/reschedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          meeting_id: selectedMeeting.id,
          scheduled_at: scheduledAt.toISOString(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || "Failed to reschedule meeting.");
        return;
      }

      const updatedMeeting = data.meeting || {};
      setSelectedMeeting({
        ...selectedMeeting,
        scheduled_at: updatedMeeting.scheduled_at || scheduledAt.toISOString(),
        video_link: updatedMeeting.video_link || null,
        zoom_meeting_id: updatedMeeting.zoom_meeting_id || null,
        video_link_is_fallback: Boolean(updatedMeeting.video_link_is_fallback),
      });
      setRescheduleValue("");
      toast.success(
        selectedMeeting.status === "confirmed"
          ? "Meeting rescheduled and Zoom link refreshed."
          : "Meeting rescheduled successfully."
      );
      await refreshSelectedMeeting(selectedMeeting.id);
    } catch (error) {
      console.error("Error rescheduling meeting:", error);
      toast.error("Failed to reschedule meeting.");
    } finally {
      setSavingReschedule(false);
    }
  };

  const openCancelDialog = () => {
    setCancelPassword("");
    setCancelReason("");
    setCancelConfirmed(false);
    setCancelDialogOpen(true);
  };

  const closeCancelDialog = () => {
    if (cancelingMeeting) return;
    setCancelDialogOpen(false);
    setCancelPassword("");
    setCancelReason("");
    setCancelConfirmed(false);
  };

  const handleAdminCancelMeeting = async () => {
    if (!selectedMeeting) return;

    if (!["pending", "confirmed"].includes(selectedMeeting.status)) {
      toast.warning("Only pending or confirmed meetings can be canceled by admin.");
      return;
    }

    if (!cancelConfirmed) {
      toast.warning("Please confirm that you want to cancel this meeting.");
      return;
    }

    if (!cancelPassword) {
      toast.warning("Enter your admin password to confirm cancellation.");
      return;
    }

    if (!cancelReason.trim()) {
      toast.warning("Enter a cancellation reason for the users and coordinator.");
      return;
    }

    setCancelingMeeting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to cancel this meeting.");
        return;
      }

      const response = await fetch("/api/admin/meetings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          meeting_id: selectedMeeting.id,
          password: cancelPassword,
          reason: cancelReason.trim(),
          confirm: cancelConfirmed,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || data.message || "Failed to cancel meeting.");
        return;
      }

      toast.success("Meeting canceled successfully.");
      setCancelDialogOpen(false);
      setCancelPassword("");
      setCancelReason("");
      setCancelConfirmed(false);
      await refreshSelectedMeeting(selectedMeeting.id);
    } catch (error) {
      console.error("Error canceling meeting:", error);
      toast.error("Failed to cancel meeting.");
    } finally {
      setCancelingMeeting(false);
    }
  };

  const filteredMeetings = meetings.filter((meeting) => {
    if (statusFilter === "awaiting_approval") {
      if (!isAwaitingApproval(meeting)) return false;
    } else if (statusFilter === "coordinator_successful") {
      if (!hasCoordinatorOutcome(meeting, "successful")) return false;
    } else if (statusFilter === "coordinator_unsuccessful") {
      if (!hasCoordinatorOutcome(meeting, "not_successful")) return false;
    } else if (statusFilter !== "all" && meeting.status !== statusFilter) {
      return false;
    }
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      meeting.host?.email?.toLowerCase().includes(query) ||
      meeting.host?.display_name?.toLowerCase().includes(query) ||
      meeting.participants.some(
        (p) =>
          p.user?.email?.toLowerCase().includes(query) ||
          p.user?.display_name?.toLowerCase().includes(query)
      )
    );
  });

  const totalMeetingPages = Math.max(
    1,
    Math.ceil(filteredMeetings.length / MEETINGS_PAGE_SIZE)
  );
  const currentMeetingPage = Math.min(currentPage, totalMeetingPages);
  const meetingPageStart = (currentMeetingPage - 1) * MEETINGS_PAGE_SIZE;
  const paginatedMeetings = filteredMeetings.slice(
    meetingPageStart,
    meetingPageStart + MEETINGS_PAGE_SIZE
  );
  const meetingPageEnd = meetingPageStart + paginatedMeetings.length;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalMeetingPages));
  }, [totalMeetingPages]);

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meeting Management</h1>
          <p className="text-gray-500">Manage meetings, verify requests, assign coordinators</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={adminPath("/post-meetings")}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="h-4 w-4" />
            Post-Meeting Review
          </Link>
          <button
            onClick={() => fetchMeetings()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Total Meetings</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{meetings.length}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Upcoming Active</p>
          <p className="mt-2 text-2xl font-bold text-[#1f419a]">{upcomingMeetings.length}</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 shadow-sm">
          <p className="text-sm text-blue-700">Awaiting Approval</p>
          <p className="mt-2 text-2xl font-bold text-blue-900">{meetingsAwaitingApproval.length}</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4 shadow-sm">
          <p className="text-sm text-amber-700">Needs Payment Review</p>
          <p className="mt-2 text-2xl font-bold text-amber-900">{meetingsNeedingReview.length}</p>
        </div>
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
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="awaiting_approval">Awaiting Approval</option>
              <option value="confirmed">Confirmed</option>
              <option value="coordinator_successful">Coordinator Successful</option>
              <option value="coordinator_unsuccessful">Coordinator Unsuccessful</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Meetings List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="text-center py-12">
            <Video className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No meetings found</p>
          </div>
        ) : (
          <>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1040px]">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-100 shadow-sm">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Meeting
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Host
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Participants
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Scheduled
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedMeetings.map((meeting) => {
                  const meetingUsers = getMeetingUsers(meeting);
                  const assignedCoordinator = getAssignedCoordinator(meeting);
                  return (
                  <tr key={meeting.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">
                          {meeting.type === "one_on_one" ? "1-on-1" : "Group"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {meeting.host?.display_name || "Unknown"}
                          </p>
                          <p className="text-xs text-gray-500">{meeting.host?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-700">{meetingUsers.length}</span>
                        </div>
                        {assignedCoordinator && (
                          <p className="text-xs text-[#1f419a]">
                            Coord:{" "}
                            {assignedCoordinator.user?.display_name ||
                              assignedCoordinator.user?.email ||
                              "Assigned"}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Calendar className="h-4 w-4" />
                        {new Date(meeting.scheduled_at).toLocaleDateString()}
                        <Clock className="h-4 w-4 ml-2" />
                        {new Date(meeting.scheduled_at).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                        {(() => {
                        const awaitingApproval = isAwaitingApproval(meeting);
                        const zoomStatus = getZoomStatus(meeting);
                        return (
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusTone(meeting)}`}
                        >
                          {awaitingApproval ? "awaiting approval" : meeting.status}
                        </span>
                        {meeting.status === "confirmed" && (
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${zoomStatus.tone}`}
                          >
                            {zoomStatus.label}
                          </span>
                        )}
                      </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isAwaitingApproval(meeting) && (
                          <button
                            onClick={() => void handleApproveMeeting(meeting.id)}
                            disabled={approvingMeetingId === meeting.id}
                            className="inline-flex items-center gap-2 rounded-lg bg-[#1f419a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#17357b] disabled:opacity-60"
                            title="Approve meeting and create Zoom link"
                          >
                            {approvingMeetingId === meeting.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <UserCheck className="h-4 w-4" />
                            )}
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedMeeting(meeting)}
                          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleNotifyMeetingParticipants(meeting)}
                          className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600"
                          title="Notify participants"
                        >
                          <Mail className="h-4 w-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (meetingUsers.length > 0) {
                              const mutual = await checkMutualRequests(
                                meeting.host_id,
                                meetingUsers[0].user_id
                              );
                              toast.info(
                                mutual ? "Both users sent requests ✓" : "No mutual requests"
                              );
                            }
                          }}
                          className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"
                          title="Check Mutual Requests"
                        >
                          <UserCheck className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalMeetingPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                Showing {meetingPageStart + 1} to {meetingPageEnd} of{" "}
                {filteredMeetings.length} meetings
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.max(1, currentMeetingPage - 1))}
                  disabled={currentMeetingPage === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <label className="sr-only" htmlFor="meeting-page-select">
                  Select meeting page
                </label>
                <select
                  id="meeting-page-select"
                  value={currentMeetingPage}
                  onChange={(event) => setCurrentPage(Number(event.target.value))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20"
                >
                  {Array.from({ length: totalMeetingPages }, (_, index) => {
                    const pageNumber = index + 1;
                    return (
                      <option key={pageNumber} value={pageNumber}>
                        Page {pageNumber} of {totalMeetingPages}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage(Math.min(totalMeetingPages, currentMeetingPage + 1))
                  }
                  disabled={currentMeetingPage === totalMeetingPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Meeting Detail Modal */}
      {selectedMeeting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Meeting Details</h3>
              <button
                onClick={() => setSelectedMeeting(null)}
                className="p-1 rounded hover:bg-gray-100"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Host</label>
                  <p className="text-sm font-medium">{selectedMeeting.host?.display_name}</p>
                  <p className="text-xs text-gray-500">{selectedMeeting.host?.email}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusTone(selectedMeeting)}`}
                    >
                      {isAwaitingApproval(selectedMeeting)
                        ? "awaiting approval"
                        : selectedMeeting.status}
                    </span>
                    {selectedMeeting.status === "confirmed" && (
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getZoomStatus(selectedMeeting).tone}`}
                      >
                        {getZoomStatus(selectedMeeting).label}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {selectedMeeting.status === "confirmed" && (
                <div
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    getZoomStatus(selectedMeeting).label === "zoom ready"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {getZoomStatus(selectedMeeting).label === "zoom ready"
                    ? "Live Zoom link created successfully. Users can join from their appointments when the meeting window opens."
                    : "This meeting is confirmed, but the live Zoom link is missing. Use the review tools or regenerate the meeting link before the meeting starts."}
                </div>
              )}

              {isAwaitingApproval(selectedMeeting) && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Both participants have accepted this meeting. Admin approval is required before MatchIndeed confirms it and creates the Zoom meeting link.
                </div>
              )}

              <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:gap-3">
                {isAwaitingApproval(selectedMeeting) && (
                  <button
                    type="button"
                    onClick={() => void handleApproveMeeting(selectedMeeting.id)}
                    disabled={approvingMeetingId === selectedMeeting.id}
                    className="inline-flex min-w-fit flex-none items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#1f419a] bg-[#1f419a] px-4 py-3 text-sm font-medium text-white hover:bg-[#17357b] disabled:opacity-60"
                  >
                    {approvingMeetingId === selectedMeeting.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                    Approve & Create Zoom Link
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleNotifyMeetingParticipants(selectedMeeting)}
                  className="inline-flex min-w-fit flex-none items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  <Mail className="h-4 w-4" />
                  Notify Users
                </button>
                <button
                  type="button"
                  onClick={() => openEnableChatDialog(selectedMeeting)}
                  disabled={
                    enablingChatMeetingId === selectedMeeting.id ||
                    disablingChatMeetingId === selectedMeeting.id ||
                    getMeetingUsers(selectedMeeting).length !== 2 ||
                    (!selectedMeeting.chat_match?.messaging_enabled &&
                      (["canceled", "cancelled", "declined"].includes(
                        selectedMeeting.status
                      ) ||
                        !hasCoordinatorOutcome(selectedMeeting, "successful")))
                  }
                  className={`inline-flex min-w-fit flex-none items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                    selectedMeeting.chat_match?.messaging_enabled
                      ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                  }`}
                >
                  {enablingChatMeetingId === selectedMeeting.id ||
                  disablingChatMeetingId === selectedMeeting.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageCircle className="h-4 w-4" />
                  )}
                  {selectedMeeting.chat_match?.messaging_enabled
                    ? disablingChatMeetingId === selectedMeeting.id
                      ? "Disabling..."
                      : "Disable Chat"
                    : !hasCoordinatorOutcome(selectedMeeting, "successful")
                      ? "Requires Successful Report"
                      : enablingChatMeetingId === selectedMeeting.id
                        ? "Enabling..."
                        : "Enable Chat"}
                </button>
                {selectedMeeting.status === "confirmed" && (
                  <button
                    type="button"
                    onClick={() => void handleJoinMeeting(selectedMeeting.id)}
                    className="inline-flex min-w-fit flex-none items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#1f419a] bg-[#1f419a] px-4 py-3 text-sm font-medium text-white hover:bg-[#17357b]"
                  >
                    <LogIn className="h-4 w-4" />
                    Join Meeting
                  </button>
                )}
                {selectedMeeting.status === "confirmed" && (
                  <button
                    type="button"
                    onClick={() =>
                      void handleRegenerateMeetingLink(selectedMeeting.id)
                    }
                    disabled={generatingLinkId === selectedMeeting.id}
                    className="inline-flex min-w-fit flex-none items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-800 hover:bg-cyan-100 disabled:opacity-60"
                  >
                    {generatingLinkId === selectedMeeting.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    {selectedMeeting.video_link
                      ? "Regenerate Zoom Link"
                      : "Generate Zoom Link"}
                  </button>
                )}
                {["pending", "confirmed"].includes(selectedMeeting.status) && (
                  <button
                    type="button"
                    onClick={openCancelDialog}
                    className="inline-flex min-w-fit flex-none items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel Meeting
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setRescheduleValue(
                      toDateTimeLocalValue(selectedMeeting.scheduled_at)
                    )
                  }
                  disabled={!isMeetingReschedulable(selectedMeeting)}
                  className="inline-flex min-w-fit flex-none items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CalendarClock className="h-4 w-4" />
                  Prepare Reschedule
                </button>
                <Link
                  href={adminPath("/post-meetings")}
                  className="inline-flex min-w-fit flex-none items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 hover:bg-amber-100"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Review Tools
                </Link>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Participants</label>
                <div className="space-y-2">
                  {getMeetingUsers(selectedMeeting).map((p) => (
                    <div key={p.user_id} className="p-2 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium">{p.user?.display_name || "Unknown"}</p>
                      <p className="text-xs text-gray-500">
                        {p.role} · {p.user?.email}
                      </p>
                      {p.response && (
                        <span
                          className={`inline-flex mt-1 px-2 py-0.5 rounded text-xs ${
                            p.response === "accepted"
                              ? "bg-green-100 text-green-700"
                              : p.response === "declined"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {p.response}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Reschedule Meeting
                </label>
                {!isMeetingReschedulable(selectedMeeting) && (
                  <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    This meeting is {selectedMeeting.status} and can no longer be rescheduled.
                  </div>
                )}
                <div className="space-y-2">
                  <input
                    type="datetime-local"
                    value={rescheduleValue}
                    onChange={(e) => setRescheduleValue(e.target.value)}
                    disabled={!isMeetingReschedulable(selectedMeeting)}
                    min={toDateTimeLocalValue(new Date().toISOString())}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#1f419a]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleRescheduleMeeting()}
                    disabled={
                      savingReschedule ||
                      !isMeetingReschedulable(selectedMeeting) ||
                      !rescheduleValue
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f419a] py-2 text-sm font-medium text-white hover:bg-[#17357b] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingReschedule ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CalendarClock className="h-4 w-4" />
                        Save New Meeting Time
                      </>
                    )}
                  </button>
                </div>
              </div>

              {shouldShowCoordinationSection(selectedMeeting) && (() => {
                const assignedCoordinator = getAssignedCoordinator(selectedMeeting);
                const assignedCoordinatorRecord = coordinators.find(
                  (coordinator) => coordinator.user_id === assignedCoordinator?.user_id
                );
                const enabledCoordinators = coordinators.filter(
                  (coordinator) => coordinator.enabled && coordinator.user_id
                );
                const canAssignCoordinator =
                  isMeetingCoordinatorAssignable(selectedMeeting);
                const isSameAssignedCoordinator =
                  Boolean(assignedCoordinatorRecord?.id) &&
                  selectedCoordinatorId === assignedCoordinatorRecord?.id;

                return (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-blue-700">
                      Assigned Coordinator
                    </label>
                    {assignedCoordinator ? (
                      <div className="mt-2 rounded-lg bg-white px-3 py-2 text-sm">
                        <p className="font-medium text-gray-900">
                          {assignedCoordinator.user?.display_name ||
                            assignedCoordinatorRecord?.name ||
                            "Coordinator"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {assignedCoordinator.user?.email ||
                            assignedCoordinatorRecord?.email ||
                            "Linked coordinator account"}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-blue-800">
                        No coordinator is currently assigned to this meeting.
                      </p>
                    )}

                    <div className="mt-3 space-y-2">
                      <select
                        value={selectedCoordinatorId}
                        onChange={(event) =>
                          setSelectedCoordinatorId(event.target.value)
                        }
                        disabled={!canAssignCoordinator}
                        className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm outline-none focus:border-[#1f419a]"
                      >
                        <option value="">Select coordinator</option>
                        {enabledCoordinators.map((coordinator) => (
                          <option key={coordinator.id} value={coordinator.id}>
                            {coordinator.name} · {coordinator.email}
                          </option>
                        ))}
                      </select>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => void handleAssignCoordinator()}
                          disabled={
                            assigningCoordinator ||
                            !canAssignCoordinator ||
                            !selectedCoordinatorId ||
                            isSameAssignedCoordinator
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1f419a] px-3 py-2 text-sm font-medium text-white hover:bg-[#17357b] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {assigningCoordinator ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserCheck className="h-4 w-4" />
                          )}
                          Assign Coordinator
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleUnassignCoordinator()}
                          disabled={assigningCoordinator || !assignedCoordinator}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Remove Assignment
                        </button>
                      </div>

                      {!canAssignCoordinator ? (
                        <p className="text-xs text-blue-700">
                          Only pending or confirmed meetings can be assigned to a coordinator.
                        </p>
                      ) : enabledCoordinators.length === 0 && (
                        <p className="text-xs text-blue-700">
                          Add an enabled coordinator from Hosts/Coordinators first.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {shouldShowCoordinationSection(selectedMeeting) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <FileText className="h-4 w-4 text-[#1f419a]" />
                    Coordinator Feedback
                  </label>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                    {selectedMeeting.coordinator_feedback?.length || 0} report
                    {(selectedMeeting.coordinator_feedback?.length || 0) === 1
                      ? ""
                      : "s"}
                  </span>
                </div>

                {selectedMeeting.coordinator_feedback?.length ? (
                  <div className="space-y-3">
                    {selectedMeeting.coordinator_feedback.map((feedback) => (
                      <div
                        key={feedback.id}
                        className="rounded-lg border border-white bg-white p-3 text-sm shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {feedback.coordinator_name || "Coordinator"}
                            </p>
                            <p className="text-xs text-slate-500">
                              Joined: {formatFeedbackDate(feedback.joined_at)}
                              {feedback.submitted_at
                                ? ` · Submitted: ${formatFeedbackDate(
                                    feedback.submitted_at
                                  )}`
                                : ""}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getFeedbackTone(
                              feedback.status
                            )}`}
                          >
                            {feedback.status_label || "Awaiting feedback"}
                          </span>
                        </div>
                        {feedback.note ? (
                          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                            {feedback.note}
                          </p>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">
                            No coordinator report note submitted yet.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    No coordinator feedback has been submitted for this meeting yet.
                  </p>
                )}
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {chatConfirmMeeting && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-violet-100 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-12 w-12 flex-none items-center justify-center rounded-2xl ring-4 ${
                  chatConfirmAction === "disable"
                    ? "bg-red-50 text-red-700 ring-red-100"
                    : "bg-violet-50 text-violet-700 ring-violet-100"
                }`}
              >
                <MessageCircle className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-gray-950">
                  {chatConfirmAction === "disable"
                    ? "Disable chat for this match?"
                    : "Enable chat for this match?"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  {chatConfirmAction === "disable"
                    ? "This will stop both users from sending new messages in this conversation. Existing messages will remain stored."
                    : "This will create a private conversation between both users and make it available in their Messages area."}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Participants
              </p>
              <div className="mt-2 space-y-2">
                {getMeetingUsers(chatConfirmMeeting).map((participant) => (
                  <div
                    key={participant.user_id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">
                        {participant.user?.display_name || "Unknown user"}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {participant.user?.email || "No email on file"}
                      </p>
                    </div>
                    <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-semibold capitalize text-violet-700">
                      {participant.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
                chatConfirmAction === "disable"
                  ? "border-red-100 bg-red-50 text-red-800"
                  : "border-amber-100 bg-amber-50 text-amber-800"
              }`}
            >
              {chatConfirmAction === "disable"
                ? "Users will no longer see this match in their active message conversations."
                : "Only enable chat after a coordinator report confirms this meeting was Successful."}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setChatConfirmMeeting(null)}
                disabled={
                  enablingChatMeetingId === chatConfirmMeeting.id ||
                  disablingChatMeetingId === chatConfirmMeeting.id
                }
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {chatConfirmAction === "disable" ? "Keep Enabled" : "Keep Disabled"}
              </button>
              <button
                type="button"
                onClick={() =>
                  chatConfirmAction === "disable"
                    ? void handleDisableChat(chatConfirmMeeting)
                    : void handleEnableChat(chatConfirmMeeting)
                }
                disabled={
                  enablingChatMeetingId === chatConfirmMeeting.id ||
                  disablingChatMeetingId === chatConfirmMeeting.id
                }
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                  chatConfirmAction === "disable"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-[#1f419a] hover:bg-[#17357b]"
                }`}
              >
                {enablingChatMeetingId === chatConfirmMeeting.id ||
                disablingChatMeetingId === chatConfirmMeeting.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {chatConfirmAction === "disable"
                      ? "Disabling..."
                      : "Enabling..."}
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-4 w-4" />
                    {chatConfirmAction === "disable"
                      ? "Disable Chat"
                      : "Enable Chat"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMeeting && cancelDialogOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-red-50 ring-4 ring-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-gray-900">
                  Cancel this meeting?
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  This will cancel the approved meeting, remove the live meeting
                  link, notify participants, and refund the booking value where
                  applicable.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
              Are you sure you want to cancel this meeting?
            </div>

            <div className="mt-5 space-y-4">
              <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={cancelConfirmed}
                  onChange={(event) => setCancelConfirmed(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-[#1f419a] focus:ring-[#1f419a]"
                />
                <span>
                  Yes, I understand this meeting will be canceled for all
                  participants.
                </span>
              </label>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Admin password
                </label>
                <input
                  type="password"
                  value={cancelPassword}
                  onChange={(event) => setCancelPassword(event.target.value)}
                  placeholder="Enter your admin password"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#1f419a]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Reason for users and coordinator
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  placeholder="Explain why this meeting is being canceled"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-[#1f419a]"
                />
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={closeCancelDialog}
                disabled={cancelingMeeting}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Keep Meeting
              </button>
              <button
                type="button"
                onClick={() => void handleAdminCancelMeeting()}
                disabled={
                  cancelingMeeting ||
                  !cancelConfirmed ||
                  !cancelPassword ||
                  !cancelReason.trim()
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelingMeeting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Canceling...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    Confirm Cancel Meeting
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
