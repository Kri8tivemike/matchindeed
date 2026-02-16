"use client";

/**
 * AdminReportsPage — Enhanced User Reports Management
 *
 * Features:
 * - Stats overview cards (pending, urgent, resolved, total)
 * - Status & priority filter tabs
 * - Search by reporter/reported user name or email
 * - Report list with priority indicators
 * - Review modal with:
 *   - Resolution notes
 *   - Warn / Suspend / Ban actions
 *   - Dismiss / Resolve buttons
 *   - Email notification on resolution
 * - Pagination
 */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  AlertTriangle,
  AlertCircle,
  Check,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  Eye,
  RefreshCw,
  Flag,
  Shield,
  Ban,
  MessageSquare,
  Search,
  TrendingUp,
  FileWarning,
  CheckCircle,
  XCircle,
} from "lucide-react";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type ReportItem = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  description: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: "pending" | "reviewing" | "resolved" | "dismissed";
  resolution: string | null;
  created_at: string;
  reporter: {
    email: string;
    display_name: string | null;
  } | null;
  reported_user: {
    email: string;
    display_name: string | null;
    account_status: string;
  } | null;
};

type ReportStats = {
  total: number;
  pending: number;
  reviewing: number;
  resolved: number;
  dismissed: number;
  urgent: number;
};

// ---------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------

