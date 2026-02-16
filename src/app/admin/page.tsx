"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Users,
  CreditCard,
  Video,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ImageIcon,
  Calendar,
  DollarSign,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

/**
 * Dashboard metrics type
 */
type DashboardMetrics = {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  newUsersWeek: number;
  totalMeetings: number;
  pendingMeetings: number;
  completedMeetings: number;
  pendingPhotos: number;
  pendingReports: number;
  urgentReports: number;
  subscriptionsByTier: {
    basic: number;
    standard: number;
    premium: number;
    vip: number;
  };
  recentActivity: {
    id: string;
    type: string;
    description: string;
    created_at: string;
  }[];
};

/**
 * AdminDashboardPage - Overview page with key platform metrics
 * 
 * Shows:
 * - User statistics
 * - Meeting statistics
 * - Pending moderation items
 * - Subscription distribution
 * - Recent activity
 */
export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Fetch dashboard metrics
   */
  const fetchMetrics = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    
    try {
      // Fetch total users
      const { count: totalUsers } = await supabase
        .from("accounts")
        .select("*", { count: "exact", head: true });

      // Fetch active users (logged in last 7 days - using accounts table)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { count: activeUsers } = await supabase
        .from("accounts")
        .select("*", { count: "exact", head: true })
        .eq("account_status", "active");

      // Fetch new users today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: newUsersToday } = await supabase
        .from("accounts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());

      // Fetch new users this week
      const { count: newUsersWeek } = await supabase
        .from("accounts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo.toISOString());

      // Fetch meeting statistics
      const { count: totalMeetings } = await supabase
        .from("meetings")
        .select("*", { count: "exact", head: true });

      const { count: pendingMeetings } = await supabase
        .from("meetings")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      const { count: completedMeetings } = await supabase
        .from("meetings")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed");

      // Fetch moderation queue
      const { count: pendingPhotos } = await supabase
        .from("photo_moderation")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      // Fetch reports
      const { count: pendingReports } = await supabase
        .from("user_reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      const { count: urgentReports } = await supabase
        .from("user_reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("priority", "urgent");

      // Fetch subscription distribution
      const { data: tierData } = await supabase
        .from("accounts")
        .select("tier");

      const subscriptionsByTier = {
        basic: tierData?.filter((a) => a.tier === "basic").length || 0,
        standard: tierData?.filter((a) => a.tier === "standard").length || 0,
        premium: tierData?.filter((a) => a.tier === "premium").length || 0,
        vip: tierData?.filter((a) => a.tier === "vip").length || 0,
      };

      // Fetch recent admin activity
      const { data: recentActivity } = await supabase
        .from("admin_logs")
        .select("id, action, meta, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      setMetrics({
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        newUsersToday: newUsersToday || 0,
        newUsersWeek: newUsersWeek || 0,
        totalMeetings: totalMeetings || 0,
        pendingMeetings: pendingMeetings || 0,
        completedMeetings: completedMeetings || 0,
        pendingPhotos: pendingPhotos || 0,
        pendingReports: pendingReports || 0,
        urgentReports: urgentReports || 0,
        subscriptionsByTier,
        recentActivity: recentActivity?.map((a) => ({
          id: a.id,
          type: a.action,
          description: a.action,
          created_at: a.created_at,
        })) || [],
      });
    } catch (error) {
      console.error("Error fetching metrics:", error);
      // Set default metrics on error to prevent UI breakage
      setMetrics({
        totalUsers: 0,
        activeUsers: 0,
        newUsersToday: 0,
        newUsersWeek: 0,
        totalMeetings: 0,
        pendingMeetings: 0,
        completedMeetings: 0,
        pendingPhotos: 0,
        pendingReports: 0,
        urgentReports: 0,
        subscriptionsByTier: {
          basic: 0,
          standard: 0,
          premium: 0,
          vip: 0,
        },
        recentActivity: [],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Welcome to the admin panel</p>
        </div>
        <button
          onClick={() => fetchMetrics(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Users */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Users</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {metrics?.totalUsers.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <TrendingUp className="h-4 w-4" />
              +{metrics?.newUsersWeek}
            </span>
            <span className="text-gray-500">this week</span>
          </div>
        </div>

        {/* Active Users */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Users</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {metrics?.activeUsers.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 text-sm">
            <span className="text-gray-500">
              {metrics?.totalUsers
                ? Math.round((metrics.activeUsers / metrics.totalUsers) * 100)
                : 0}
              % of total users
            </span>
          </div>
        </div>

        {/* Total Meetings */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Meetings</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {metrics?.totalMeetings.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <Video className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 text-sm">
            <span className="text-amber-600">{metrics?.pendingMeetings} pending</span>
            <span className="text-gray-400">•</span>
            <span className="text-green-600">{metrics?.completedMeetings} completed</span>
          </div>
        </div>

        {/* Pending Actions */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Actions</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {(metrics?.pendingPhotos || 0) + (metrics?.pendingReports || 0)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 text-sm">
            {metrics?.urgentReports ? (
              <span className="text-red-600 font-medium">
                {metrics.urgentReports} urgent reports
              </span>
            ) : (
              <span className="text-gray-500">No urgent items</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subscription Distribution */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Subscription Distribution
          </h2>
          <div className="space-y-4">
            {/* Basic */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">Basic</span>
                <span className="text-sm font-medium text-gray-900">
                  {metrics?.subscriptionsByTier.basic || 0}
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-400 rounded-full"
                  style={{
                    width: `${
                      metrics?.totalUsers
                        ? (metrics.subscriptionsByTier.basic / metrics.totalUsers) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Standard */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">Standard</span>
                <span className="text-sm font-medium text-gray-900">
                  {metrics?.subscriptionsByTier.standard || 0}
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{
                    width: `${
                      metrics?.totalUsers
                        ? (metrics.subscriptionsByTier.standard / metrics.totalUsers) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Premium */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">Premium</span>
                <span className="text-sm font-medium text-gray-900">
                  {metrics?.subscriptionsByTier.premium || 0}
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{
                    width: `${
                      metrics?.totalUsers
                        ? (metrics.subscriptionsByTier.premium / metrics.totalUsers) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* VIP */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600">VIP</span>
                <span className="text-sm font-medium text-gray-900">
                  {metrics?.subscriptionsByTier.vip || 0}
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full"
                  style={{
                    width: `${
                      metrics?.totalUsers
                        ? (metrics.subscriptionsByTier.vip / metrics.totalUsers) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              href="/admin/users"
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Manage Users</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </Link>

            <Link
              href="/admin/moderation"
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ImageIcon className="h-5 w-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">
                  Photo Queue
                  {metrics?.pendingPhotos ? (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                      {metrics.pendingPhotos}
                    </span>
                  ) : null}
                </span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </Link>

            <Link
              href="/admin/reports"
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">
                  Reports
                  {metrics?.pendingReports ? (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                      {metrics.pendingReports}
                    </span>
                  ) : null}
                </span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </Link>

            <Link
              href="/admin/pricing"
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Manage Pricing</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-400" />
            </Link>

            <Link
              href="/admin/analytics"
              className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-[#1f419a]/5 to-[#2a44a3]/5 hover:from-[#1f419a]/10 hover:to-[#2a44a3]/10 transition-colors border border-[#1f419a]/10"
            >
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-[#1f419a]" />
                <span className="text-sm font-medium text-[#1f419a]">Full Analytics</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-[#1f419a]" />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-6 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <Link
            href="/admin/logs"
            className="text-sm text-[#1f419a] hover:underline"
          >
            View all
          </Link>
        </div>

        {metrics?.recentActivity && metrics.recentActivity.length > 0 ? (
          <div className="space-y-3">
            {metrics.recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-gray-50"
              >
                <div className="w-2 h-2 rounded-full bg-[#1f419a]" />
                <div className="flex-1">
                  <p className="text-sm text-gray-700">{activity.description}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(activity.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500 py-8">No recent activity</p>
        )}
      </div>
    </div>
  );
}
