"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Award,
  BarChart3,
  Gift,
  History,
  LogOut,
  MousePointerClick,
  Rocket,
  Settings,
  Shield,
  SlidersHorizontal,
  UserCheck,
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
  return (
    <Suspense fallback={<GrowthManagerSidebarShell userName={userName} />}>
      <GrowthManagerSidebarContent userName={userName} />
    </Suspense>
  );
}

function GrowthManagerSidebarContent({
  userName,
}: GrowthManagerSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSection = searchParams.get("section") || "overview";
  const sectionHref = (section: string) =>
    section === "overview"
      ? GROWTH_MANAGER_DASHBOARD_PATH
      : `${GROWTH_MANAGER_DASHBOARD_PATH}?section=${section}`;
  const referralNavGroups = [
    {
      label: "Overview",
      items: [
        {
          section: "overview",
          label: "Dashboard",
          Icon: BarChart3,
        },
        {
          section: "funnel",
          label: "Product Funnel",
          Icon: UserCheck,
        },
      ],
    },
    {
      label: "Operations",
      items: [
        {
          section: "ambassadors",
          label: "Ambassadors",
          Icon: Award,
        },
        {
          section: "rewards",
          label: "Reward Queue",
          Icon: Gift,
        },
      ],
    },
    {
      label: "Configuration",
      items: [
        {
          section: "tracking",
          label: "Tracking Pixels",
          Icon: MousePointerClick,
        },
        {
          section: "settings",
          label: "Reward Settings",
          Icon: SlidersHorizontal,
        },
      ],
    },
    {
      label: "Governance",
      items: [
        {
          section: "rollout",
          label: "Rollout",
          Icon: Rocket,
        },
        {
          section: "audit",
          label: "Audit Trail",
          Icon: History,
        },
      ],
    },
  ];

  return (
    <aside className="flex w-full flex-col border-b border-gray-200 bg-white md:min-h-screen md:w-64 md:border-b-0 md:border-r">
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

      <nav className="flex gap-2 overflow-x-auto p-3 md:block md:flex-1 md:space-y-5 md:overflow-y-auto md:p-4">
        {referralNavGroups.map((group) => (
          <div key={group.label} className="contents md:block md:space-y-1.5">
            <p className="hidden px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 md:block">
              {group.label}
            </p>
            {group.items.map(({ section, label, Icon }) => {
              const isActive =
                pathname === GROWTH_MANAGER_DASHBOARD_PATH &&
                currentSection === section;
              return (
                <Link
                  key={section}
                  href={sectionHref(section)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors md:gap-3 ${
                    isActive
                      ? "bg-[#1f419a] text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex gap-2 overflow-x-auto border-t border-gray-200 p-3 md:block md:space-y-1 md:p-4">
        <Link
          href="/dashboard/discover"
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 md:gap-3"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to App</span>
        </Link>
        <Link
          href="/dashboard/profile/notifications"
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 md:gap-3"
        >
          <Settings className="h-5 w-5" />
          <span>Settings</span>
        </Link>
        <Link
          href={`${GROWTH_MANAGER_LOGIN_PATH}?logout=true`}
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 md:gap-3"
        >
          <LogOut className="h-5 w-5" />
          <span>Sign Out</span>
        </Link>
      </div>
    </aside>
  );
}

function GrowthManagerSidebarShell({ userName }: GrowthManagerSidebarProps) {
  return (
    <aside className="flex w-full flex-col border-b border-gray-200 bg-white md:min-h-screen md:w-64 md:border-b-0 md:border-r">
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
      <nav className="p-3 md:flex-1 md:p-4">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
          Referral System
        </p>
      </nav>
    </aside>
  );
}
