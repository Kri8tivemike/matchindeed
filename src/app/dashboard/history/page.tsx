"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coins,
  Filter,
  Loader2,
  RefreshCw,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import { supabase } from "@/lib/supabase";

type Participant = {
  userId: string;
  role: string;
  response: string;
  name: string;
};

type HistoryMeeting = {
  id: string;
  hostId: string;
  type: string;
  status: string;
  canceledBy: string | null;
  scheduledAt: string;
  createdAt: string;
  chargeStatus: string | null;
  requesterCreditCost: number;
  accepterCreditCost: number;
  responseOutcome: string | null;
  participants: Participant[];
};

type ParticipantQueryRow = {
  meeting_id: string;
  user_id: string;
  role: string | null;
  response: string | null;
  user:
    | {
        display_name: string | null;
        email: string | null;
      }
    | {
        display_name: string | null;
        email: string | null;
      }[]
    | null;
};

type MeetingResponseRow = {
  response?: string | null;
};

type DecisionSummary = {
  label: string;
  detail: string;
  yesCount: number;
  noCount: number;
  pendingCount: number;
};

type StatusFilter = "all" | "completed" | "canceled" | "confirmed" | "pending";
type TypeFilter = "all" | "group" | "one_on_one";

function toTitleCase(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getCancellationActorLabel(meeting: HistoryMeeting, currentUserId: string | null) {
  if (!meeting.canceledBy) return null;
  if (meeting.canceledBy === currentUserId) return "you";

  if (["host", "guest", "coordinator"].includes(meeting.canceledBy)) {
    const roleParticipant = meeting.participants.find(
      (participant) => participant.role === meeting.canceledBy
    );

    if (roleParticipant?.name) {
      return roleParticipant.userId === currentUserId ? "you" : roleParticipant.name;
    }
  }

  const cancelingParticipant = meeting.participants.find(
    (participant) => participant.userId === meeting.canceledBy
  );

  if (cancelingParticipant?.name) {
    return cancelingParticipant.name;
  }

  return "MatchIndeed team";
}

function isHistoricalMeeting(meeting: HistoryMeeting) {
  const status = meeting.status.toLowerCase();
  if (["completed", "canceled", "cancelled"].includes(status)) {
    return true;
  }

  const scheduledAt = new Date(meeting.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return false;
  }

  return scheduledAt.getTime() < Date.now();
}

function summarizeResponses(responses: MeetingResponseRow[]): DecisionSummary {
  const yesCount = responses.filter((entry) => (entry.response || "").toLowerCase() === "yes").length;
  const noCount = responses.filter((entry) => (entry.response || "").toLowerCase() === "no").length;
  const pendingCount = Math.max(0, 2 - (yesCount + noCount));

  if (yesCount >= 2 && noCount === 0) {
    return {
      label: "Both said YES",
      detail: "Relationship flow unlocked.",
      yesCount,
      noCount,
      pendingCount,
    };
  }

  if (noCount >= 2 && yesCount === 0) {
    return {
      label: "Both said NO",
      detail: "Saved in history with no match.",
      yesCount,
      noCount,
      pendingCount,
    };
  }

  if (yesCount > 0 && noCount > 0) {
    return {
      label: "Mismatch",
      detail: "One YES and one NO.",
      yesCount,
      noCount,
      pendingCount,
    };
  }

  if (yesCount + noCount > 0) {
    return {
      label: "Waiting for response",
      detail: "Only one participant has responded.",
      yesCount,
      noCount,
      pendingCount,
    };
  }

  return {
    label: "No responses submitted",
    detail: "Post-meeting YES/NO not completed.",
    yesCount,
    noCount,
    pendingCount,
  };
}

function summaryFromOutcome(outcome: string | null): DecisionSummary | null {
  if (!outcome) return null;

  switch (outcome) {
    case "both_yes":
      return {
        label: "Both said YES",
        detail: "Relationship flow unlocked.",
        yesCount: 2,
        noCount: 0,
        pendingCount: 0,
      };
    case "both_no":
      return {
        label: "Both said NO",
        detail: "Saved in history with no match.",
        yesCount: 0,
        noCount: 2,
        pendingCount: 0,
      };
    case "mismatch":
      return {
        label: "Mismatch",
        detail: "One YES and one NO.",
        yesCount: 1,
        noCount: 1,
        pendingCount: 0,
      };
    default:
      return null;
  }
}

const statusStyles: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700",
  canceled: "bg-red-50 text-red-700",
  cancelled: "bg-red-50 text-red-700",
  confirmed: "bg-blue-50 text-blue-700",
  pending: "bg-amber-50 text-amber-700",
};