export default function AdminReportsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "reviewing" | "resolved" | "dismissed" | "all"
  >("pending");
  const [priorityFilter, setPriorityFilter] = useState<
    "low" | "normal" | "high" | "urgent" | "all"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [resolution, setResolution] = useState("");
  const [stats, setStats] = useState<ReportStats>({
    total: 0,
    pending: 0,
    reviewing: 0,
    resolved: 0,
    dismissed: 0,
    urgent: 0,
  });

  const pageSize = 10;
  const totalPages = Math.ceil(totalItems / pageSize);

  /**
   * Fetch report statistics
   */
  const fetchStats = useCallback(async () => {
    try {
      const [total, pending, reviewing, resolved, dismissed, urgent] =
        await Promise.all([
          supabase
            .from("user_reports")
            .select("*", { count: "exact", head: true }),
          supabase
            .from("user_reports")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending"),
          supabase
            .from("user_reports")
            .select("*", { count: "exact", head: true })
            .eq("status", "reviewing"),
          supabase
            .from("user_reports")
            .select("*", { count: "exact", head: true })
            .eq("status", "resolved"),
          supabase
            .from("user_reports")
            .select("*", { count: "exact", head: true })
            .eq("status", "dismissed"),
          supabase
            .from("user_reports")
            .select("*", { count: "exact", head: true })
            .eq("priority", "urgent")
            .eq("status", "pending"),
        ]);

      setStats({
        total: total.count || 0,
        pending: pending.count || 0,
        reviewing: reviewing.count || 0,
        resolved: resolved.count || 0,
        dismissed: dismissed.count || 0,
        urgent: urgent.count || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  /**
   * Fetch reports with filtering and pagination
   */
  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("user_reports")
        .select(
          `
          id,
          reporter_id,
          reported_user_id,
          reason,
          description,
          priority,
          status,
          resolution,
          created_at,
          reporter:reporter_id (
            email,
            display_name
          ),
          reported_user:reported_user_id (
            email,
            display_name,
            account_status
          )
        `,
          { count: "exact" }
        );

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (priorityFilter !== "all") {
        query = query.eq("priority", priorityFilter);
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query
        .order("created_at", { ascending: false })
        .range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error("Error fetching reports:", error);
        return;
      }

      let transformedData: ReportItem[] = (data || []).map((item: any) => ({
        id: item.id,
        reporter_id: item.reporter_id,
        reported_user_id: item.reported_user_id,
        reason: item.reason,
        description: item.description,
        priority: item.priority,
        status: item.status,
        resolution: item.resolution,
        created_at: item.created_at,
        reporter: item.reporter,
        reported_user: item.reported_user,
      }));

      // Client-side search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        transformedData = transformedData.filter(
          (r) =>
            r.reported_user?.display_name?.toLowerCase().includes(q) ||
            r.reported_user?.email?.toLowerCase().includes(q) ||
            r.reporter?.display_name?.toLowerCase().includes(q) ||
            r.reporter?.email?.toLowerCase().includes(q) ||
            r.reason.toLowerCase().includes(q)
        );
      }

      // Sort by priority locally (urgent first)
      transformedData.sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      setReports(transformedData);
      setTotalItems(count || 0);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, currentPage, searchQuery]);

  useEffect(() => {
    fetchReports();
    fetchStats();
  }, [fetchReports, fetchStats]);

  /**
   * Update report status and optionally send notification
   */
  const updateReportStatus = async (
    reportId: string,
    newStatus: string,
    resolutionText?: string
  ) => {
    setActionLoading(reportId);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const updateData: Record<string, any> = {
        status: newStatus,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      };

      if (resolutionText) {
        updateData.resolution = resolutionText;
      }

      const { error } = await supabase
        .from("user_reports")
        .update(updateData)
        .eq("id", reportId);

      if (error) throw error;

      // Log admin action
      if (user) {
        await supabase.from("admin_logs").insert({
          admin_id: user.id,
          action: `report_${newStatus}`,
          meta: { report_id: reportId, resolution: resolutionText },
        });
      }

      // Send notification to the reporter about the resolution
      const report = reports.find((r) => r.id === reportId);
      if (report && (newStatus === "resolved" || newStatus === "dismissed")) {
        await supabase.from("notifications").insert({
          user_id: report.reporter_id,
          type: "report_update",
          title: "Report Update",
          message:
            newStatus === "resolved"
              ? "Your report has been reviewed and action was taken. Thank you for keeping our community safe."
              : "Your report has been reviewed. After investigation, no action was required at this time.",
          data: {
            report_id: reportId,
            status: newStatus,
            resolution: resolutionText,
          },
        });
      }

      fetchReports();
      fetchStats();
      setSelectedReport(null);
      setResolution("");
    } catch (error) {
      console.error("Error updating report:", error);
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Take action on a reported user (warn, suspend, ban)
   */
  const takeAction = async (
    userId: string,
    action: "warn" | "suspend" | "ban"
  ) => {
    const report = selectedReport;
    if (!report) return;

    setActionLoading(report.id);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let newAccountStatus: string;
      switch (action) {
        case "suspend":
          newAccountStatus = "suspended";
          break;
        case "ban":
          newAccountStatus = "banned";
          break;
        default:
          newAccountStatus = "";
      }

      // Update account status for suspend/ban
      if (newAccountStatus) {
        const { error } = await supabase
          .from("accounts")
          .update({
            account_status: newAccountStatus,
            suspension_reason: `Action taken from report: ${report.reason}`,
          })
          .eq("id", userId);

        if (error) throw error;
      }

      // Log admin action
      if (user) {
        await supabase.from("admin_logs").insert({
          admin_id: user.id,
          target_user_id: userId,
          action: `user_${action}`,
          meta: { report_id: report.id, reason: report.reason },
        });
      }

      // Send notification to the reported user
      const actionLabels: Record<string, string> = {
        warn: "Your account has received a warning due to a policy violation. Please review our community guidelines.",
        suspend:
          "Your account has been temporarily suspended due to a policy violation. Contact support for more information.",
        ban: "Your account has been permanently banned due to repeated or serious policy violations.",
      };

      await supabase.from("notifications").insert({
        user_id: userId,
        type: "account_action",
        title:
          action === "warn"
            ? "Account Warning"
            : action === "suspend"
              ? "Account Suspended"
              : "Account Banned",
        message: actionLabels[action],
        data: {
          action,
          report_id: report.id,
        },
      });

      // Resolve the report
      const actionText =
        action === "warn"
          ? "warned"
          : action === "suspend"
            ? "suspended"
            : "banned";
      await updateReportStatus(
        report.id,
        "resolved",
        resolution.trim() || `User ${actionText}`
      );
    } catch (error) {
      console.error("Error taking action:", error);
      setActionLoading(null);
    }
  };

  /**
   * Get priority badge styling
   */
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-700";
      case "high":
        return "bg-orange-100 text-orange-700";
      case "normal":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  /**
   * Get status badge styling
   */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "resolved":
        return "bg-green-100 text-green-700";
      case "reviewing":
        return "bg-amber-100 text-amber-700";
      case "dismissed":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-blue-100 text-blue-700";
    }
  };

  /**
   * Format reason for display
   */
  const formatReason = (reason: string) => {
    return reason
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l: string) => l.toUpperCase());
  };

  /**
   * Time ago helper
   */
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Flag className="h-6 w-6 text-red-500" />
            User Reports
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage and resolve user reports
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            fetchReports();
            fetchStats();
          }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 text-sm"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase">Total</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div
          className={`rounded-xl p-4 shadow-sm border cursor-pointer transition ${
            statusFilter === "pending"
              ? "bg-blue-50 border-blue-200"
              : "bg-white border-gray-100 hover:bg-gray-50"
          }`}
          onClick={() => {
            setStatusFilter("pending");
            setCurrentPage(1);
          }}
        >
          <p className="text-xs font-medium text-blue-600 uppercase">
            Pending
          </p>
          <p className="text-xl font-bold text-blue-700 mt-1">
            {stats.pending}
          </p>
        </div>
        <div
          className={`rounded-xl p-4 shadow-sm border cursor-pointer transition ${
            statusFilter === "reviewing"
              ? "bg-amber-50 border-amber-200"
              : "bg-white border-gray-100 hover:bg-gray-50"
          }`}
          onClick={() => {
            setStatusFilter("reviewing");
            setCurrentPage(1);
          }}
        >
          <p className="text-xs font-medium text-amber-600 uppercase">
            Reviewing
          </p>
          <p className="text-xl font-bold text-amber-700 mt-1">
            {stats.reviewing}
          </p>
        </div>
        <div
          className={`rounded-xl p-4 shadow-sm border cursor-pointer transition ${
            statusFilter === "resolved"
              ? "bg-emerald-50 border-emerald-200"
              : "bg-white border-gray-100 hover:bg-gray-50"
          }`}
          onClick={() => {
            setStatusFilter("resolved");
            setCurrentPage(1);
          }}
        >
          <p className="text-xs font-medium text-emerald-600 uppercase">
            Resolved
          </p>
          <p className="text-xl font-bold text-emerald-700 mt-1">
            {stats.resolved}
          </p>
        </div>
        <div
          className={`rounded-xl p-4 shadow-sm border cursor-pointer transition ${
            statusFilter === "dismissed"
              ? "bg-gray-100 border-gray-300"
              : "bg-white border-gray-100 hover:bg-gray-50"
          }`}
          onClick={() => {
            setStatusFilter("dismissed");
            setCurrentPage(1);
          }}
        >
          <p className="text-xs font-medium text-gray-500 uppercase">
            Dismissed
          </p>
          <p className="text-xl font-bold text-gray-700 mt-1">
            {stats.dismissed}
          </p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 shadow-sm border border-red-200">
          <p className="text-xs font-medium text-red-600 uppercase">
            Urgent
          </p>
          <p className="text-xl font-bold text-red-700 mt-1">
            {stats.urgent}
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by name, email, or reason..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#1f419a] outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="flex flex-wrap gap-1.5">
            {(
              ["all", "pending", "reviewing", "resolved", "dismissed"] as const
            ).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatusFilter(s);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  statusFilter === s
                    ? "bg-[#1f419a] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Priority Filter */}
          <div className="flex flex-wrap gap-1.5">
            {(["all", "urgent", "high", "normal", "low"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPriorityFilter(p);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  priorityFilter === p
                    ? "bg-[#1f419a] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
          <CheckCircle className="h-12 w-12 text-emerald-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No reports found</p>
          <p className="text-sm text-gray-400 mt-1">
            {statusFilter !== "all"
              ? `No ${statusFilter} reports`
              : "All clear!"}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className={`bg-white rounded-xl p-5 shadow-sm border transition hover:shadow-md ${
                  report.priority === "urgent"
                    ? "border-red-200 bg-red-50/30"
                    : report.priority === "high"
                      ? "border-orange-200 bg-orange-50/30"
                      : "border-gray-100"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Report Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getPriorityBadge(report.priority)}`}
                      >
                        {report.priority}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusBadge(report.status)}`}
                      >
                        {report.status}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                        {formatReason(report.reason)}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {timeAgo(report.created_at)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      {/* Reported User */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                            Reported
                          </p>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {report.reported_user?.display_name ||
                              report.reported_user?.email ||
                              "Unknown"}
                          </p>
                          {report.reported_user?.account_status &&
                            report.reported_user.account_status !== "active" && (
                              <span className="text-[10px] text-amber-600 font-medium">
                                ({report.reported_user.account_status})
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Reporter */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                            Reported By
                          </p>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {report.reporter?.display_name ||
                              report.reporter?.email ||
                              "Unknown"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {report.description && (
                      <div className="p-2.5 rounded-lg bg-gray-50 text-xs text-gray-600 mb-2">
                        <MessageSquare className="h-3.5 w-3.5 inline-block mr-1.5 text-gray-400" />
                        {report.description}
                      </div>
                    )}

                    {report.resolution && (
                      <div className="p-2.5 rounded-lg bg-green-50 text-xs text-green-700">
                        <Check className="h-3.5 w-3.5 inline-block mr-1.5" />
                        <strong>Resolution:</strong> {report.resolution}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-row md:flex-col gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedReport(report)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium transition"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Review
                    </button>
                    {report.status === "pending" && (
                      <button
                        type="button"
                        onClick={() =>
                          updateReportStatus(report.id, "reviewing")
                        }
                        disabled={actionLoading === report.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-medium transition disabled:opacity-50"
                      >
                        <Shield className="h-3.5 w-3.5" />
                        Start Review
                      </button>
                    )}
                    <Link
                      href={`/admin/users/${report.reported_user_id}`}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-medium transition"
                    >
                      <User className="h-3.5 w-3.5" />
                      View User
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Page {currentPage} of {totalPages} · {totalItems} reports
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage(Math.max(1, currentPage - 1))
                  }
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage(Math.min(totalPages, currentPage + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Review Modal ────────────────────────────────────── */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <FileWarning className="h-5 w-5 text-red-500" />
                  Review Report
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReport(null);
                    setResolution("");
                  }}
                  className="p-1 rounded-lg hover:bg-gray-100 transition"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              {/* Report Details */}
              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${getPriorityBadge(selectedReport.priority)}`}
                  >
                    {selectedReport.priority}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${getStatusBadge(selectedReport.status)}`}
                  >
                    {selectedReport.status}
                  </span>
                  <span className="text-sm text-gray-600 ml-1">
                    {formatReason(selectedReport.reason)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-red-50 rounded-lg p-3">
                    <p className="text-[10px] text-red-500 uppercase font-medium mb-1">
                      Reported User
                    </p>
                    <p className="font-medium text-gray-900 text-sm">
                      {selectedReport.reported_user?.display_name ||
                        selectedReport.reported_user?.email}
                    </p>
                    {selectedReport.reported_user?.account_status &&
                      selectedReport.reported_user.account_status !==
                        "active" && (
                        <span className="text-[10px] text-amber-600 font-medium mt-0.5 block">
                          Status: {selectedReport.reported_user.account_status}
                        </span>
                      )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">
                      Reporter
                    </p>
                    <p className="font-medium text-gray-900 text-sm">
                      {selectedReport.reporter?.display_name ||
                        selectedReport.reporter?.email}
                    </p>
                  </div>
                </div>

                {selectedReport.description && (
                  <div className="p-3 rounded-lg bg-gray-50 text-sm text-gray-700">
                    <p className="text-[10px] text-gray-400 uppercase font-medium mb-1">
                      Description
                    </p>
                    {selectedReport.description}
                  </div>
                )}

                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Reported{" "}
                  {new Date(selectedReport.created_at).toLocaleDateString()} at{" "}
                  {new Date(selectedReport.created_at).toLocaleTimeString()}
                </p>
              </div>

              {/* Resolution Area (only if not already resolved/dismissed) */}
              {selectedReport.status !== "resolved" &&
                selectedReport.status !== "dismissed" && (
                  <>
                    <div className="mb-5">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Resolution Notes
                      </label>
                      <textarea
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        placeholder="Describe the action taken or reason for dismissal..."
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none resize-none h-24 text-sm"
                      />
                    </div>

                    {/* User Actions */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Take Action on User
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            takeAction(
                              selectedReport.reported_user_id,
                              "warn"
                            )
                          }
                          disabled={actionLoading === selectedReport.id}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 text-sm font-medium transition disabled:opacity-50"
                        >
                          <AlertCircle className="h-4 w-4" />
                          Warn
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            takeAction(
                              selectedReport.reported_user_id,
                              "suspend"
                            )
                          }
                          disabled={actionLoading === selectedReport.id}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 text-sm font-medium transition disabled:opacity-50"
                        >
                          <AlertTriangle className="h-4 w-4" />
                          Suspend
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            takeAction(
                              selectedReport.reported_user_id,
                              "ban"
                            )
                          }
                          disabled={actionLoading === selectedReport.id}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-sm font-medium transition disabled:opacity-50"
                        >
                          <Ban className="h-4 w-4" />
                          Ban
                        </button>
                      </div>

                      <div className="flex gap-2 pt-4 border-t border-gray-100">
                        <button
                          type="button"
                          onClick={() =>
                            updateReportStatus(
                              selectedReport.id,
                              "dismissed",
                              resolution
                            )
                          }
                          disabled={actionLoading === selectedReport.id}
                          className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <XCircle className="h-4 w-4" />
                          Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateReportStatus(
                              selectedReport.id,
                              "resolved",
                              resolution
                            )
                          }
                          disabled={
                            actionLoading === selectedReport.id ||
                            !resolution.trim()
                          }
                          className="flex-1 py-2.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {actionLoading === selectedReport.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          Mark Resolved
                        </button>
                      </div>
                    </div>
                  </>
                )}

              {/* Already resolved/dismissed */}
              {(selectedReport.status === "resolved" ||
                selectedReport.status === "dismissed") && (
                <>
                  {selectedReport.resolution && (
                    <div className="p-3 rounded-lg bg-green-50 text-sm text-green-700 mb-4">
                      <Check className="h-4 w-4 inline-block mr-2" />
                      <strong>Resolution:</strong> {selectedReport.resolution}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedReport(null)}
                    className="w-full py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium transition"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
