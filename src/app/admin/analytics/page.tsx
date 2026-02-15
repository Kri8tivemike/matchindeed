"use client";

/**
 * AdminAnalyticsPage — Comprehensive Analytics Dashboard
 *
 * Displays platform-wide metrics with visual charts:
 * - KPI stat cards with trend indicators
 * - User signups bar chart (7-day trend)
 * - Activity breakdown bar chart (7-day trend)
 * - Meetings funnel (pending → confirmed → completed)
 * - User tier distribution donut
 * - Revenue overview
 * - Profile completion rate
 */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  BarChart3,
  TrendingUp,
  Users,
  DollarSign,
  Heart,
  Eye,
  MessageCircle,
  Loader2,
  RefreshCw,
  Video,
  Calendar,
  Bell,
  UserCheck,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  PieChart,
} from "lucide-react";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type AnalyticsData = {
  users: {
    total: number;
    active: number;
    new_this_month: number;
    new_last_7_days: number;
    by_tier: Record<string, number>;
    profile_completed: number;
    total_profiles: number;
  };
  activities: {
    total_winks: number;
    total_likes: number;
    total_interested: number;
    today: number;
    by_day: Record<string, { wink: number; like: number; interested: number }>;
  };
  meetings: {
    total: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    pending: number;
  };
  matches: {
    total: number;
    this_month: number;
  };
  revenue: {
    total: number;
    this_month: number;
  };
  notifications: {
    total: number;
  };
  trends: {
    signups_by_day: Record<string, number>;
    activity_by_day: Record<string, { wink: number; like: number; interested: number }>;
  };
  generated_at: string;
};

// ---------------------------------------------------------------
// Mini SVG Bar Chart Component
// ---------------------------------------------------------------

