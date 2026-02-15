"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import MobileNav from "@/components/dashboard/MobileNav";
import OneSignalProvider from "@/components/OneSignalProvider";

/**
 * DashboardLayout - Protected layout that enforces profile completion
 * 
 * Features:
 * - Checks if user is authenticated
 * - Checks if profile is completed
 * - Redirects to /dashboard/profile if profile is incomplete
 * - Allows access to profile pages for completion
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Routes that are allowed even without profile/preferences completion
  const allowedRoutes = [
    "/dashboard/profile",
    "/dashboard/profile/edit",
    "/dashboard/profile/preferences",
    "/dashboard/profile/my-account",
  ];

  // Check if current path is an allowed route
  const isAllowedRoute = allowedRoutes.some(route => pathname.startsWith(route));

  useEffect(() => {
    const checkProfileCompletion = async () => {
      try {
        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          // Not logged in, redirect to login
          router.push("/login");
          return;
        }

        // Store user ID for OneSignal and other integrations
        setUserId(session.user.id);

        // If on an allowed route, let them through
        if (isAllowedRoute) {
          setChecking(false);
          setLoading(false);
          return;
        }

        // Check profile and preferences completion status
        const { data: progress, error: progressError } = await supabase
          .from("user_progress")
          .select("profile_completed, preferences_completed")
          .eq("user_id", session.user.id)
          .maybeSingle();

        // If no progress record exists, create one and redirect to profile edit
        if (progressError || !progress) {
          await supabase.from("user_progress").upsert([
            { 
              user_id: session.user.id, 
              profile_completed: false, 
              preferences_completed: false 
            }
          ], { onConflict: "user_id" });
          
          // Redirect to profile edit page - draft will be automatically loaded if available
          router.push("/dashboard/profile/edit");
          return;
        }

        // If profile is not completed, redirect to profile edit page
        // Draft will be automatically loaded if available, allowing users to resume
        if (!progress.profile_completed) {
          router.push("/dashboard/profile/edit");
          return;
        }

        // If profile is completed but preferences are not, redirect to preferences edit page
        // Draft will be automatically loaded if available, allowing users to resume
        if (!progress.preferences_completed) {
          router.push("/dashboard/profile/preferences");
          return;
        }

        // Both profile and preferences are completed, allow access
        setChecking(false);
      } catch (error) {
        console.error("Error checking profile completion:", error);
        // On error, allow access but log it
        setChecking(false);
      } finally {
        setLoading(false);
      }
    };

    checkProfileCompletion();
  }, [router, pathname, isAllowedRoute]);

  // ---------------------------------------------------------------
  // Heartbeat — update last_active_at every 2 minutes
  // ---------------------------------------------------------------
  const heartbeatRef = useRef(false);

  useEffect(() => {
    if (loading || checking) return; // Wait until auth check is done

    /** Send a single heartbeat to update last_active_at */
    const sendHeartbeat = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        await fetch("/api/profile/heartbeat", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch {
        // Heartbeat is non-critical — silently ignore errors
      }
    };

    // Fire immediately on first load (only once)
    if (!heartbeatRef.current) {
      heartbeatRef.current = true;
      sendHeartbeat();
    }

    // Then every 2 minutes
    const interval = setInterval(sendHeartbeat, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loading, checking]);

  // Show loading spinner while checking
  if (loading || checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Full-screen overlay pages (edit, my-account) should not show mobile nav
  const isOverlayPage =
    pathname.includes("/profile/edit") ||
    pathname.includes("/profile/my-account") ||
    pathname.includes("/profile/notifications") ||
    pathname.includes("/meetings/join");

  return (
    <>
      <OneSignalProvider userId={userId} />
      <div className={!isOverlayPage ? "mobile-nav-spacing" : ""}>
        {children}
      </div>
      {!isOverlayPage && <MobileNav />}
    </>
  );
}
