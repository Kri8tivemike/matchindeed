"use client";

/**
 * AdminReactivationPage - Profile Reactivation Management
 *
 * Features:
 * - Display all pending reactivation requests with pagination
 * - Show user info, match partner info, and reason for request
 * - Approve/Deny buttons with admin notes
 * - Approval/denial email notifications
 * - History of approved/denied requests with decision details
 * - Filter by status and date range
 */

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import {
  RotateCcw,
  UserCheck,
  UserX,
  Mail,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Eye,
  Search,
  Filter,
  Download,
  AlertCircle,
} from "lucide-react";

type ReactivationRequest = {
  id: string;
  user_id: string;
  matched_with_user_id: string;
  reason_code: number | null;
  reason_text: string | null;
  status: string;
  partner_response_code: number | null;
  partner_response_text: string | null;
  admin_decision: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  user: {
    email: string;
    display_name: string | null;
  } | null;
  matched_user: {
    email: string;
    display_name: string | null;
  } | null;
};

const REACTIVATION_REASONS: Record<number, string> = {
  1: "The match didn't work out",
  2: "They ghosted or stopped responding",
  3: "Mutual decision to part ways",
  4: "The relationship ended",
  5: "Keeping options open early on",
  6: "Want to explore more options",
  7: "Starting fresh on the platform",
};

const STATUS_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  pending: {
    bg: "bg-yellow-50",
    text: "text-yellow-900",
    badge: "bg-yellow-200 text-yellow-800",
  },
  partner_notified: {
    bg: "bg-blue-50",
    text: "text-blue-900",
    badge: "bg-blue-200 text-blue-800",
  },
  approved: {
    bg: "bg-green-50",
    text: "text-green-900",
    badge: "bg-green-200 text-green-800",
  },
  rejected: {
    bg: "bg-red-50",
    text: "text-red-900",
    badge: "bg-red-200 text-red-800",
  },
};

