"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { GROWTH_MANAGER_LOGIN_PATH } from "@/lib/growth-manager/path";
import GrowthManagerSidebar from "./components/GrowthManagerSidebar";

const REFERRAL_PERMISSIONS = new Set([
  "view_referrals",
  "manage_referral_rewards",
  "manage_referral_settings",
  "review_referral_fraud",
]);

type GrowthManagerUser = {
  id: string;
  email: string;
  display_name: string | null;
  permissions: string[];
};

export default function GrowthManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [growthManagerUser, setGrowthManagerUser] =
    useState<GrowthManagerUser | null>(null);

  const isLoginPage = pathname === GROWTH_MANAGER_LOGIN_PATH;

  const hasReferralAccess = useMemo(() => {
    if (!growthManagerUser) return false;
    return (
      growthManagerUser.permissions.includes("*") ||
      growthManagerUser.permissions.some((permission) =>
        REFERRAL_PERMISSIONS.has(permission)
      )
    );
  }, [growthManagerUser]);

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return;
    }

    const checkGrowthManagerAuth = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          router.push(GROWTH_MANAGER_LOGIN_PATH);
          return;
        }

        const { data: account, error: accountError } = await supabase
          .from("accounts")
          .select("id, email, role, display_name")
          .eq("id", session.user.id)
          .single();

        if (accountError || !account) {
          router.push(GROWTH_MANAGER_LOGIN_PATH);
          return;
        }

        if (!["admin", "superadmin"].includes(account.role)) {
          router.push(`${GROWTH_MANAGER_LOGIN_PATH}?error=unauthorized`);
          return;
        }

        const permissionsResponse = await fetch("/api/admin/permissions/me", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        const permissionsData = await permissionsResponse
          .json()
          .catch(() => ({}));

        if (!permissionsResponse.ok) {
          router.push(`${GROWTH_MANAGER_LOGIN_PATH}?error=unauthorized`);
          return;
        }

        const permissions = Array.isArray(permissionsData.permissions)
          ? permissionsData.permissions.map(String)
          : [];
        const hasAnyReferralPermission =
          permissions.includes("*") ||
          permissions.some((permission: string) =>
            REFERRAL_PERMISSIONS.has(permission)
          );

        if (!hasAnyReferralPermission) {
          router.push(`${GROWTH_MANAGER_LOGIN_PATH}?error=unauthorized`);
          return;
        }

        setGrowthManagerUser({
          id: account.id,
          email: account.email,
          display_name: account.display_name,
          permissions,
        });
      } catch (error) {
        console.error("Growth Manager auth error:", error);
        router.push(GROWTH_MANAGER_LOGIN_PATH);
      } finally {
        setLoading(false);
      }
    };

    checkGrowthManagerAuth();
  }, [isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="text-gray-600">Loading Growth Manager dashboard...</p>
        </div>
      </div>
    );
  }

  if (!growthManagerUser || !hasReferralAccess) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <GrowthManagerSidebar
        userName={growthManagerUser.display_name || growthManagerUser.email}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
