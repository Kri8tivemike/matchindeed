"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import {
  ADMIN_BASE_PATH,
  ADMIN_LOGIN_PATH,
  adminPath,
  matchesAdminPathname,
} from "@/lib/admin/path";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ImageIcon,
  AlertTriangle,
  FileText,
  Settings,
  LogOut,
  ChevronRight,
  Shield,
  Calendar,
  Video,
  Wallet,
  UserCog,
  UserCheck,
  BarChart3,
  ClipboardCheck,
  RotateCcw,
  Gauge,
  KeyRound,
} from "lucide-react";

type NextLinkProps = ComponentProps<typeof NextLink>;

function Link({ prefetch, ...props }: NextLinkProps) {
  return <NextLink {...props} prefetch={prefetch ?? false} />;
}

/**
 * Admin role type
 */
type AdminRole = "admin" | "superadmin";

/**
 * Props for AdminSidebar
 */
type AdminSidebarProps = {
  role: AdminRole;
  userName: string;
  permissions: string[];
};

/**
 * Menu item configuration
 */
type MenuItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: AdminRole[];
  anyPermissions?: string[];
  section:
    | "overview"
    | "safety"
    | "meetings"
    | "operations"
    | "configuration"
    | "security";
};

/**
 * AdminSidebar - Navigation sidebar for admin dashboard
 * 
 * Shows menu items based on user's admin role permissions.
 */
export default function AdminSidebar({
  role,
  userName,
  permissions,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const permissionSet = new Set(permissions);
  const hasAnyPermission = (required: string[] = []) => {
    if (role === "superadmin" || permissionSet.has("*")) return true;
    if (required.length === 0) return true;
    return required.some((permission) => permissionSet.has(permission));
  };

  // Menu items with role-based access
  const menuItems: MenuItem[] = [
    {
      href: ADMIN_BASE_PATH,
      label: "Dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      section: "overview",
    },
    {
      href: adminPath("/users"),
      label: "Users",
      icon: <Users className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["view_users", "edit_users"],
      section: "safety",
    },
    {
      href: adminPath("/reports"),
      label: "Reports",
      icon: <AlertTriangle className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["view_reports", "resolve_reports"],
      section: "safety",
    },
    {
      href: adminPath("/moderation"),
      label: "Photo Moderation",
      icon: <ImageIcon className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["moderate_photos"],
      section: "safety",
    },
    {
      href: adminPath("/calendar"),
      label: "Calendar Management",
      icon: <Calendar className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["manage_calendar"],
      section: "meetings",
    },
    {
      href: adminPath("/meetings"),
      label: "Meeting Management",
      icon: <Video className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["view_meetings", "manage_meetings"],
      section: "meetings",
    },
    {
      href: adminPath("/post-meetings"),
      label: "Post-Meeting Review",
      icon: <ClipboardCheck className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["view_meetings", "manage_meetings"],
      section: "meetings",
    },
    {
      href: adminPath("/hosts"),
      label: "Coordinators",
      icon: <UserCheck className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["manage_hosts", "manage_meetings"],
      section: "meetings",
    },
    {
      href: adminPath("/wallet"),
      label: "Wallet Management",
      icon: <Wallet className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["view_wallet", "manage_wallet"],
      section: "operations",
    },
    {
      href: adminPath("/reactivation"),
      label: "Profile Reactivation",
      icon: <RotateCcw className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["manage_reactivation"],
      section: "operations",
    },
    {
      href: adminPath("/subadmins"),
      label: "Sub-Admins",
      icon: <UserCog className="h-5 w-5" />,
      roles: ["superadmin"],
      anyPermissions: ["manage_subadmins"],
      section: "configuration",
    },
    {
      href: adminPath("/activity-limits"),
      label: "Activity Limits",
      icon: <Gauge className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["manage_activity_limits"],
      section: "configuration",
    },
    {
      href: adminPath("/pricing"),
      label: "Pricing",
      icon: <CreditCard className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["manage_pricing"],
      section: "configuration",
    },
    {
      href: adminPath("/analytics"),
      label: "Analytics",
      icon: <BarChart3 className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["view_analytics"],
      section: "configuration",
    },
    {
      href: adminPath("/logs"),
      label: "Activity Logs",
      icon: <FileText className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["view_logs"],
      section: "configuration",
    },
    {
      href: adminPath("/mfa-setup"),
      label: "2FA Auth Setup",
      icon: <KeyRound className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
      anyPermissions: ["manage_2fa_auth"],
      section: "security",
    },
  ];

  // Filter menu items based on role
  const visibleItems = menuItems.filter(
    (item) => item.roles.includes(role) && hasAnyPermission(item.anyPermissions)
  );
  const sectionOrder: MenuItem["section"][] = [
    "overview",
    "safety",
    "meetings",
    "operations",
    "configuration",
    "security",
  ];
  const sectionLabels: Record<MenuItem["section"], string> = {
    overview: "Overview",
    safety: "Safety & Users",
    meetings: "Meeting Ops",
    operations: "Operations",
    configuration: "Configuration",
    security: "Security",
  };
  const groupedItems = sectionOrder
    .map((section) => ({
      section,
      label: sectionLabels[section],
      items: visibleItems.filter((item) => item.section === section),
    }))
    .filter((group) => group.items.length > 0);

  // Check if a path is active
  const isActive = (href: string): boolean => {
    if (href === ADMIN_BASE_PATH) {
      return matchesAdminPathname(pathname, ADMIN_BASE_PATH);
    }
    if (!pathname) return false;

    return (
      pathname.startsWith(href) ||
      pathname.startsWith(`/admin${href.slice(ADMIN_BASE_PATH.length)}`)
    );
  };

  // Get role badge color
  const getRoleBadgeColor = (role: AdminRole): string => {
    switch (role) {
      case "superadmin":
        return "bg-purple-100 text-purple-700";
      case "admin":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
      {/* Logo/Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1f419a] to-[#2a44a3] flex items-center justify-center">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">Admin Panel</h1>
            <p className="text-xs text-gray-500">Matchindeed</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-sm font-medium text-gray-600">
              {userName?.[0]?.toUpperCase() || "A"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
            <span className={`inline-flex text-xs px-2 py-0.5 rounded-full ${getRoleBadgeColor(role)}`}>
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto p-4">
        {groupedItems.map((group) => (
          <div key={group.section} className="space-y-1.5">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${active 
                      ? "bg-[#1f419a] text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                    }
                  `}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight className="h-4 w-4" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 space-y-1">
        <Link
          href="/dashboard/discover"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Settings className="h-5 w-5" />
          <span>Back to App</span>
        </Link>
        <Link
          href={`${ADMIN_LOGIN_PATH}?logout=true`}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          <span>Sign Out</span>
        </Link>
      </div>
    </aside>
  );
}
