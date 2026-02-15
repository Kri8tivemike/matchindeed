"use client";

/**
 * AdminReactivationPage - Profile Reactivation Management
 * 
 * Features per client request:
 * - Review profile reactivation requests
 * - Verify both parties' responses
 * - Check if partner is aware of reactivation request
 * - Approve or reject reactivation requests
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
  // ... more reasons from client request
};

export default function AdminReactivationPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<ReactivationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ReactivationRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");

  const fetchRequests = async () => {
    setLoading(true);
    try {
      // Fetch reactivation requests
      const { data, error } = await supabase
        .from("profile_reactivation_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error:", error);
        return;
      }

      // Fetch user data separately to avoid duplicate table name issue
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
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApprove = async () => {
    if (!selectedRequest) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Update request
      await supabase
        .from("profile_reactivation_requests")
        .update({
          status: "approved",
          admin_decision: decision,
          admin_notes: adminNotes,
        })
        .eq("id", selectedRequest.id);

      // Reactivate profile
      await supabase
        .from("accounts")
        .update({ account_status: "active" })
        .eq("id", selectedRequest.user_id);

      // Log action
      if (user) {
        await supabase.from("admin_logs").insert({
          admin_id: user.id,
          target_user_id: selectedRequest.user_id,
          action: "profile_reactivated",
          meta: { request_id: selectedRequest.id, decision },
        });
      }

      setSelectedRequest(null);
      fetchRequests();
      toast.success("Profile reactivation approved!");
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const pendingRequests = requests.filter(r => r.status === "pending" || r.status === "partner_notified");

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profile Reactivation</h1>
          <p className="text-gray-500">Review and manage profile reactivation requests</p>
        </div>
        <button
          onClick={() => fetchRequests()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {pendingRequests.map((request) => (
          <div key={request.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">
                  {request.user?.display_name || request.user?.email}
                </p>
                <p className="text-sm text-gray-500">
                  Matched with: {request.matched_user?.display_name || request.matched_user?.email}
                </p>
                <p className="text-sm text-gray-500">
                  Reason: {request.reason_code ? REACTIVATION_REASONS[request.reason_code] : request.reason_text}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Status: {request.status} • {new Date(request.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedRequest(request)}
                className="px-4 py-2 rounded-lg bg-[#1f419a] text-white hover:bg-[#17357b]"
              >
                Review
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6">
            <h3 className="text-lg font-bold mb-4">Review Reactivation Request</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">User Request</label>
                <p className="p-3 bg-gray-50 rounded-lg text-sm">
                  {selectedRequest.reason_text || REACTIVATION_REASONS[selectedRequest.reason_code || 0]}
                </p>
              </div>
              {selectedRequest.partner_response_text && (
                <div>
                  <label className="block text-sm font-medium mb-1">Partner Response</label>
                  <p className="p-3 bg-gray-50 rounded-lg text-sm">{selectedRequest.partner_response_text}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Admin Notes</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none h-24"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Decision</label>
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                >
                  <option value="approved">Approve</option>
                  <option value="rejected">Reject</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  className="flex-1 py-2 rounded-lg bg-[#1f419a] text-white"
                >
                  {decision === "approved" ? "Approve" : "Reject"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
