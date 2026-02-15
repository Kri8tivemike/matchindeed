"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";

/**
 * Admin role type
 */
type AdminRole = "moderator" | "admin" | "superadmin";

/**
 * Props for AdminSidebar
 */
type AdminSidebarProps = {
  role: AdminRole;
  userName: string;
};

/**
 * Menu item configuration
 */
type MenuItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: AdminRole[];
};

/**
 * AdminSidebar - Navigation sidebar for admin dashboard
 * 
 * Shows menu items based on user's admin role permissions.
 */
export default function AdminSidebar({ role, userName }: AdminSidebarProps) {
  const pathname = usePathname();

  // Menu items with role-based access
  const menuItems: MenuItem[] = [
    {
      href: "/admin",
      label: "Dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
      roles: ["moderator", "admin", "superadmin"],
    },
    {
      href: "/admin/users",
      label: "Users",
      icon: <Users className="h-5 w-5" />,
      roles: ["moderator", "admin", "superadmin"],
    },
    {
      href: "/admin/calendar",
      label: "Calendar Management",
      icon: <Calendar className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
    },
    {
      href: "/admin/meetings",
      label: "Meeting Management",
      icon: <Video className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
    },
    {
      href: "/admin/post-meetings",
      label: "Post-Meeting Review",
      icon: <ClipboardCheck className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
    },
    {
      href: "/admin/wallet",
      label: "Wallet Management",
      icon: <Wallet className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
    },
    {
      href: "/admin/pricing",
      label: "Pricing",
      icon: <CreditCard className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
    },
    {
      href: "/admin/moderation",
      label: "Photo Moderation",
      icon: <ImageIcon className="h-5 w-5" />,
      roles: ["moderator", "admin", "superadmin"],
    },
    {
      href: "/admin/reports",
      label: "Reports",
      icon: <AlertTriangle className="h-5 w-5" />,
      roles: ["moderator", "admin", "superadmin"],
    },
    {
      href: "/admin/reactivation",
      label: "Profile Reactivation",
      icon: <RotateCcw className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
    },
    {
      href: "/admin/hosts",
      label: "Hosts/Coordinators",
      icon: <UserCheck className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
    },
    {
      href: "/admin/subadmins",
      label: "Sub-Admins",
      icon: <UserCog className="h-5 w-5" />,
      roles: ["superadmin"],
    },
    {
      href: "/admin/activity-limits",
      label: "Activity Limits",
      icon: <Gauge className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
    },
    {
      href: "/admin/analytics",
      label: "Analytics",
      icon: <BarChart3 className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
    },
    {
      href: "/admin/logs",
      label: "Activity Logs",
      icon: <FileText className="h-5 w-5" />,
      roles: ["admin", "superadmin"],
    },
  ];

  // Filter menu items based on role
  const visibleItems = menuItems.filter((item) => item.roles.includes(role));

  // Check if a path is active
  const isActive = (href: string): boolean => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(href);
  };

  // Get role badge color
  const getRoleBadgeColor = (role: AdminRole): string => {
    switch (role) {
      case "superadmin":
        return "bg-purple-100 text-purple-700";
      case "admin":
        return "bg-blue-100 text-blue-700";
      case "moderator":
        return "bg-green-100 text-green-700";
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
      <nav className="flex-1 p-4 space-y-1">
        {visibleItems.map((item) => {
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
          href="/admin/login?logout=true"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          <span>Sign Out</span>
        </Link>
      </div>
    </aside>
  );
}
