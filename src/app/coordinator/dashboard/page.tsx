"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  Video,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ToastProvider";
import { coordinatorLoginUrl } from "@/lib/coordinator/path";
import {
  getCoordinatorFeedbackStatusLabel,
  type CoordinatorFeedbackStatus,
} from "@/lib/coordinator-feedback";

type CoordinatorMeetingFeedback = {
  id: string;
  coordinator_id: string | null;
  coordinator_name: string | null;
  status: CoordinatorFeedbackStatus | null;
  status_label: string | null;
  note: string;
  joined_at: string | null;
  submitted_at: string | null;
  finalized: boolean;
};

type CoordinatorMeeting = {
  id: string;
  type: string;
  status: string;
  workflow_state: string | null;
  scheduled_at: string;
  video_link_ready: boolean;
  can_join: boolean;
  feedback: CoordinatorMeetingFeedback | null;
  participants: Array<{
    user_id: string;
    role: string;
    response: string | null;
    display_name: string;
  }>;
};

type CoordinatorProfile = {
  name?: string | null;
  email?: string | null;
};

type MeetingView = "assigned" | "upcoming" | "joinable";
type MeetingFilter = "all" | "successful" | "not_successful" | "upcoming" | "passed";
const COORDINATOR_VIEW_CHANGE_EVENT = "coordinator-meeting-view-change";
const COORDINATOR_JOIN_EARLY_MINUTES = 10;
const COORDINATOR_JOIN_DURATION_MINUTES = 30;
const MEETINGS_PER_PAGE = 4;

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";

  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case "confirmed":
      return "bg-emerald-100 text-emerald-700";
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "completed":
      return "bg-blue-100 text-blue-700";
    case "canceled":
    case "cancelled":
    case "declined":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function isUpcomingMeeting(meeting: CoordinatorMeeting) {
  return (
    ["pending", "confirmed"].includes(meeting.status) &&
    new Date(meeting.scheduled_at).getTime() >= Date.now()
  );
}

function isPassedMeeting(meeting: CoordinatorMeeting) {
  const scheduledTime = new Date(meeting.scheduled_at).getTime();
  return (
    !Number.isNaN(scheduledTime) &&
    scheduledTime + COORDINATOR_JOIN_DURATION_MINUTES * 60 * 1000 < Date.now()
  );
}

function matchesMeetingFilter(meeting: CoordinatorMeeting, filter: MeetingFilter) {
  switch (filter) {
    case "successful":
      return meeting.feedback?.status === "successful";
    case "not_successful":
      return meeting.feedback?.status === "not_successful";
    case "upcoming":
      return isUpcomingMeeting(meeting);
    case "passed":
      return isPassedMeeting(meeting);
    default:
      return true;
  }
}

function getMeetingViewFromSearch(search: string): MeetingView {
  switch (new URLSearchParams(search).get("view")) {
    case "upcoming":
      return "upcoming";
    case "joinable":
      return "joinable";
    default:
      return "assigned";
  }
}

function getJoinButtonLabel(meeting: CoordinatorMeeting) {
  if (meeting.can_join) return "Acknowledge & Join";
  if (isPassedMeeting(meeting)) return "Meeting Passed";
  if (meeting.status === "confirmed" && !meeting.video_link_ready) {
    return "Link not ready";
  }
  if (meeting.status === "confirmed") return "Opens 10 min before";
  return "Not approved yet";
}

function getJoinWindowLabel(meeting: CoordinatorMeeting) {
  if (meeting.can_join) return "Join window is open";
  if (isPassedMeeting(meeting)) return "Meeting window ended";
  if (meeting.status === "confirmed") return "Join opens 10 min before start";
  return "Join opens after approval";
}

