"use client";

/**
 * Host Dashboard Page - Complete Host Management System
 * 
 * Features:
 * - Authentication check with redirect to login if needed
 * - Host profile display with type/tier
 * - Real-time statistics (meetings, success rate, earnings)
 * - Earnings summary (pending and paid)
 * - Meetings list with report status
 * - Meeting report submission modal
 * - Two-factor authentication indicator
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ToastProvider";
import {
  BarChart3,
  TrendingUp,
  AlertCircle,
  Loader2,
  RefreshCw,
  DollarSign,
  Users,
  CheckCircle,
  Clock,
  FileText,
  Shield,
  LogOut,
} from "lucide-react";

// Types
interface HostProfile {
  id: string;
  user_id: string;
  host_type: "basic" | "premium" | "vip";
  commission_rate: number;
  is_active: boolean;
  two_fa_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface HostMeeting {
  id: string;
  host_id: string;
  meeting_id: string;
  report_submitted: boolean;
  success_marked: boolean | null;
  notes: string | null;
  video_recording_url: string | null;
  created_at: string;
  updated_at: string;
}

interface HostEarning {
  id: string;
  host_id: string;
  meeting_id: string;
  amount: number;
  status: "pending" | "processing" | "paid" | "failed";
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

interface HostStats {
  totalMeetings: number;
  successfulMeetings: number;
  successRate: number;
  pendingReports: number;
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
}

export default function HostDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [host, setHost] = useState<HostProfile | null>(null);
  const [meetings, setMeetings] = useState<HostMeeting[]>([]);
  const [earnings, setEarnings] = useState<HostEarning[]>([]);
  const [stats, setStats] = useState<HostStats>({
    totalMeetings: 0,
    successfulMeetings: 0,
    successRate: 0,
    pendingReports: 0,
    totalEarnings: 0,
    pendingEarnings: 0,
    paidEarnings: 0,
  });
  const [selectedMeeting, setSelectedMeeting] = useState<HostMeeting | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Authenticate and fetch host data
  const fetchHostData = useCallback(async () => {
    try {
      setLoading(true);

      // Get current user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.push("/login");
        return;
      }

      // Fetch host profile
      const { data: hostData, error: hostError } = await supabase
        .from("host_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (hostError || !hostData) {
        toast.error(
          "Host profile not found. Please contact support to become a host."
        );
        router.push("/");
        return;
      }

      setHost(hostData as HostProfile);

      // Fetch host meetings
      const { data: meetingsData, error: meetingsError } = await supabase
        .from("host_meetings")
        .select("*")
        .eq("host_id", hostData.id)
        .order("created_at", { ascending: false });

      if (!meetingsError && meetingsData) {
        setMeetings(meetingsData as HostMeeting[]);
      }

      // Fetch earnings
      const { data: earningsData, error: earningsError } = await supabase
        .from("host_earnings")
        .select("*")
        .eq("host_id", hostData.id)
        .order("created_at", { ascending: false });

      if (!earningsError && earningsData) {
        setEarnings(earningsData as HostEarning[]);
      }

      // Calculate statistics
      if (meetingsData && earningsData) {
        const successful = (meetingsData as HostMeeting[]).filter(
          (m) => m.success_marked === true
        ).length;
        const pending = (meetingsData as HostMeeting[]).filter(
          (m) => !m.report_submitted
        ).length;
        const pendingEarningsAmount = (earningsData as HostEarning[])
          .filter((e) => e.status === "pending")
          .reduce((sum, e) => sum + e.amount, 0);
        const paidEarningsAmount = (earningsData as HostEarning[])
          .filter((e) => e.status === "paid")
          .reduce((sum, e) => sum + e.amount, 0);
        const totalEarningsAmount = pendingEarningsAmount + paidEarningsAmount;

        setStats({
          totalMeetings: meetingsData.length,
          successfulMeetings: successful,
          successRate:
            meetingsData.length > 0
              ? Math.round((successful / meetingsData.length) * 100)
              : 0,
          pendingReports: pending,
          totalEarnings: totalEarningsAmount,
          pendingEarnings: pendingEarningsAmount,
          paidEarnings: paidEarningsAmount,
        });
      }
    } catch (error) {
      console.error("Error fetching host data:", error);
      toast.error("Failed to load dashboard. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => {
    fetchHostData();
  }, [fetchHostData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleReportSubmit = async (
    success: boolean,
    notes: string
  ) => {
    if (!selectedMeeting) return;

    try {
      setReportLoading(true);

      const { error } = await supabase
        .from("host_meetings")
        .update({
          success_marked: success,
          report_submitted: true,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedMeeting.id);

      if (error) throw error;

      toast.success("Report submitted successfully!");
      setSelectedMeeting(null);
      await fetchHostData();
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error("Failed to submit report. Please try again.");
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!host) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <p className="text-gray-600">Host profile not found</p>
        </div>
      </div>
    );
  }

  const getHostTypeColor = (type: string) => {
    switch (type) {
      case "vip":
        return "bg-purple-100 text-purple-800";
      case "premium":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Host Dashboard</h1>
            <p className="text-gray-600 mt-2">Manage your meetings and earnings</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Host Info Card */}
        <div className="bg-white rounded-lg shadow mb-8 p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Your Host Profile
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Host Type</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${getHostTypeColor(
                        host.host_type
                      )}`}
                    >
                      {host.host_type}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Commission Rate</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {host.commission_rate.toFixed(2)}%
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-600">Two-Factor Authentication</p>
                  {host.two_fa_enabled ? (
                    <Shield className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={fetchHostData}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              <RefreshCw className="w-5 h-5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Meetings */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Meetings</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.totalMeetings}
                </p>
              </div>
              <Users className="w-10 h-10 text-blue-600 opacity-20" />
            </div>
          </div>

          {/* Success Rate */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Success Rate</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.successRate}%
                </p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-600 opacity-20" />
            </div>
          </div>

          {/* Pending Reports */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Pending Reports</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.pendingReports}
                </p>
              </div>
              <Clock className="w-10 h-10 text-yellow-600 opacity-20" />
            </div>
          </div>

          {/* Total Earnings */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Earnings</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  ${stats.totalEarnings.toFixed(2)}
                </p>
              </div>
              <TrendingUp className="w-10 h-10 text-purple-600 opacity-20" />
            </div>
          </div>
        </div>

        {/* Earnings Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-4">
              <Clock className="w-10 h-10 text-yellow-600" />
              <div>
                <p className="text-gray-600 text-sm">Pending Payout</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${stats.pendingEarnings.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-4">
              <DollarSign className="w-10 h-10 text-green-600" />
              <div>
                <p className="text-gray-600 text-sm">Already Paid</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${stats.paidEarnings.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Meetings List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-600" />
              Your Meetings
            </h3>
          </div>

          {meetings.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No meetings assigned yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Meeting ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Result
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Submitted
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {meetings.map((meeting) => (
                    <tr key={meeting.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {meeting.meeting_id.substring(0, 8)}...
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {meeting.report_submitted ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-4 h-4" />
                            Reported
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                            <Clock className="w-4 h-4" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {meeting.success_marked === null ? (
                          <span className="text-gray-500">-</span>
                        ) : meeting.success_marked ? (
                          <span className="text-green-600 font-semibold">Success</span>
                        ) : (
                          <span className="text-red-600 font-semibold">Denied</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {meeting.report_submitted
                          ? new Date(meeting.updated_at).toLocaleDateString()
                          : "Not submitted"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {!meeting.report_submitted && (
                          <button
                            onClick={() => setSelectedMeeting(meeting)}
                            className="inline-flex items-center gap-2 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                          >
                            <FileText className="w-4 h-4" />
                            Report
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Report Modal */}
      {selectedMeeting && (
        <ReportModal
          meeting={selectedMeeting}
          onSubmit={handleReportSubmit}
          onClose={() => setSelectedMeeting(null)}
          loading={reportLoading}
        />
      )}
    </div>
  );
}

// Report Modal Component
function ReportModal({
  meeting,
  onSubmit,
  onClose,
  loading,
}: {
  meeting: HostMeeting;
  onSubmit: (success: boolean, notes: string) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}) {
  const [success, setSuccess] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (success === null) return;
    await onSubmit(success, notes);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Submit Meeting Report</h3>
          <p className="text-sm text-gray-600 mt-1">
            Meeting: {meeting.meeting_id.substring(0, 8)}...
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="space-y-4">
            {/* Success/Denied Radio */}
            <div>
              <p className="text-sm font-medium text-gray-900 mb-3">
                Meeting Outcome
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="outcome"
                    checked={success === true}
                    onChange={() => setSuccess(true)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">Successful</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="outcome"
                    checked={success === false}
                    onChange={() => setSuccess(false)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">Denied/Did Not Happen</span>
                </label>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any relevant notes about the meeting..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                rows={3}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={success === null || loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Submit Report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
