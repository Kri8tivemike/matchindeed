"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Gift,
  LogOut,
  Settings,
  Shield,
} from "lucide-react";
import {
  GROWTH_MANAGER_DASHBOARD_PATH,
  GROWTH_MANAGER_LOGIN_PATH,
} from "@/lib/growth-manager/path";

type GrowthManagerSidebarProps = {
  userName: string;
};

export default function GrowthManagerSidebar({
  userName,
}: GrowthManagerSidebarProps) {
  const pathname = usePathname();
  const isDashboard = pathname === GROWTH_MANAGER_DASHBOARD_PATH;

  return (
    <aside className="flex min-h-screen w-64 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1f419a] to-[#2a44a3]">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">MatchIndeed</h1>
            <p className="text-xs text-gray-500">Referral operations</p>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200">
            <span className="text-sm font-medium text-gray-600">
              {userName?.[0]?.toUpperCase() || "G"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">
              {userName}
            </p>
            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
              Growth Manager
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
            Referral System
          </p>
          <Link
            href={GROWTH_MANAGER_DASHBOARD_PATH}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isDashboard
                ? "bg-[#1f419a] text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <BarChart3 className="h-5 w-5" />
            <span>Dashboard</span>
          </Link>
          <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400">
            <Gift className="h-5 w-5" />
            <span>Reward Queue</span>
          </div>
        </div>
      </nav>

      <div className="space-y-1 border-t border-gray-200 p-4">
        <Link
          href="/dashboard/discover"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to App</span>
        </Link>
        <Link
          href="/dashboard/profile/notifications"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          <Settings className="h-5 w-5" />
          <span>Settings</span>
        </Link>
        <Link
          href={`${GROWTH_MANAGER_LOGIN_PATH}?logout=true`}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          <LogOut className="h-5 w-5" />
          <span>Sign Out</span>
        </Link>
      </div>
    </aside>
  );
}