export default function MeetingHistoryPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<HistoryMeeting[]>([]);
  const [decisionsByMeeting, setDecisionsByMeeting] = useState<Record<string, DecisionSummary>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const session = authData.session;

      if (!session?.user) {
        router.push("/login");
        return;
      }

      const currentUserId = session.user.id;
      setUserId(currentUserId);

      const [
        { data: participantLinks, error: participantLinkError },
        { data: hostedMeetings, error: hostError },
      ] = await Promise.all([
        supabase
          .from("meeting_participants")
          .select("meeting_id")
          .eq("user_id", currentUserId)
          .limit(500),
        supabase.from("meetings").select("id").eq("host_id", currentUserId).limit(500),
      ]);

      if (participantLinkError || hostError) {
        console.error("Error loading history meeting ids:", participantLinkError || hostError);
        setMeetings([]);
        setDecisionsByMeeting({});
        return;
      }

      const idSet = new Set<string>();
      (participantLinks || []).forEach((row) => {
        if (row.meeting_id) idSet.add(row.meeting_id);
      });
      (hostedMeetings || []).forEach((row) => {
        if (row.id) idSet.add(row.id);
      });

      const meetingIds = Array.from(idSet);
      if (meetingIds.length === 0) {
        setMeetings([]);
        setDecisionsByMeeting({});
        return;
      }

      const [
        { data: meetingRows, error: meetingError },
        { data: participantRows, error: participantError },
      ] = await Promise.all([
        supabase
          .from("meetings")
          .select("*")
          .in("id", meetingIds)
          .order("scheduled_at", { ascending: false }),
        supabase
          .from("meeting_participants")
          .select(
            "meeting_id, user_id, role, response, user:accounts!meeting_participants_user_id_fkey(display_name, email)"
          )
          .in("meeting_id", meetingIds),
      ]);

      if (meetingError || participantError) {
        console.error("Error loading history meetings:", meetingError || participantError);
        setMeetings([]);
        setDecisionsByMeeting({});
        return;
      }

      const groupedParticipants = new Map<string, Participant[]>();
      ((participantRows || []) as ParticipantQueryRow[]).forEach((row) => {
        const role = (row.role || "guest").toLowerCase();
        const response = (row.response || "requested").toLowerCase();
        const participantUser = Array.isArray(row.user) ? row.user[0] || null : row.user;
        const fallbackName = participantUser?.email
          ? participantUser.email.split("@")[0]
          : "Member";
        const name = participantUser?.display_name || fallbackName;

        const existing = groupedParticipants.get(row.meeting_id) || [];
        existing.push({
          userId: row.user_id,
          role,
          response,
          name,
        });
        groupedParticipants.set(row.meeting_id, existing);
      });

      const normalized = (meetingRows || []).map((row) => {
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : "";
        const status =
          typeof record.status === "string" ? record.status.toLowerCase() : "pending";
        const type = typeof record.type === "string" ? record.type.toLowerCase() : "one_on_one";
        const scheduledAt =
          typeof record.scheduled_at === "string"
            ? record.scheduled_at
            : new Date(0).toISOString();
        const createdAt =
          typeof record.created_at === "string" ? record.created_at : new Date(0).toISOString();

        return {
          id,
          hostId: typeof record.host_id === "string" ? record.host_id : "",
          type,
          status,
          canceledBy:
            typeof record.canceled_by === "string" ? record.canceled_by : null,
          scheduledAt,
          createdAt,
          chargeStatus: typeof record.charge_status === "string" ? record.charge_status : null,
          requesterCreditCost:
            typeof record.requester_credit_cost === "number"
              ? record.requester_credit_cost
              : 0,
          accepterCreditCost:
            typeof record.accepter_credit_cost === "number"
              ? record.accepter_credit_cost
              : 0,
          responseOutcome:
            typeof record.response_outcome === "string" ? record.response_outcome : null,
          participants: groupedParticipants.get(id) || [],
        } as HistoryMeeting;
      });

      const historyMeetings = normalized
        .filter((meeting) => meeting.id.length > 0)
        .filter(isHistoricalMeeting)
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

      setMeetings(historyMeetings);

      const decisionSeed: Record<string, DecisionSummary> = {};

      historyMeetings.forEach((meeting) => {
        const fromOutcome = summaryFromOutcome(meeting.responseOutcome);
        if (fromOutcome) {
          decisionSeed[meeting.id] = fromOutcome;
        }
      });

      const completedWithoutOutcome = historyMeetings
        .filter((meeting) => meeting.status === "completed" && !decisionSeed[meeting.id])
        .slice(0, 40);

      await Promise.all(
        completedWithoutOutcome.map(async (meeting) => {
          try {
            const res = await fetch(`/api/meetings/response?meeting_id=${meeting.id}`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (!res.ok) return;
            const payload = (await res.json()) as { responses?: MeetingResponseRow[] };
            const responses = payload.responses || [];
            decisionSeed[meeting.id] = summarizeResponses(responses);
          } catch (error) {
            console.error("Error fetching meeting response summary:", error);
          }
        })
      );

      setDecisionsByMeeting(decisionSeed);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const filteredMeetings = useMemo(() => {
    return meetings.filter((meeting) => {
      if (statusFilter !== "all") {
        const normalizedStatus = meeting.status === "cancelled" ? "canceled" : meeting.status;
        if (normalizedStatus !== statusFilter) {
          return false;
        }
      }

      if (typeFilter !== "all" && meeting.type !== typeFilter) {
        return false;
      }

      if (fromDate) {
        const from = new Date(`${fromDate}T00:00:00`);
        if (new Date(meeting.scheduledAt).getTime() < from.getTime()) {
          return false;
        }
      }

      if (toDate) {
        const to = new Date(`${toDate}T23:59:59`);
        if (new Date(meeting.scheduledAt).getTime() > to.getTime()) {
          return false;
        }
      }

      return true;
    });
  }, [fromDate, meetings, statusFilter, toDate, typeFilter]);

  const totals = useMemo(() => {
    return filteredMeetings.reduce(
      (acc, meeting) => {
        acc.requester += meeting.requesterCreditCost;
        acc.accepter += meeting.accepterCreditCost;
        return acc;
      },
      { requester: 0, accepter: 0 }
    );
  }, [filteredMeetings]);

  const refresh = async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-[#f8faff] to-[#eef2ff] text-gray-900">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-[1200px] px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#1f419a]">Meeting History</h1>
            <p className="text-sm text-gray-600">Past meetings, decisions, and credit usage</p>
          </div>
          <NotificationBell />
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Sidebar active="history" />

        <section className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="text-xs uppercase tracking-wide text-gray-500">Meetings</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{filteredMeetings.length}</div>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="text-xs uppercase tracking-wide text-gray-500">Requester Credits</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{totals.requester}</div>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="text-xs uppercase tracking-wide text-gray-500">Accepter Credits</div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{totals.accepter}</div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Filter className="h-4 w-4" /> Filters
              </div>

              <label className="text-sm text-gray-700">
                <span className="mb-1 block text-xs text-gray-500">Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1f419a]"
                >
                  <option value="all">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="canceled">Canceled</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                </select>
              </label>

              <label className="text-sm text-gray-700">
                <span className="mb-1 block text-xs text-gray-500">Meeting Type</span>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1f419a]"
                >
                  <option value="all">All types</option>
                  <option value="one_on_one">1-on-1</option>
                  <option value="group">Group</option>
                </select>
              </label>

              <label className="text-sm text-gray-700">
                <span className="mb-1 block text-xs text-gray-500">From</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1f419a]"
                />
              </label>

              <label className="text-sm text-gray-700">
                <span className="mb-1 block text-xs text-gray-500">To</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1f419a]"
                />
              </label>

              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1f419a] px-3 py-2 text-sm font-medium text-white hover:bg-[#17357d] disabled:opacity-70"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white p-10 shadow-sm ring-1 ring-black/5 text-center text-gray-500">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#1f419a]" />
              <p className="mt-3">Loading meeting history...</p>
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 shadow-sm ring-1 ring-black/5 text-center text-gray-500">
              <CalendarDays className="mx-auto h-8 w-8 text-[#1f419a]" />
              <p className="mt-3">No history items match your filters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMeetings.map((meeting) => {
                const status = meeting.status.toLowerCase();
                const statusClass = statusStyles[status] || "bg-gray-100 text-gray-700";
                const decision = decisionsByMeeting[meeting.id];
                const peerNames = meeting.participants
                  .filter((participant) => participant.userId !== userId)
                  .map((participant) => participant.name);
                const participantLabel =
                  peerNames.length > 0 ? peerNames.join(", ") : "No participant details";
                const canceledByLabel = getCancellationActorLabel(meeting, userId);

                const isOneOnOne = meeting.type === "one_on_one";
                const totalCredits = meeting.requesterCreditCost + meeting.accepterCreditCost;

                return (
                  <article
                    key={meeting.id}
                    className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#eef2ff] px-2.5 py-1 text-xs font-medium text-[#1f419a]">
                            {isOneOnOne ? <Video className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                            {isOneOnOne ? "1-on-1" : "Group"}
                          </span>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}>
                            {toTitleCase(status)}
                          </span>
                        </div>
                        <h3 className="mt-2 text-base font-semibold text-gray-900">{participantLabel}</h3>
                        <p className="mt-1 text-sm text-gray-600 inline-flex items-center gap-1">
                          <Clock3 className="h-4 w-4" />
                          {formatDateTime(meeting.scheduledAt)}
                        </p>
                        {canceledByLabel && (status === "canceled" || status === "cancelled") ? (
                          <p className="mt-1 text-sm text-red-600">Canceled by {canceledByLabel}</p>
                        ) : null}
                      </div>

                      <div className="grid min-w-[220px] grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg bg-gray-50 px-2 py-2 text-center">
                          <div className="text-gray-500">Requester</div>
                          <div className="mt-1 font-semibold text-gray-900">{meeting.requesterCreditCost}</div>
                        </div>
                        <div className="rounded-lg bg-gray-50 px-2 py-2 text-center">
                          <div className="text-gray-500">Accepter</div>
                          <div className="mt-1 font-semibold text-gray-900">{meeting.accepterCreditCost}</div>
                        </div>
                        <div className="rounded-lg bg-[#eef7ff] px-2 py-2 text-center">
                          <div className="text-[#3a568f]">Total</div>
                          <div className="mt-1 font-semibold text-[#1f419a]">{totalCredits}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-700 font-medium">
                          <Coins className="h-4 w-4" />
                          YES/NO Decision
                        </div>
                        {decision ? (
                          <>
                            <p className="mt-1 font-semibold text-gray-900">{decision.label}</p>
                            <p className="text-xs text-gray-600">{decision.detail}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              YES: {decision.yesCount} · NO: {decision.noCount}
                              {decision.pendingCount > 0 ? ` · Pending: ${decision.pendingCount}` : ""}
                            </p>
                          </>
                        ) : status === "completed" ? (
                          <p className="mt-1 text-sm text-gray-600">Responses not yet available.</p>
                        ) : (
                          <p className="mt-1 text-sm text-gray-600">Meeting must be completed before responses.</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {status === "completed" ? (
                          <Link
                            href={`/dashboard/meetings/${meeting.id}/response`}
                            className="inline-flex items-center gap-2 rounded-lg border border-[#1f419a]/30 px-3 py-2 text-sm font-medium text-[#1f419a] hover:bg-[#eef2ff]"
                          >
                            View response
                          </Link>
                        ) : null}

                        {status === "completed" ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : status === "canceled" || status === "cancelled" ? (
                          <XCircle className="h-5 w-5 text-red-600" />
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
