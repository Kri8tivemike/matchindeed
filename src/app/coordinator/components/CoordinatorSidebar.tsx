"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  LogOut,
  ShieldCheck,
  Video,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  COORDINATOR_DASHBOARD_PATH,
  COORDINATOR_LOGIN_PATH,
  COORDINATOR_MFA_SETUP_PATH,
} from "@/lib/coordinator/path";

type CoordinatorSidebarProps = {
  userName: string;
  userEmail?: string | null;
  permissions: string[];
};

type MenuItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  section: "meetings" | "security";
  view?: "assigned" | "upcoming" | "joinable";
  anyPermissions?: string[];
};

const COORDINATOR_VIEW_CHANGE_EVENT = "coordinator-meeting-view-change";

function getViewFromSearch(search: string) {
  const view = new URLSearchParams(search).get("view");
  return view === "assigned" || view === "upcoming" || view === "joinable"
    ? view
    : "assigned";
}

export default function CoordinatorSidebar({
  userName,
  userEmail,
  permissions,
}: CoordinatorSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const permissionSet = new Set(permissions);
  const hasAnyPermission = (required: string[] = []) =>
    required.length === 0 ||
    required.some((permission) => permissionSet.has(permission));
  const [currentView, setCurrentView] = useState<
    "assigned" | "upcoming" | "joinable"
  >("assigned");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateView = () => setCurrentView(getViewFromSearch(window.location.search));
    updateView();
    window.addEventListener("popstate", updateView);
    return () => window.removeEventListener("popstate", updateView);
  }, []);

  const menuItems: MenuItem[] = [
    {
      href: `${COORDINATOR_DASHBOARD_PATH}?view=assigned`,
      label: "Assigned Meetings",
      icon: <Video className="h-5 w-5" />,
      section: "meetings",
      view: "assigned",
      anyPermissions: ["view_assigned_meetings"],
    },
    {
      href: `${COORDINATOR_DASHBOARD_PATH}?view=upcoming`,
      label: "Upcoming",
      icon: <CalendarClock className="h-5 w-5" />,
      section: "meetings",
      view: "upcoming",
      anyPermissions: ["view_upcoming_meetings"],
    },
    {
      href: `${COORDINATOR_DASHBOARD_PATH}?view=joinable`,
      label: "Approved / Joinable",
      icon: <CheckCircle2 className="h-5 w-5" />,
      section: "meetings",
      view: "joinable",
      anyPermissions: ["join_approved_meetings"],
    },
    {
      href: COORDINATOR_MFA_SETUP_PATH,
      label: "2FA Auth Setup",
      icon: <KeyRound className="h-5 w-5" />,
      section: "security",
      anyPermissions: ["manage_2fa_auth"],
    },
  ];

  const groupedItems = [
    {
      section: "meetings",
      label: "Meeting Ops",
      items: menuItems.filter(
        (item) =>
          item.section === "meetings" && hasAnyPermission(item.anyPermissions)
      ),
    },
    {
      section: "security",
      label: "Security",
      items: menuItems.filter(
        (item) =>
          item.section === "security" && hasAnyPermission(item.anyPermissions)
      ),
    },
  ].filter((group) => group.items.length > 0);

  const isActive = (href: string) => {
    const [targetPath] = href.split("?");

    if (pathname !== targetPath) return false;

    if (!href.includes("?")) {
      return true;
    }

    const targetView = getViewFromSearch(href.includes("?") ? href.slice(href.indexOf("?")) : "");
    return targetView === currentView;
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.view) {
      setCurrentView(item.view);
      window.dispatchEvent(
        new CustomEvent(COORDINATOR_VIEW_CHANGE_EVENT, {
          detail: item.view,
        })
      );
    }
    router.push(item.href);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push(`${COORDINATOR_LOGIN_PATH}?logout=true`);
  };

  return (
    <aside className="flex min-h-screen w-64 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1f419a] to-[#2a44a3]">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">Coordinator Panel</h1>
            <p className="text-xs text-gray-500">Matchindeed</p>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200">
            <span className="text-sm font-medium text-gray-600">
              {userName?.[0]?.toUpperCase() || "C"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{userName}</p>
            {userEmail ? (
              <p className="truncate text-xs text-gray-500">{userEmail}</p>
            ) : null}
            <span className="mt-1 inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
              Coordinator
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-4">
        {groupedItems.map((group) => (
          <div key={group.section} className="space-y-1.5">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => handleMenuClick(item)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-[#1f419a] text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {active ? <ChevronRight className="h-4 w-4" /> : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-gray-200 p-4">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          <LogOut className="h-5 w-5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