function MiniBarChart({
  data,
  color = "#1f419a",
  height = 120,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(20, Math.min(40, 300 / data.length - 8));

  return (
    <div className="flex items-end gap-1.5 justify-center" style={{ height }}>
      {data.map((d, i) => {
        const barH = (d.value / max) * (height - 24);
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-bold text-gray-500">
              {d.value > 0 ? d.value : ""}
            </span>
            <div
              className="rounded-t-md transition-all duration-500"
              style={{
                width: barWidth,
                height: Math.max(4, barH),
                backgroundColor: color,
                opacity: 0.6 + (i / data.length) * 0.4,
              }}
            />
            <span className="text-[9px] text-gray-400 truncate max-w-[40px]">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------
// Stacked Bar Chart Component
// ---------------------------------------------------------------

function StackedBarChart({
  data,
  height = 140,
}: {
  data: { label: string; wink: number; like: number; interested: number }[];
  height?: number;
}) {
  const max = Math.max(
    ...data.map((d) => d.wink + d.like + d.interested),
    1
  );
  const barWidth = Math.max(20, Math.min(40, 300 / data.length - 8));

  return (
    <div>
      <div className="flex items-end gap-1.5 justify-center" style={{ height }}>
        {data.map((d, i) => {
          const total = d.wink + d.like + d.interested;
          const scale = (height - 30) / max;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-bold text-gray-500">
                {total > 0 ? total : ""}
              </span>
              <div className="flex flex-col-reverse rounded-t-md overflow-hidden" style={{ width: barWidth }}>
                {d.wink > 0 && (
                  <div
                    style={{ height: d.wink * scale, backgroundColor: "#a855f7" }}
                  />
                )}
                {d.like > 0 && (
                  <div
                    style={{ height: d.like * scale, backgroundColor: "#ef4444" }}
                  />
                )}
                {d.interested > 0 && (
                  <div
                    style={{ height: d.interested * scale, backgroundColor: "#3b82f6" }}
                  />
                )}
                {total === 0 && (
                  <div style={{ height: 4, backgroundColor: "#e5e7eb" }} />
                )}
              </div>
              <span className="text-[9px] text-gray-400 truncate max-w-[40px]">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-purple-500" /> Winks
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Likes
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> Interested
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Donut Chart Component
// ---------------------------------------------------------------

function DonutChart({
  segments,
  size = 120,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const radius = (size - 20) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 18;

  let cumulativePercent = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="flex-shrink-0">
        {segments.map((seg, i) => {
          const percent = seg.value / total;
          const dashArray = 2 * Math.PI * radius;
          const dashOffset = dashArray * (1 - percent);
          const rotation = cumulativePercent * 360 - 90;
          cumulativePercent += percent;

          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              transform={`rotate(${rotation} ${cx} ${cy})`}
              className="transition-all duration-500"
            />
          );
        })}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-gray-900 font-bold"
          fontSize="18"
        >
          {total}
        </text>
      </svg>
      <div className="space-y-1.5">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-gray-600">{seg.label}</span>
            <span className="font-bold text-gray-900 ml-auto">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Stat Card Component
// ---------------------------------------------------------------

function StatCard({
  title,
  value,
  icon,
  trend,
  trendLabel,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: number;
  trendLabel?: string;
  color: string;
}) {
  const isPositive = trend !== undefined && trend >= 0;

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {title}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1.5">{value}</p>
          {trend !== undefined && (
            <div
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isPositive
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(trend)}
              {trendLabel && ` ${trendLabel}`}
            </div>
          )}
        </div>
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/admin/analytics", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Error fetching analytics:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
      </div>
    );
  }

  // Prepare chart data
  const signupChartData = Object.entries(data.trends.signups_by_day).map(
    ([date, count]) => ({
      label: new Date(date).toLocaleDateString("en-US", { weekday: "short" }),
      value: count,
    })
  );

  const activityChartData = Object.entries(data.trends.activity_by_day).map(
    ([date, counts]) => ({
      label: new Date(date).toLocaleDateString("en-US", { weekday: "short" }),
      ...counts,
    })
  );

  const tierSegments = Object.entries(data.users.by_tier).map(
    ([tier, count], i) => ({
      label: tier.charAt(0).toUpperCase() + tier.slice(1),
      value: count,
      color: ["#1f419a", "#f59e0b", "#8b5cf6", "#10b981"][i % 4],
    })
  );

  const meetingSegments = [
    { label: "Pending", value: data.meetings.pending, color: "#f59e0b" },
    { label: "Confirmed", value: data.meetings.confirmed, color: "#3b82f6" },
    { label: "Completed", value: data.meetings.completed, color: "#10b981" },
    { label: "Cancelled", value: data.meetings.cancelled, color: "#ef4444" },
  ].filter((s) => s.value > 0);

  const profileCompletionRate =
    data.users.total_profiles > 0
      ? Math.round(
          (data.users.profile_completed / data.users.total_profiles) * 100
        )
      : 0;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-[#1f419a]" />
            Analytics Dashboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Platform overview · Generated{" "}
            {new Date(data.generated_at).toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchAnalytics()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* KPI Cards — Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={data.users.total.toLocaleString()}
          icon={<Users className="h-5 w-5" />}
          trend={data.users.new_last_7_days}
          trendLabel="this week"
          color="#1f419a"
        />
        <StatCard
          title="Active Users"
          value={data.users.active.toLocaleString()}
          icon={<UserCheck className="h-5 w-5" />}
          color="#10b981"
        />
        <StatCard
          title="Total Revenue"
          value={`₦${data.revenue.total.toLocaleString()}`}
          icon={<DollarSign className="h-5 w-5" />}
          trend={data.revenue.this_month}
          trendLabel="this month"
          color="#f59e0b"
        />
        <StatCard
          title="Matches"
          value={data.matches.total.toLocaleString()}
          icon={<Heart className="h-5 w-5" />}
          trend={data.matches.this_month}
          trendLabel="this month"
          color="#ef4444"
        />
      </div>

      {/* KPI Cards — Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Meetings"
          value={data.meetings.total.toLocaleString()}
          icon={<Video className="h-5 w-5" />}
          color="#8b5cf6"
        />
        <StatCard
          title="Today's Activity"
          value={data.activities.today.toLocaleString()}
          icon={<Activity className="h-5 w-5" />}
          color="#06b6d4"
        />
        <StatCard
          title="Total Winks"
          value={data.activities.total_winks.toLocaleString()}
          icon={<Eye className="h-5 w-5" />}
          color="#a855f7"
        />
        <StatCard
          title="Notifications"
          value={data.notifications.total.toLocaleString()}
          icon={<Bell className="h-5 w-5" />}
          color="#64748b"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Signups Chart */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#1f419a]" />
            New Signups (Last 7 Days)
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            {data.users.new_last_7_days} new users this week
          </p>
          <MiniBarChart data={signupChartData} color="#1f419a" />
        </div>

        {/* Activity Chart */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-500" />
            User Activity (Last 7 Days)
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Winks, Likes, and Interests breakdown
          </p>
          <StackedBarChart data={activityChartData} />
        </div>
      </div>

      {/* Distribution Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User Tier Distribution */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-[#1f419a]" />
            User Tiers
          </h2>
          {tierSegments.length > 0 ? (
            <DonutChart segments={tierSegments} />
          ) : (
            <p className="text-sm text-gray-400">No tier data</p>
          )}
        </div>

        {/* Meeting Funnel */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Video className="h-4 w-4 text-purple-500" />
            Meeting Status
          </h2>
          {meetingSegments.length > 0 ? (
            <DonutChart segments={meetingSegments} />
          ) : (
            <p className="text-sm text-gray-400">No meetings yet</p>
          )}
        </div>

        {/* Profile Completion */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-emerald-500" />
            Profile Completion
          </h2>
          <div className="text-center">
            {/* Completion Ring */}
            <svg width={100} height={100} className="mx-auto -rotate-90">
              <circle
                cx={50}
                cy={50}
                r={40}
                fill="none"
                stroke="#f3f4f6"
                strokeWidth={10}
              />
              <circle
                cx={50}
                cy={50}
                r={40}
                fill="none"
                stroke="#10b981"
                strokeWidth={10}
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 40}
                strokeDashoffset={
                  2 * Math.PI * 40 * (1 - profileCompletionRate / 100)
                }
                className="transition-all duration-1000"
              />
              <text
                x={50}
                y={50}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-gray-900 font-bold"
                fontSize="18"
                transform="rotate(90, 50, 50)"
              >
                {profileCompletionRate}%
              </text>
            </svg>
            <p className="text-sm text-gray-600 mt-3">
              <span className="font-bold">{data.users.profile_completed}</span>{" "}
              of {data.users.total_profiles} profiles completed
            </p>
          </div>
        </div>
      </div>

      {/* Activity Totals Summary */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Activity Summary
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl bg-purple-50 border border-purple-100 p-4 text-center">
            <Eye className="h-6 w-6 text-purple-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-purple-700">
              {data.activities.total_winks.toLocaleString()}
            </p>
            <p className="text-xs text-purple-600">Total Winks</p>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-center">
            <Heart className="h-6 w-6 text-red-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-red-700">
              {data.activities.total_likes.toLocaleString()}
            </p>
            <p className="text-xs text-red-600">Total Likes</p>
          </div>
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-center">
            <MessageCircle className="h-6 w-6 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-blue-700">
              {data.activities.total_interested.toLocaleString()}
            </p>
            <p className="text-xs text-blue-600">Total Interested</p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center">
            <Calendar className="h-6 w-6 text-amber-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-amber-700">
              {data.activities.today.toLocaleString()}
            </p>
            <p className="text-xs text-amber-600">Today&apos;s Activity</p>
          </div>
        </div>
      </div>
    </div>
  );
}
