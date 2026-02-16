"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  FileText,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  User,
  Clock,
  RefreshCw,
  Eye,
  Calendar,
  AlertCircle,
  Shield,
  Ban,
  CheckCircle,
  DollarSign,
  Image as ImageIcon,
  Flag,
  X,
} from "lucide-react";

/**
 * Admin log entry type
 */
type AdminLog = {
  id: number;
  admin_id: string;
  target_user_id: string | null;
  action: string;
  meta: any;
  created_at: string;
  admin: {
    email: string;
    display_name: string | null;
  } | null;
  target_user: {
    email: string;
    display_name: string | null;
  } | null;
};

/**
 * AdminLogsPage - Admin activity logs and audit trail
 * 
 * Features:
 * - View all admin actions
 * - Filter by action type, admin, date range
 * - Search functionality
 * - Detailed log view
 */
export default function AdminLogsPage() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [selectedLog, setSelectedLog] = useState<AdminLog | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const pageSize = 20;
  const totalPages = Math.ceil(totalLogs / pageSize);

  /**
   * Get date range for filter
   */
  const getDateRange = () => {
    const now = new Date();
    switch (dateFilter) {
      case "today":
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        return { from: today.toISOString(), to: now.toISOString() };
      case "week":
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { from: weekAgo.toISOString(), to: now.toISOString() };
      case "month":
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return { from: monthAgo.toISOString(), to: now.toISOString() };
      default:
        return null;
    }
  };

  /**
   * Fetch admin logs
   */
  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Fetch logs with admin info (we'll get target user info separately if needed)
      let query = supabase
        .from("admin_logs")
        .select(`
          id,
          admin_id,
          target_user_id,
          action,
          meta,
          created_at,
          accounts!admin_logs_admin_id_fkey (
            email,
            display_name
          )
        `, { count: "exact" });

      // Apply action filter
      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }

      // Apply date filter
      const dateRange = getDateRange();
      if (dateRange) {
        query = query
          .gte("created_at", dateRange.from)
          .lte("created_at", dateRange.to);
      }

      // Apply search
      if (searchQuery) {
        // Search in action field or meta JSON
        query = query.or(`action.ilike.%${searchQuery}%`);
      }

      // Apply pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query
        .order("created_at", { ascending: false })
        .range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error("Error fetching logs:", error);
        return;
      }

      // Fetch target user data separately for logs that have target_user_id
      const targetUserIds = (data || [])
        .map((log: any) => log.target_user_id)
        .filter((id: string | null) => id !== null) as string[];
      
      let targetUsers: Record<string, any> = {};
      if (targetUserIds.length > 0) {
        const { data: targetUserData } = await supabase
          .from("accounts")
          .select("id, email, display_name")
          .in("id", targetUserIds);
        
        if (targetUserData) {
          targetUsers = targetUserData.reduce((acc: Record<string, any>, user: any) => {
            acc[user.id] = user;
            return acc;
          }, {});
        }
      }

      const transformedLogs: AdminLog[] = (data || []).map((log: any) => ({
        id: log.id,
        admin_id: log.admin_id,
        target_user_id: log.target_user_id,
        action: log.action,
        meta: log.meta,
        created_at: log.created_at,
        admin: Array.isArray(log.accounts) ? log.accounts[0] : log.accounts,
        target_user: log.target_user_id ? targetUsers[log.target_user_id] || null : null,
      }));

      setLogs(transformedLogs);
      setTotalLogs(count || 0);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, dateFilter, currentPage]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchLogs();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /**
   * Get action icon
   */
  const getActionIcon = (action: string) => {
    if (action.includes("user_")) {
      if (action.includes("ban")) return <Ban className="h-4 w-4" />;
      if (action.includes("suspend")) return <AlertCircle className="h-4 w-4" />;
      if (action.includes("activate")) return <CheckCircle className="h-4 w-4" />;
      return <User className="h-4 w-4" />;
    }
    if (action.includes("photo_")) return <ImageIcon className="h-4 w-4" />;
    if (action.includes("report_")) return <Flag className="h-4 w-4" />;
    if (action.includes("pricing")) return <DollarSign className="h-4 w-4" />;
    if (action.includes("credits")) return <DollarSign className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  /**
   * Get action color
   */
  const getActionColor = (action: string) => {
    if (action.includes("ban")) return "text-red-600 bg-red-50";
    if (action.includes("suspend")) return "text-amber-600 bg-amber-50";
    if (action.includes("activate") || action.includes("approved")) return "text-green-600 bg-green-50";
    if (action.includes("rejected") || action.includes("dismissed")) return "text-red-600 bg-red-50";
    return "text-blue-600 bg-blue-50";
  };

  /**
   * Format action name
   */
  const formatAction = (action: string) => {
    return action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l: string) => l.toUpperCase());
  };

  /**
   * Get unique action types for filter
   */
  const getActionTypes = () => {
    const actions = new Set<string>();
    logs.forEach(log => actions.add(log.action));
    return Array.from(actions).sort();
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
          <p className="text-gray-500">{totalLogs.toLocaleString()} total log entries</p>
        </div>
        <button
          onClick={() => fetchLogs()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search actions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
              showFilters
                ? "border-[#1f419a] bg-[#1f419a]/10 text-[#1f419a]"
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Filter className="h-5 w-5" />
            Filters
          </button>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
            {/* Action Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Action Type</label>
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
              >
                <option value="all">All Actions</option>
                {getActionTypes().map((action) => (
                  <option key={action} value={action}>
                    {formatAction(action)}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No logs found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Admin
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Target
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${getActionColor(log.action)}`}>
                          {getActionIcon(log.action)}
                          {formatAction(log.action)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                            <Shield className="h-4 w-4 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {log.admin?.display_name || log.admin?.email || "Unknown"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {log.target_user ? (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                              <User className="h-4 w-4 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {log.target_user.display_name || log.target_user.email || "Unknown"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600 max-w-xs truncate">
                          {log.meta && typeof log.meta === "object" ? (
                            <span>
                              {log.meta.reason || log.meta.new_status || log.meta.adjustment || "—"}
                            </span>
                          ) : (
                            <span>—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Clock className="h-4 w-4" />
                          <span>{new Date(log.created_at).toLocaleDateString()}</span>
                          <span className="text-gray-400">•</span>
                          <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <Eye className="h-4 w-4 text-gray-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Showing {(currentPage - 1) * pageSize + 1} to{" "}
                  {Math.min(currentPage * pageSize, totalLogs)} of {totalLogs}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Log Details</h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              {/* Action Info */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${getActionColor(selectedLog.action)}`}>
                    {getActionIcon(selectedLog.action)}
                    {formatAction(selectedLog.action)}
                  </div>
                </div>

                {/* Admin Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Admin</label>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <Shield className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {selectedLog.admin?.display_name || selectedLog.admin?.email || "Unknown"}
                        </p>
                        <p className="text-xs text-gray-500">{selectedLog.admin_id}</p>
                      </div>
                    </div>
                  </div>

                  {/* Target User */}
                  {selectedLog.target_user && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Target User</label>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {selectedLog.target_user.display_name || selectedLog.target_user.email || "Unknown"}
                          </p>
                          <Link
                            href={`/admin/users/${selectedLog.target_user_id}`}
                            className="text-xs text-[#1f419a] hover:underline"
                          >
                            View User →
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Timestamp</label>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Calendar className="h-4 w-4" />
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </div>
                </div>

                {/* Metadata */}
                {selectedLog.meta && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Details</label>
                    <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                        {JSON.stringify(selectedLog.meta, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Log ID */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Log ID</label>
                  <p className="text-sm text-gray-700 font-mono">{selectedLog.id}</p>
                </div>
              </div>

              {/* Close Button */}
              <div className="mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="w-full py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
