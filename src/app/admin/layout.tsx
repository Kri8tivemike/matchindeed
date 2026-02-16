"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AdminSidebar from "./components/AdminSidebar";
import { Loader2 } from "lucide-react";

/**
 * Admin role type
 */
type AdminRole = "moderator" | "admin" | "superadmin";

/**
 * Admin user data
 */
type AdminUser = {
  id: string;
  email: string;
  role: AdminRole;
  display_name: string | null;
};

/**
 * AdminLayout - Protected layout for admin pages
 * 
 * Features:
 * - Checks if user is authenticated and has admin role
 * - Redirects non-admins to login page
 * - Provides admin sidebar navigation
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

  // Skip auth check for login page
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    // Don't check auth on login page
    if (isLoginPage) {
      setLoading(false);
      return;
    }

    const checkAdminAuth = async () => {
      try {
        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          console.debug("No admin session found");
          router.push("/admin/login");
          return;
        }

        // Get user's account with role
        const { data: account, error: accountError } = await supabase
          .from("accounts")
          .select("id, email, role, display_name")
          .eq("id", session.user.id)
          .single();

        if (accountError || !account) {
          console.error("Error fetching admin account:", accountError);
          router.push("/admin/login");
          return;
        }

        // Check if user has admin role
        const adminRoles = ["moderator", "admin", "superadmin"];
        if (!adminRoles.includes(account.role)) {
          console.debug("User does not have admin role:", account.role);
          router.push("/admin/login?error=unauthorized");
          return;
        }

        // Set admin user data
        setAdminUser({
          id: account.id,
          email: account.email,
          role: account.role as AdminRole,
          display_name: account.display_name,
        });
      } catch (error) {
        console.error("Admin auth error:", error);
        router.push("/admin/login");
      } finally {
        setLoading(false);
      }
    };

    checkAdminAuth();
  }, [router, isLoginPage, pathname]);

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  // Render login page without sidebar
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Redirect if not admin (shouldn't reach here but safety check)
  if (!adminUser) {
    return null;
  }

  // Render admin layout with sidebar
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <AdminSidebar 
        role={adminUser.role} 
        userName={adminUser.display_name || adminUser.email}
      />

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