function getFeedbackBadgeTone(status: CoordinatorFeedbackStatus | null) {
  if (status === "successful") return "bg-emerald-100 text-emerald-700";
  if (status === "not_successful") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

export default function CoordinatorDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [coordinator, setCoordinator] = useState<CoordinatorProfile | null>(null);
  const [meetings, setMeetings] = useState<CoordinatorMeeting[]>([]);
  const [meetingView, setMeetingView] = useState<MeetingView>("assigned");
  const [meetingFilter, setMeetingFilter] = useState<MeetingFilter>("all");
  const [meetingPage, setMeetingPage] = useState(1);
  const [coordinatorPermissions, setCoordinatorPermissions] = useState<string[]>([]);
  const [feedbackDrafts, setFeedbackDrafts] = useState<
    Record<string, { status: CoordinatorFeedbackStatus; note: string }>
  >({});
  const [savingFeedbackId, setSavingFeedbackId] = useState<string | null>(null);
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateMeetingView = () =>
      setMeetingView(getMeetingViewFromSearch(window.location.search));

    const handleMenuViewChange = (event: Event) => {
      const view = (event as CustomEvent<MeetingView>).detail;
      setMeetingView(view || getMeetingViewFromSearch(window.location.search));
    };

    updateMeetingView();
    window.addEventListener("popstate", updateMeetingView);
    window.addEventListener(
      COORDINATOR_VIEW_CHANGE_EVENT,
      handleMenuViewChange as EventListener
    );
    return () => {
      window.removeEventListener("popstate", updateMeetingView);
      window.removeEventListener(
        COORDINATOR_VIEW_CHANGE_EVENT,
        handleMenuViewChange as EventListener
      );
    };
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setAccessError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push(coordinatorLoginUrl());
        return;
      }

      const response = await fetch("/api/coordinator/meetings", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAccessError(
          response.status === 403
            ? "This account is not enabled as a coordinator yet. Please ask an admin to add this account under Coordinators."
            : data.error || "Unable to load coordinator meetings."
        );
        setMeetings([]);
        return;
      }

      setCoordinator(data.coordinator || null);
      const loadedMeetings = Array.isArray(data.meetings) ? data.meetings : [];
      setMeetings(loadedMeetings);
      setFeedbackDrafts((previousDrafts) => {
        const nextDrafts = { ...previousDrafts };
        for (const meeting of loadedMeetings as CoordinatorMeeting[]) {
          if (!nextDrafts[meeting.id]) {
            nextDrafts[meeting.id] = {
              status: meeting.feedback?.status || "successful",
              note: meeting.feedback?.note || "",
            };
          }
        }
        return nextDrafts;
      });
      setCoordinatorPermissions(
        Array.isArray(data.permissions) ? data.permissions.map(String) : []
      );
    } catch (error) {
      console.error("Failed to load coordinator meetings:", error);
      setAccessError("Unable to load coordinator meetings. Please try again.");
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    setMeetingPage(1);
  }, [meetingFilter, meetingView]);

  const counts = useMemo(() => {
    const upcoming = meetings.filter(isUpcomingMeeting).length;
    const ready = meetings.filter((meeting) => meeting.can_join).length;
    return { upcoming, ready, total: meetings.length };
  }, [meetings]);

  const viewMeetings = useMemo(() => {
    switch (meetingView) {
      case "upcoming":
        return meetings.filter(isUpcomingMeeting);
      case "joinable":
        return meetings.filter((meeting) => meeting.can_join);
      default:
        return meetings;
    }
  }, [meetingView, meetings]);

  const filterOptions = useMemo(
    () =>
      [
        { id: "all", label: "All" },
        { id: "successful", label: "Successful" },
        { id: "not_successful", label: "Unsuccessful" },
        { id: "upcoming", label: "Upcoming" },
        { id: "passed", label: "Passed" },
      ].map((option) => ({
        ...option,
        count: viewMeetings.filter((meeting) =>
          matchesMeetingFilter(meeting, option.id as MeetingFilter)
        ).length,
      })) as Array<{ id: MeetingFilter; label: string; count: number }>,
    [viewMeetings]
  );

  const filteredMeetings = useMemo(
    () =>
      viewMeetings.filter((meeting) =>
        matchesMeetingFilter(meeting, meetingFilter)
      ),
    [meetingFilter, viewMeetings]
  );

  const pageCount = Math.max(
    1,
    Math.ceil(filteredMeetings.length / MEETINGS_PER_PAGE)
  );
  const currentMeetingPage = Math.min(meetingPage, pageCount);
  const pageStart = (currentMeetingPage - 1) * MEETINGS_PER_PAGE;
  const paginatedMeetings = filteredMeetings.slice(
    pageStart,
    pageStart + MEETINGS_PER_PAGE
  );
  const pageEnd = pageStart + paginatedMeetings.length;

  useEffect(() => {
    if (meetingPage > pageCount) {
      setMeetingPage(pageCount);
    }
  }, [meetingPage, pageCount]);

  const hasCurrentViewPermission = useMemo(() => {
    const permissionSet = new Set(coordinatorPermissions);
    switch (meetingView) {
      case "upcoming":
        return permissionSet.has("view_upcoming_meetings");
      case "joinable":
        return permissionSet.has("join_approved_meetings");
      default:
        return permissionSet.has("view_assigned_meetings");
    }
  }, [coordinatorPermissions, meetingView]);

  const viewContent = {
    assigned: {
      title: "Assigned Meetings",
      description:
        "All meetings assigned by an admin appear here with participants, approval status, and join access.",
      emptyTitle: "No assigned meetings yet",
      emptyDescription:
        "Meetings assigned by an admin will appear here with their participants, status, and join button.",
    },
    upcoming: {
      title: "Upcoming Meetings",
      description:
        "Future pending and approved meetings assigned to this coordinator.",
      emptyTitle: "No upcoming meetings",
      emptyDescription:
        "Future assigned meetings will appear here once an admin assigns them.",
    },
    joinable: {
      title: "Approved / Joinable Meetings",
      description:
        "Approved meetings with an active video link that this coordinator can join.",
      emptyTitle: "No approved meetings ready to join",
      emptyDescription:
        "Meetings will appear here after admin approval and video-link readiness.",
    },
  }[meetingView];

  const handleJoinMeeting = async (meeting: CoordinatorMeeting) => {
    if (!meeting.can_join) {
      toast.warning(
        isPassedMeeting(meeting)
          ? "This meeting has passed and can no longer be joined."
          : "This meeting can only be joined during its scheduled meeting window."
      );
      return;
    }

    setJoiningId(meeting.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push(coordinatorLoginUrl());
        return;
      }

      const ackResponse = await fetch("/api/meetings/acknowledge-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meeting_id: meeting.id }),
      });

      if (!ackResponse.ok) {
        const ackData = await ackResponse.json().catch(() => ({}));
        toast.error(ackData.error || "Unable to acknowledge meeting rules.");
        return;
      }

      const linkResponse = await fetch(
        `/api/meetings/video-link?meeting_id=${meeting.id}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      const linkData = await linkResponse.json().catch(() => ({}));

      if (!linkResponse.ok || !linkData.video_link) {
        toast.error(
          linkData.message || linkData.error || "Meeting link is not ready yet."
        );
        return;
      }

      const joinedResponse = await fetch("/api/coordinator/meetings/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meeting_id: meeting.id, action: "joined" }),
      });
      const joinedData = await joinedResponse.json().catch(() => ({}));

      if (joinedResponse.ok && joinedData.feedback) {
        setMeetings((currentMeetings) =>
          currentMeetings.map((currentMeeting) =>
            currentMeeting.id === meeting.id
              ? { ...currentMeeting, feedback: joinedData.feedback }
              : currentMeeting
          )
        );
      } else {
        toast.warning(
          joinedData.error ||
            "Meeting opened, but coordinator report access was not recorded."
        );
      }

      window.open(linkData.video_link as string, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Coordinator join failed:", error);
      toast.error("Unable to open the meeting link.");
    } finally {
      setJoiningId(null);
    }
  };

  const handleFeedbackDraftChange = (
    meetingId: string,
    field: "status" | "note",
    value: string
  ) => {
    setFeedbackDrafts((drafts) => ({
      ...drafts,
      [meetingId]: {
        status:
          field === "status"
            ? (value as CoordinatorFeedbackStatus)
            : drafts[meetingId]?.status || "successful",
        note: field === "note" ? value : drafts[meetingId]?.note || "",
      },
    }));
  };

  const handleSaveFeedback = async (meeting: CoordinatorMeeting) => {
    const draft = feedbackDrafts[meeting.id] || {
      status: meeting.feedback?.status || "successful",
      note: meeting.feedback?.note || "",
    };

    setSavingFeedbackId(meeting.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push(coordinatorLoginUrl());
        return;
      }

      const response = await fetch("/api/coordinator/meetings/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          meeting_id: meeting.id,
          action: "submit",
          status: draft.status,
          note: draft.note,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.error || "Unable to save coordinator feedback.");
        return;
      }

      setMeetings((currentMeetings) =>
        currentMeetings.map((currentMeeting) =>
          currentMeeting.id === meeting.id
            ? { ...currentMeeting, feedback: data.feedback }
            : currentMeeting
        )
      );
      toast.success("Coordinator feedback saved for this meeting.");
    } catch (error) {
      console.error("Coordinator feedback save failed:", error);
      toast.error("Unable to save coordinator feedback.");
    } finally {
      setSavingFeedbackId(null);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push(coordinatorLoginUrl());
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Assigned video meetings
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {coordinator?.name || coordinator?.email || "Coordinator"} can view
              only assigned meetings and join after admin approval.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadMeetings()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Assigned</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {counts.total}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                <Video className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div
            id="upcoming-meetings"
            className="scroll-mt-8 rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">Upcoming</p>
                <p className="mt-1 text-3xl font-bold text-[#1f419a]">
                  {counts.upcoming}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
                <Calendar className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
          </div>
          <div
            id="joinable-meetings"
            className="scroll-mt-8 rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">Approved / Joinable</p>
                <p className="mt-1 text-3xl font-bold text-emerald-600">
                  {counts.ready}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
                <ClipboardCheck className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </div>
        </section>

        <section
          id="assigned-meetings"
          className="scroll-mt-8 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6"
        >
          <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {viewContent.title}
              </h2>
              <p className="text-sm text-gray-500">
                {viewContent.description}
              </p>
            </div>
            <span className="inline-flex w-fit rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1f419a]">
              {filteredMeetings.length > MEETINGS_PER_PAGE
                ? `${paginatedMeetings.length} of ${filteredMeetings.length} shown`
                : `${filteredMeetings.length} shown`}
            </span>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMeetingFilter(option.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                  meetingFilter === option.id
                    ? "border-[#1f419a] bg-[#1f419a] text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-[#1f419a]/40 hover:bg-[#eef4ff]"
                }`}
              >
                <span>{option.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    meetingFilter === option.id
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {option.count}
                </span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
              Loading assigned meetings...
            </div>
          ) : accessError ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Coordinator access required
                </h2>
                <p className="mt-1 max-w-lg text-sm text-slate-500">
                  {accessError}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadMeetings()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <LogOut className="h-4 w-4" />
                  Sign in with coordinator account
                </button>
              </div>
            </div>
          ) : !hasCurrentViewPermission ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Permission not enabled
                </h2>
                <p className="mt-1 max-w-md text-sm text-gray-500">
                  This coordinator account does not have access to this meeting
                  view. Ask a superadmin to update the individual permissions.
                </p>
              </div>
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                <Video className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {viewContent.emptyTitle}
                </h2>
                <p className="mt-1 max-w-md text-sm text-gray-500">
                  {meetingFilter === "all"
                    ? viewContent.emptyDescription
                    : "No meetings match the selected filter."}
                </p>
              </div>
            </div>
          ) : (
            <>
            <div className="max-h-[72vh] space-y-2 overflow-y-auto pr-1">
              {paginatedMeetings.map((meeting) => (
                <article
                  key={meeting.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-[#1f419a]/30 hover:shadow-md sm:p-4"
                >
                  <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.72fr)_minmax(280px,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#eef4ff] px-2.5 py-1 text-xs font-semibold text-[#1f419a] sm:text-sm">
                          <Video className="h-4 w-4" />
                          Video Meeting
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusBadge(
                            meeting.status
                          )}`}
                        >
                          {meeting.status === "pending"
                            ? "Awaiting admin approval"
                            : meeting.status}
                        </span>
                        {meeting.video_link_ready && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Link ready
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 sm:text-sm">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDateTime(meeting.scheduled_at)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {getJoinWindowLabel(meeting)}
                        </span>
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                      {meeting.participants.map((participant) => (
                        <div
                          key={`${meeting.id}-${participant.user_id}`}
                          className="rounded-lg bg-slate-50 px-2.5 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <UserRound className="h-4 w-4 flex-none text-slate-400" />
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                              {participant.display_name}
                            </p>
                            <span className="flex-none text-xs capitalize text-slate-500">
                              {participant.role}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleJoinMeeting(meeting)}
                      disabled={!meeting.can_join || joiningId === meeting.id}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f419a] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#1f419a]/20 transition hover:bg-[#17357b] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none lg:w-auto lg:whitespace-nowrap"
                    >
                      {joiningId === meeting.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      {getJoinButtonLabel(meeting)}
                    </button>
                  </div>

                  {(meeting.can_join || meeting.feedback) ? (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedReports((prev) => {
                            const next = new Set(prev);
                            if (next.has(meeting.id)) {
                              next.delete(meeting.id);
                            } else {
                              next.add(meeting.id);
                            }
                            return next;
                          })
                        }
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                      >
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-[#1f419a]" />
                          <span className="text-xs font-semibold text-slate-700">
                            Meeting Report
                          </span>
                          {meeting.feedback?.submitted_at && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getFeedbackBadgeTone(
                                meeting.feedback.status
                              )}`}
                            >
                              {meeting.feedback.status_label || "Saved"}
                            </span>
                          )}
                        </div>
                        <ChevronDown
                          className={`h-3.5 w-3.5 flex-none text-slate-400 transition-transform duration-200 ${
                            expandedReports.has(meeting.id) ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {expandedReports.has(meeting.id) && (
                        <div className="border-t border-slate-200 px-3 pb-3 pt-2">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <div className="sm:w-44">
                              <span className="mb-1 block text-xs font-semibold text-slate-500">
                                Outcome
                              </span>
                              <select
                                value={
                                  feedbackDrafts[meeting.id]?.status ||
                                  meeting.feedback?.status ||
                                  "successful"
                                }
                                onChange={(event) =>
                                  handleFeedbackDraftChange(
                                    meeting.id,
                                    "status",
                                    event.target.value
                                  )
                                }
                                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 outline-none focus:border-[#1f419a]"
                              >
                                <option value="successful">Successful</option>
                                <option value="not_successful">Not Successful</option>
                              </select>
                            </div>

                            <div className="flex-1">
                              <span className="mb-1 block text-xs font-semibold text-slate-500">
                                Report note
                              </span>
                              <textarea
                                rows={2}
                                value={
                                  feedbackDrafts[meeting.id]?.note ??
                                  meeting.feedback?.note ??
                                  ""
                                }
                                onChange={(event) =>
                                  handleFeedbackDraftChange(
                                    meeting.id,
                                    "note",
                                    event.target.value
                                  )
                                }
                                placeholder="Add report notes..."
                                className="w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-[#1f419a]"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleSaveFeedback(meeting)}
                              disabled={savingFeedbackId === meeting.id}
                              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-[#1f419a] px-3 text-xs font-bold text-white transition hover:bg-[#17357b] disabled:cursor-not-allowed disabled:opacity-60 sm:self-end"
                            >
                              {savingFeedbackId === meeting.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Save className="h-3.5 w-3.5" />
                              )}
                              Save
                            </button>
                          </div>
                          {meeting.feedback?.submitted_at && (
                            <p className="mt-1.5 text-xs text-slate-400">
                              Saved {formatDateTime(meeting.feedback.submitted_at)} ·{" "}
                              {getCoordinatorFeedbackStatusLabel(meeting.feedback.status) || "Report"}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            {filteredMeetings.length > MEETINGS_PER_PAGE && (
              <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-medium text-slate-500">
                  Showing {pageStart + 1}-{pageEnd} of {filteredMeetings.length}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setMeetingPage((page) => Math.max(page - 1, 1))
                    }
                    disabled={currentMeetingPage === 1}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#1f419a]/40 hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </button>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).map(
                    (page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setMeetingPage(page)}
                        className={`h-9 min-w-9 rounded-lg px-3 text-xs font-bold transition ${
                          currentMeetingPage === page
                            ? "bg-[#1f419a] text-white shadow-sm"
                            : "border border-slate-200 bg-white text-slate-600 hover:border-[#1f419a]/40 hover:bg-[#eef4ff]"
                        }`}
                      >
                        {page}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setMeetingPage((page) => Math.min(page + 1, pageCount))
                    }
                    disabled={currentMeetingPage === pageCount}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#1f419a]/40 hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
