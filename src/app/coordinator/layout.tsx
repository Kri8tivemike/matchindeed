"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { coordinatorLoginUrl, COORDINATOR_DASHBOARD_PATH } from "@/lib/coordinator/path";
import CoordinatorSidebar from "./components/CoordinatorSidebar";

type CoordinatorUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  permissions: string[];
};

export default function CoordinatorLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [coordinatorUser, setCoordinatorUser] = useState<CoordinatorUser | null>(
    null
  );

  useEffect(() => {
    const checkCoordinatorAccess = async () => {
      setLoading(true);
      setAccessDenied(false);

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          const next = pathname || COORDINATOR_DASHBOARD_PATH;
          router.push(coordinatorLoginUrl(next));
          return;
        }

        const accessResponse = await fetch("/api/coordinator/access", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        const accessData = await accessResponse.json().catch(() => ({}));

        if (!accessResponse.ok || !accessData.account) {
          console.error("Error verifying coordinator access:", accessData);
          setAccessDenied(true);
          return;
        }

        const permissionsResponse = await fetch("/api/coordinator/permissions", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        const permissionsData = await permissionsResponse.json().catch(() => ({}));

        if (!permissionsResponse.ok) {
          console.error("Error fetching coordinator permissions:", permissionsData);
          setAccessDenied(true);
          return;
        }

        setCoordinatorUser({
          id: String(accessData.account.id),
          email: accessData.account.email || null,
          display_name: accessData.account.display_name || null,
          permissions: Array.isArray(permissionsData.permissions)
            ? permissionsData.permissions
            : [],
        });
      } catch (error) {
        console.error("Coordinator auth error:", error);
        setAccessDenied(true);
      } finally {
        setLoading(false);
      }
    };

    void checkCoordinatorAccess();
  }, [pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="text-gray-600">Loading coordinator panel...</p>
        </div>
      </div>
    );
  }

  if (accessDenied || !coordinatorUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-lg rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">
            Coordinator access required
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            This account is not enabled as a coordinator yet. Please ask an admin
            to add this account under Coordinators.
          </p>
          <button
            type="button"
            onClick={() => router.push(coordinatorLoginUrl())}
            className="mt-5 rounded-xl bg-[#1f419a] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#17357b]"
          >
            Sign in with coordinator account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <CoordinatorSidebar
        userName={
          coordinatorUser.display_name || coordinatorUser.email || "Coordinator"
        }
        userEmail={coordinatorUser.email}
        permissions={coordinatorUser.permissions}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