export default function AdminReactivationPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<ReactivationRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<ReactivationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ReactivationRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profile_reactivation_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error:", error);
        toast.error("Failed to load reactivation requests");
        return;
      }

      // Fetch user data
      const userIds = new Set<string>();
      (data || []).forEach((req: any) => {
        userIds.add(req.user_id);
        userIds.add(req.matched_with_user_id);
      });

      let userMap: Record<string, any> = {};
      if (userIds.size > 0) {
        const { data: usersData } = await supabase
          .from("accounts")
          .select("id, email, display_name")
          .in("id", Array.from(userIds));

        if (usersData) {
          userMap = usersData.reduce((acc: Record<string, any>, u: any) => {
            acc[u.id] = u;
            return acc;
          }, {});
        }
      }

      const transformed = (data || []).map((req: any) => ({
        ...req,
        user: userMap[req.user_id] || null,
        matched_user: userMap[req.matched_with_user_id] || null,
      }));

      setRequests(transformed);
      applyFilters(transformed, searchTerm, filterStatus);
    } catch (error) {
      console.error("Error:", error);
      toast.error("An error occurred while loading requests");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (
    data: ReactivationRequest[],
    search: string,
    status: string
  ) => {
    let filtered = data;

    if (status !== "all") {
      filtered = filtered.filter((r) => r.status === status);
    }

    if (search) {
      filtered = filtered.filter(
        (r) =>
          r.user?.email.toLowerCase().includes(search.toLowerCase()) ||
          r.user?.display_name?.toLowerCase().includes(search.toLowerCase()) ||
          r.matched_user?.email.toLowerCase().includes(search.toLowerCase()) ||
          r.matched_user?.display_name?.toLowerCase().includes(search.toLowerCase())
      );
    }

    setFilteredRequests(filtered);
    setCurrentPage(1);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    applyFilters(requests, searchTerm, filterStatus);
  }, [searchTerm, filterStatus, requests]);

  const handleDecision = async () => {
    if (!selectedRequest) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Update request status
      const { error: updateError } = await supabase
        .from("profile_reactivation_requests")
        .update({
          status: decision === "approved" ? "approved" : "rejected",
          admin_decision: decision,
          admin_notes: adminNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedRequest.id);

      if (updateError) throw updateError;

      // If approved, reactivate profile
      if (decision === "approved") {
        const { error: activateError } = await supabase
          .from("accounts")
          .update({ account_status: "active" })
          .eq("id", selectedRequest.user_id);

        if (activateError) throw activateError;
      }

      // Log admin action
      if (user) {
        await supabase.from("admin_logs").insert({
          admin_id: user.id,
          target_user_id: selectedRequest.user_id,
          action: `profile_reactivation_${decision}`,
          meta: { request_id: selectedRequest.id, decision, notes: adminNotes },
        });
      }

      // Send email notification
      await fetch("/api/reactivation/send-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: selectedRequest.id,
          userId: selectedRequest.user_id,
          decision: decision,
          notes: adminNotes,
        }),
      });

      setSelectedRequest(null);
      setAdminNotes("");
      setDecision("approved");
      fetchRequests();
      toast.success(`Profile reactivation ${decision}!`);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to process decision");
    } finally {
      setIsSubmitting(false);
    }
  };

  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Profile Reactivation</h1>
          <p className="text-gray-500 mt-1">Review and manage profile reactivation requests</p>
        </div>
        <button
          onClick={() => fetchRequests()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-medium">Pending</p>
              <p className="text-2xl font-bold text-yellow-900 mt-1">{pendingCount}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-yellow-500" />
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Partner Notified</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">
                {requests.filter((r) => r.status === "partner_notified").length}
              </p>
            </div>
            <Mail className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Approved</p>
              <p className="text-2xl font-bold text-green-900 mt-1">{approvedCount}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </div>
        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium">Rejected</p>
              <p className="text-2xl font-bold text-red-900 mt-1">{rejectedCount}</p>
            </div>
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="partner_notified">Partner Notified</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Loading reactivation requests...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No reactivation requests found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedRequests.map((request) => (
            <div
              key={request.id}
              className={`${STATUS_COLORS[request.status]?.bg || "bg-white"} rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <p className="font-semibold text-gray-900">
                      {request.user?.display_name || request.user?.email}
                    </p>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        STATUS_COLORS[request.status]?.badge || "bg-gray-200 text-gray-800"
                      }`}
                    >
                      {request.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">Matched with:</span>{" "}
                    {request.matched_user?.display_name || request.matched_user?.email}
                  </p>
                  <p className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">Reason:</span>{" "}
                    {request.reason_code ? REACTIVATION_REASONS[request.reason_code] : request.reason_text}
                  </p>
                  {request.admin_notes && (
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">Admin Notes:</span> {request.admin_notes}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    Submitted {new Date(request.created_at).toLocaleDateString()}
                    {request.updated_at && ` • Updated ${new Date(request.updated_at).toLocaleDateString()}`}
                  </p>
                </div>
                {request.status === "pending" || request.status === "partner_notified" ? (
                  <button
                    onClick={() => setSelectedRequest(request)}
                    className="px-4 py-2 rounded-lg bg-[#1f419a] text-white hover:bg-[#17357b] font-medium whitespace-nowrap"
                  >
                    Review
                  </button>
                ) : (
                  <button
                    onClick={() => setSelectedRequest(request)}
                    className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 font-medium whitespace-nowrap"
                  >
                    View Details
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-gray-600">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                {Math.min(currentPage * itemsPerPage, filteredRequests.length)} of{" "}
                {filteredRequests.length} requests
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-2 rounded-lg font-medium ${
                      currentPage === page
                        ? "bg-[#1f419a] text-white"
                        : "border border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-6">Review Reactivation Request</h3>

            <div className="space-y-6">
              {/* User Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">User Information</h4>
                <p className="text-sm text-gray-600 mb-1">
                  <span className="font-medium">Name:</span> {selectedRequest.user?.display_name || "N/A"}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <span className="font-medium">Email:</span> {selectedRequest.user?.email}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Status:</span> {selectedRequest.status.replace("_", " ")}
                </p>
              </div>

              {/* Partner Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Match Partner Information</h4>
                <p className="text-sm text-gray-600 mb-1">
                  <span className="font-medium">Name:</span>{" "}
                  {selectedRequest.matched_user?.display_name || "N/A"}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Email:</span> {selectedRequest.matched_user?.email}
                </p>
              </div>

              {/* User Request */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  User's Request Reason
                </label>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-gray-700">
                    {selectedRequest.reason_text ||
                      REACTIVATION_REASONS[selectedRequest.reason_code || 0] ||
                      "No reason provided"}
                  </p>
                </div>
              </div>

              {/* Partner Response */}
              {selectedRequest.partner_response_text && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    Partner Response
                  </label>
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-gray-700">{selectedRequest.partner_response_text}</p>
                  </div>
                </div>
              )}

              {/* Only show decision controls if not already decided */}
              {selectedRequest.status === "pending" || selectedRequest.status === "partner_notified" ? (
                <>
                  {/* Decision */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">Decision</label>
                    <select
                      value={decision}
                      onChange={(e) => setDecision(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                    >
                      <option value="approved">✓ Approve Reactivation</option>
                      <option value="rejected">✗ Reject Reactivation</option>
                    </select>
                  </div>

                  {/* Admin Notes */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">Admin Notes</label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add notes about your decision (optional)..."
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none h-24"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setSelectedRequest(null)}
                      className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDecision}
                      disabled={isSubmitting}
                      className="flex-1 py-2 rounded-lg bg-[#1f419a] text-white hover:bg-[#17357b] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {decision === "approved" ? "Approve" : "Reject"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* View-only decision info */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Decision</h4>
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">Decision:</span>{" "}
                      <span
                        className={`font-semibold ${
                          selectedRequest.admin_decision === "approved"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {selectedRequest.admin_decision === "approved"
                          ? "Approved"
                          : "Rejected"}
                      </span>
                    </p>
                    {selectedRequest.admin_notes && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Notes:</span> {selectedRequest.admin_notes}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedRequest(null)}
                    className="w-full py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 font-medium"
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
