"use client";

/**
 * AdminPostMeetingsPage - Post-Meeting Review & Investigation Queue
 *
 * Features per client request:
 * - Review meeting reports from coordinators
 * - View Yes/No answers from participants
 * - Review video recordings (VIP only)
 * - Finalize charges based on meeting outcomes
 * - Handle refunds for issues
 * - Investigation Queue: meetings with charge_status = "pending_review"
 * - Admin can resolve investigations within 1-2 business days
 */

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import {
  ClipboardCheck,
  Video,
  CheckCircle,
  XCircle,
  DollarSign,
  User,
  Calendar,
  Loader2,
  RefreshCw,
  Eye,
  Check,
  X,
  AlertTriangle,
  Search,
  Shield,
  FileText,
  Clock,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------

/** Meeting report from coordinators */
type MeetingReport = {
  id: string;
  meeting_id: string;
  coordinator_name: string;
  conclusion: string | null;
  participant_yes_no: any;
  video_recording_url: string | null;
  host_decision: string | null;
  admin_notes: string | null;
  finalized: boolean;
  meeting: {
    id: string;
    host_id: string;
    scheduled_at: string;
    fee_cents: number;
    charge_status: string;
  } | null;
};

/** Investigation meeting fetched from admin resolve API */
type InvestigationMeeting = {
  id: string;
  host_id: string;
  type: string;
  status: string;
  scheduled_at: string;
  fee_cents: number;
  charge_status: string;
  cancellation_fee_cents: number;
  outcome: string | null;
  fault_determination: string | null;
  host_notes: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string;
  participants: {
    user_id: string;
    role: string;
    response: string | null;
    name: string;
    email: string;
    tier: string;
  }[];
  responses: {
    user_id: string;
    response: string;
    agreement_text: string | null;
    signed_at: string | null;
  }[];
};

/** Resolution options */
type Resolution =
  | "charge_requester"
  | "refund_requester"
  | "charge_accepter"
  | "no_charge"
  | "split";

// ---------------------------------------------------------------
// TAB CONFIG
// ---------------------------------------------------------------
const TABS = [
  { id: "investigations", label: "Investigation Queue", icon: Search },
  { id: "reports", label: "Meeting Reports", icon: ClipboardCheck },
  { id: "resolved", label: "Resolved", icon: CheckCircle },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPostMeetingsPage() {
  const { toast } = useToast();

  // ---------------------------------------------------------------
  // STATE — Tab
  // ---------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<TabId>("investigations");

  // ---------------------------------------------------------------
  // STATE — Coordinator reports (existing flow)
  // ---------------------------------------------------------------
  const [reports, setReports] = useState<MeetingReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<MeetingReport | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [finalizeAction, setFinalizeAction] = useState<"charge" | "refund" | "no_charge">("charge");

  // ---------------------------------------------------------------
  // STATE — Investigation queue (new flow)
  // ---------------------------------------------------------------
  const [investigations, setInvestigations] = useState<InvestigationMeeting[]>([]);
  const [investigationsLoading, setInvestigationsLoading] = useState(true);
  const [selectedInvestigation, setSelectedInvestigation] = useState<InvestigationMeeting | null>(null);
  const [resolution, setResolution] = useState<Resolution>("charge_requester");
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolvedMeetings, setResolvedMeetings] = useState<InvestigationMeeting[]>([]);

  // ---------------------------------------------------------------
  // FETCH FUNCTIONS
  // ---------------------------------------------------------------

  /** Fetch coordinator meeting reports */
  const fetchReports = async () => {
    setReportsLoading(true);
    try {
      const { data, error } = await supabase
        .from("meeting_reports")
        .select(`
          id,
          meeting_id,
          coordinator_name,
          conclusion,
          participant_yes_no,
          video_recording_url,
          host_decision,
          admin_notes,
          finalized,
          meetings (
            id,
            host_id,
            scheduled_at,
            fee_cents,
            charge_status
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching reports:", error);
        return;
      }

      const transformedReports: MeetingReport[] = (data || []).map((report: any) => ({
        ...report,
        meeting: Array.isArray(report.meetings) ? report.meetings[0] : report.meetings,
      }));

      setReports(transformedReports);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setReportsLoading(false);
    }
  };

  /** Fetch meetings under investigation via admin resolve API */
  const fetchInvestigations = useCallback(async () => {
    setInvestigationsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/admin/meetings/resolve?status=pending_review", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setInvestigations(data.meetings || []);
      } else {
        console.error("Failed to fetch investigations:", res.status);
      }

      // Also fetch resolved investigations
      const resResolved = await fetch("/api/admin/meetings/resolve?status=captured", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const resRefunded = await fetch("/api/admin/meetings/resolve?status=refunded", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const resolved: InvestigationMeeting[] = [];
      if (resResolved.ok) {
        const d = await resResolved.json();
        resolved.push(
          ...(d.meetings || []).filter(
            (m: InvestigationMeeting) => m.finalized_at !== null
          )
        );
      }
      if (resRefunded.ok) {
        const d = await resRefunded.json();
        resolved.push(
          ...(d.meetings || []).filter(
            (m: InvestigationMeeting) => m.finalized_at !== null
          )
        );
      }
      setResolvedMeetings(resolved);
    } catch (error) {
      console.error("Error fetching investigations:", error);
    } finally {
      setInvestigationsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
    fetchInvestigations();
  }, [fetchInvestigations]);

  // ---------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------

  /** Finalize coordinator meeting report and handle charges (existing flow) */
  const handleFinalize = async () => {
    if (!selectedReport) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Update report
      const { error: reportError } = await supabase
        .from("meeting_reports")
        .update({
          finalized: true,
          admin_notes: adminNotes,
          finalized_by: user?.id,
          finalized_at: new Date().toISOString(),
        })
        .eq("id", selectedReport.id);

      if (reportError) throw reportError;

      // Handle charges/refunds based on decision
      if (selectedReport.meeting) {
        const meeting = selectedReport.meeting;

        const { data: participants } = await supabase
          .from("meeting_participants")
          .select("user_id, role")
          .eq("meeting_id", meeting.id);

        if (participants && participants.length >= 2) {
          const requester = participants.find((p) => p.role === "guest");

          if (finalizeAction === "charge") {
            await supabase
              .from("meetings")
              .update({ charge_status: "captured" })
              .eq("id", meeting.id);

            if (requester && meeting.fee_cents) {
              const { data: wallet } = await supabase
                .from("wallets")
                .select("balance_cents")
                .eq("user_id", requester.user_id)
                .single();

              if (wallet) {
                await supabase.from("wallet_transactions").insert({
                  user_id: requester.user_id,
                  type: "meeting_charge",
                  amount_cents: -meeting.fee_cents,
                  description: `Meeting charge for meeting ${meeting.id}`,
                  balance_before: wallet.balance_cents || 0,
                  balance_after: (wallet.balance_cents || 0) - meeting.fee_cents,
                });
              }
            }
          } else if (finalizeAction === "refund") {
            await supabase
              .from("meetings")
              .update({ charge_status: "refunded" })
              .eq("id", meeting.id);

            if (requester) {
              const { data: credits } = await supabase
                .from("credits")
                .select("used")
                .eq("user_id", requester.user_id)
                .single();

              if (credits) {
                await supabase
                  .from("credits")
                  .update({ used: Math.max(0, credits.used - 1) })
                  .eq("user_id", requester.user_id);
              }

              if (meeting.fee_cents) {
                const { data: wallet } = await supabase
                  .from("wallets")
                  .select("balance_cents")
                  .eq("user_id", requester.user_id)
                  .single();

                if (wallet) {
                  await supabase
                    .from("wallets")
                    .update({
                      balance_cents: (wallet.balance_cents || 0) + meeting.fee_cents,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("user_id", requester.user_id);

                  await supabase.from("wallet_transactions").insert({
                    user_id: requester.user_id,
                    type: "meeting_refund",
                    amount_cents: meeting.fee_cents,
                    description: `Refund for meeting ${meeting.id}`,
                    balance_before: wallet.balance_cents || 0,
                    balance_after: (wallet.balance_cents || 0) + meeting.fee_cents,
                  });
                }
              }
            }
          } else if (finalizeAction === "no_charge") {
            await supabase
              .from("meetings")
              .update({ charge_status: "refunded" })
              .eq("id", meeting.id);

            if (requester) {
              const { data: credits } = await supabase
                .from("credits")
                .select("used")
                .eq("user_id", requester.user_id)
                .single();

              if (credits) {
                await supabase
                  .from("credits")
                  .update({ used: Math.max(0, credits.used - 1) })
                  .eq("user_id", requester.user_id);
              }
            }
          }
        }
      }

      if (user) {
        await supabase.from("admin_logs").insert({
          admin_id: user.id,
          action: "meeting_finalized",
          meta: {
            report_id: selectedReport.id,
            meeting_id: selectedReport.meeting_id,
            action: finalizeAction,
          },
        });
      }

      setSelectedReport(null);
      setAdminNotes("");
      fetchReports();
      toast.success("Meeting finalized successfully!");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to finalize meeting");
    }
  };

  /** Resolve an investigation via the admin API */
  const handleResolveInvestigation = async () => {
    if (!selectedInvestigation) return;
    setResolving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch("/api/admin/meetings/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          meeting_id: selectedInvestigation.id,
          resolution,
          admin_notes: resolveNotes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to resolve investigation");
        return;
      }

      setSelectedInvestigation(null);
      setResolveNotes("");
      setResolution("charge_requester");
      fetchInvestigations();
      toast.success("Investigation resolved! Both parties have been notified.");
    } catch (error) {
      console.error("Error resolving investigation:", error);
      toast.error("Failed to resolve investigation");
    } finally {
      setResolving(false);
    }
  };

  // ---------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------

  const pendingReports = reports.filter((r) => !r.finalized);
  const finalizedReports = reports.filter((r) => r.finalized);

  /** Get participant display by role */
  const getParticipant = (meeting: InvestigationMeeting, role: string) =>
    meeting.participants.find((p) => p.role === role);

  /** Human-readable fault labels */
  const faultLabel = (fault: string | null) => {
    switch (fault) {
      case "no_fault":
        return "No Fault";
      case "requester_fault":
        return "Requester at Fault";
      case "accepter_fault":
        return "Accepter at Fault";
      case "both_fault":
        return "Both at Fault";
      default:
        return fault || "Not Determined";
    }
  };

  /** Human-readable outcome labels */
  const outcomeLabel = (outcome: string | null) => {
    switch (outcome) {
      case "completed":
        return "Completed";
      case "no_show":
        return "No Show";
      case "early_leave":
        return "Early Leave";
      case "network_disconnect":
        return "Network Disconnect";
      default:
        return outcome || "Unknown";
    }
  };

  /** Resolution description */
  const resolutionHelp: Record<Resolution, string> = {
    charge_requester:
      "The meeting requester (guest) keeps the charge. This is the normal outcome when there is no fault from the accepter.",
    refund_requester:
      "Full refund to the requester (guest). Use when the fault lies with the accepter or network issues are verified.",
    charge_accepter:
      "Refund the requester and charge the accepter (host). Use when clear evidence shows the accepter is at fault.",
    no_charge:
      "No one is charged. Full refund to the requester. Use for platform issues or mutual agreement.",
    split:
      "Both parties share responsibility. Charges remain as-is (no refund). Use for mutual fault situations.",
  };

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------
  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Post-Meeting Review
          </h1>
          <p className="text-gray-500">
            Review outcomes, resolve investigations, and finalize charges
          </p>
        </div>
        <button
          onClick={() => {
            fetchReports();
            fetchInvestigations();
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const count =
            tab.id === "investigations"
              ? investigations.length
              : tab.id === "reports"
                ? pendingReports.length
                : resolvedMeetings.length;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {count > 0 && (
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    activeTab === tab.id
                      ? tab.id === "investigations"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ============================================================= */}
      {/* TAB: Investigation Queue                                        */}
      {/* ============================================================= */}
      {activeTab === "investigations" && (
        <div>
          {investigationsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
            </div>
          ) : investigations.length === 0 ? (
            <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
              <Shield className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900">
                No Pending Investigations
              </h3>
              <p className="text-gray-500 mt-1">
                All meeting investigations have been resolved.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {investigations.map((meeting) => {
                const guest = getParticipant(meeting, "guest");
                const host = getParticipant(meeting, "host");
                const daysSinceFinalized = meeting.finalized_at
                  ? Math.floor(
                      (Date.now() - new Date(meeting.finalized_at).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )
                  : 0;
                const isUrgent = daysSinceFinalized >= 2;

                return (
                  <div
                    key={meeting.id}
                    className={`bg-white rounded-xl p-5 shadow-sm border ${
                      isUrgent ? "border-red-200 bg-red-50/30" : "border-gray-100"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* Header row */}
                        <div className="flex items-center gap-3 mb-2">
                          <AlertTriangle
                            className={`h-5 w-5 ${isUrgent ? "text-red-500" : "text-amber-500"}`}
                          />
                          <h3 className="font-semibold text-gray-900">
                            Meeting #{meeting.id.slice(0, 8)}
                          </h3>
                          {isUrgent && (
                            <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full font-medium">
                              URGENT — {daysSinceFinalized} days pending
                            </span>
                          )}
                          <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                            Pending Review
                          </span>
                        </div>

                        {/* Meeting info */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                          <div>
                            <span className="text-gray-500">Scheduled</span>
                            <p className="font-medium text-gray-900">
                              {new Date(meeting.scheduled_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Outcome</span>
                            <p className="font-medium text-gray-900">
                              {outcomeLabel(meeting.outcome)}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Fault</span>
                            <p
                              className={`font-medium ${
                                meeting.fault_determination === "no_fault"
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {faultLabel(meeting.fault_determination)}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Fee</span>
                            <p className="font-medium text-gray-900">
                              {meeting.fee_cents
                                ? `${(meeting.fee_cents / 100).toFixed(2)}`
                                : "N/A"}
                            </p>
                          </div>
                        </div>

                        {/* Participants */}
                        <div className="flex gap-4 text-sm">
                          {guest && (
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                                Guest
                              </span>
                              <span className="text-gray-700">
                                {guest.name}{" "}
                                <span className="text-gray-400">
                                  ({guest.tier})
                                </span>
                              </span>
                            </div>
                          )}
                          {host && (
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">
                                Host
                              </span>
                              <span className="text-gray-700">
                                {host.name}{" "}
                                <span className="text-gray-400">
                                  ({host.tier})
                                </span>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Host notes preview */}
                        {meeting.host_notes && (
                          <div className="mt-2 p-2 bg-gray-50 rounded-lg text-sm text-gray-600 line-clamp-2">
                            <FileText className="h-3.5 w-3.5 inline mr-1" />
                            {meeting.host_notes}
                          </div>
                        )}
                      </div>

                      {/* Resolve button */}
                      <button
                        onClick={() => setSelectedInvestigation(meeting)}
                        className="ml-4 px-5 py-2.5 rounded-lg bg-[#1f419a] text-white hover:bg-[#17357b] font-medium flex items-center gap-2 whitespace-nowrap"
                      >
                        Resolve
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB: Meeting Reports (existing)                                 */}
      {/* ============================================================= */}
      {activeTab === "reports" && (
        <div>
          {reportsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
            </div>
          ) : pendingReports.length === 0 ? (
            <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
              <ClipboardCheck className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900">
                No Pending Reports
              </h3>
              <p className="text-gray-500 mt-1">
                All coordinator reports have been reviewed.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingReports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        Meeting #{report.meeting_id.slice(0, 8)}
                      </p>
                      <p className="text-sm text-gray-500">
                        Coordinator: {report.coordinator_name}
                      </p>
                      {report.meeting && (
                        <p className="text-sm text-gray-500">
                          Scheduled:{" "}
                          {new Date(
                            report.meeting.scheduled_at
                          ).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedReport(report)}
                      className="px-4 py-2 rounded-lg bg-[#1f419a] text-white hover:bg-[#17357b]"
                    >
                      Review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB: Resolved                                                   */}
      {/* ============================================================= */}
      {activeTab === "resolved" && (
        <div>
          {investigationsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
            </div>
          ) : resolvedMeetings.length === 0 && finalizedReports.length === 0 ? (
            <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
              <CheckCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900">
                No Resolved Items Yet
              </h3>
              <p className="text-gray-500 mt-1">
                Resolved investigations and finalized reports will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Resolved investigations */}
              {resolvedMeetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <p className="font-medium text-gray-900">
                          Meeting #{meeting.id.slice(0, 8)}
                        </p>
                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                          {meeting.charge_status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        Outcome: {outcomeLabel(meeting.outcome)} | Fault:{" "}
                        {faultLabel(meeting.fault_determination)}
                      </p>
                      {meeting.finalized_at && (
                        <p className="text-xs text-gray-400 mt-1">
                          Finalized:{" "}
                          {new Date(meeting.finalized_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">
                      {meeting.participants.map((p) => p.name).join(" vs ")}
                    </span>
                  </div>
                </div>
              ))}

              {/* Finalized reports */}
              {finalizedReports.map((report) => (
                <div
                  key={report.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <ClipboardCheck className="h-4 w-4 text-green-500" />
                        <p className="font-medium text-gray-900">
                          Report #{report.meeting_id.slice(0, 8)}
                        </p>
                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                          Finalized
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        Coordinator: {report.coordinator_name}
                      </p>
                      {report.admin_notes && (
                        <p className="text-sm text-gray-500 mt-1">
                          Notes: {report.admin_notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL: Coordinator Report Review                                */}
      {/* ============================================================= */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Meeting Review
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coordinator Conclusion
                </label>
                <p className="p-3 bg-gray-50 rounded-lg text-sm">
                  {selectedReport.conclusion || "No conclusion provided"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Participant Responses
                </label>
                <div className="p-3 bg-gray-50 rounded-lg">
                  {selectedReport.participant_yes_no &&
                  typeof selectedReport.participant_yes_no === "object" ? (
                    Object.entries(selectedReport.participant_yes_no).map(
                      ([userId, response]: [string, any]) => (
                        <div
                          key={userId}
                          className="flex items-center gap-2 mb-2"
                        >
                          {response === "yes" ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="text-sm">
                            User {userId.slice(0, 8)}: {response}
                          </span>
                        </div>
                      )
                    )
                  ) : (
                    <p className="text-sm text-gray-500">
                      No responses recorded
                    </p>
                  )}
                </div>
              </div>

              {selectedReport.video_recording_url && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Video Recording (VIP)
                  </label>
                  <a
                    href={selectedReport.video_recording_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[#1f419a] hover:underline"
                  >
                    <Video className="h-4 w-4" />
                    View Recording
                  </a>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Host Decision
                </label>
                <p className="p-3 bg-gray-50 rounded-lg text-sm">
                  {selectedReport.host_decision || "No decision"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Admin Notes
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add your notes..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none resize-none h-24"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Finalize Action
                </label>
                <select
                  value={finalizeAction}
                  onChange={(e) =>
                    setFinalizeAction(e.target.value as any)
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                >
                  <option value="charge">Charge User</option>
                  <option value="refund">Refund User</option>
                  <option value="no_charge">No Charge</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setSelectedReport(null);
                    setAdminNotes("");
                  }}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFinalize}
                  className="flex-1 py-2 rounded-lg bg-[#1f419a] text-white hover:bg-[#17357b] flex items-center justify-center gap-2"
                >
                  <Check className="h-4 w-4" />
                  Finalize
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL: Investigation Resolution                                */}
      {/* ============================================================= */}
      {selectedInvestigation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Search className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Resolve Investigation
                </h3>
                <p className="text-sm text-gray-500">
                  Meeting #{selectedInvestigation.id.slice(0, 8)} —{" "}
                  {new Date(selectedInvestigation.scheduled_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Meeting Details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-xl">
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wider">
                    Outcome
                  </span>
                  <p className="font-medium text-gray-900 mt-1">
                    {outcomeLabel(selectedInvestigation.outcome)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wider">
                    Fault
                  </span>
                  <p
                    className={`font-medium mt-1 ${
                      selectedInvestigation.fault_determination === "no_fault"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {faultLabel(selectedInvestigation.fault_determination)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wider">
                    Fee
                  </span>
                  <p className="font-medium text-gray-900 mt-1">
                    {selectedInvestigation.fee_cents
                      ? `${(selectedInvestigation.fee_cents / 100).toFixed(2)}`
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wider">
                    Submitted
                  </span>
                  <p className="font-medium text-gray-900 mt-1">
                    {selectedInvestigation.finalized_at
                      ? new Date(selectedInvestigation.finalized_at).toLocaleDateString()
                      : "N/A"}
                  </p>
                </div>
              </div>

              {/* Participants */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  Participants
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedInvestigation.participants.map((p) => (
                    <div
                      key={p.user_id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1f419a] to-[#2a44a3] flex items-center justify-center text-white font-bold text-sm">
                        {p.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm">
                          {p.name}
                        </p>
                        <p className="text-xs text-gray-500">{p.email}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full ${
                            p.role === "guest"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-purple-50 text-purple-700"
                          }`}
                        >
                          {p.role}
                        </span>
                        <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                          {p.tier}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Post-Meeting Responses */}
              {selectedInvestigation.responses.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">
                    Post-Meeting Responses (Yes/No)
                  </h4>
                  <div className="space-y-2">
                    {selectedInvestigation.responses.map((r) => {
                      const participant = selectedInvestigation.participants.find(
                        (p) => p.user_id === r.user_id
                      );
                      return (
                        <div
                          key={r.user_id}
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                        >
                          {r.response === "yes" ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          <span className="text-sm font-medium text-gray-900">
                            {participant?.name || r.user_id.slice(0, 8)}
                          </span>
                          <span className="text-sm text-gray-500 capitalize">
                            {r.response}
                          </span>
                          {r.signed_at && (
                            <span className="text-xs text-gray-400 ml-auto">
                              Signed: {new Date(r.signed_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Host Notes */}
              {selectedInvestigation.host_notes && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">
                    Host Notes
                  </h4>
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-gray-700">
                    {selectedInvestigation.host_notes}
                  </div>
                </div>
              )}

              {/* Resolution */}
              <div className="border-t border-gray-200 pt-5">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  Admin Resolution
                </h4>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Resolution Decision
                  </label>
                  <select
                    value={resolution}
                    onChange={(e) =>
                      setResolution(e.target.value as Resolution)
                    }
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                  >
                    <option value="charge_requester">
                      Charge Requester (Guest) — Normal
                    </option>
                    <option value="refund_requester">
                      Refund Requester (Guest) — Accepter at Fault
                    </option>
                    <option value="charge_accepter">
                      Charge Accepter (Host) — Reverse Charges
                    </option>
                    <option value="no_charge">
                      No Charge — Full Refund
                    </option>
                    <option value="split">
                      Split Responsibility — No Refund
                    </option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {resolutionHelp[resolution]}
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Admin Notes / Investigation Findings
                  </label>
                  <textarea
                    value={resolveNotes}
                    onChange={(e) => setResolveNotes(e.target.value)}
                    placeholder="Describe your investigation findings, evidence reviewed, and reason for this resolution..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none resize-none h-28"
                  />
                </div>

                {/* Preview notice sent to users */}
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm mb-4">
                  <p className="font-medium text-blue-800 mb-1">
                    Notification Preview
                  </p>
                  <p className="text-blue-700 text-xs">
                    Both participants will receive an in-app notification
                    informing them of the investigation outcome. The
                    notification will include whether a refund was issued or
                    charges applied.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setSelectedInvestigation(null);
                    setResolveNotes("");
                    setResolution("charge_requester");
                  }}
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResolveInvestigation}
                  disabled={resolving}
                  className="flex-1 py-2.5 rounded-lg bg-[#1f419a] text-white hover:bg-[#17357b] font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {resolving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4" />
                  )}
                  {resolving ? "Resolving..." : "Resolve Investigation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
