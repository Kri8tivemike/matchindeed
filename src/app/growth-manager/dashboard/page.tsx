import { Suspense } from "react";
import ReferralOperationsDashboard from "@/components/referrals/ReferralOperationsDashboard";

export default function GrowthManagerDashboardPage() {
  return (
    <Suspense fallback={<GrowthManagerDashboardLoading />}>
      <ReferralOperationsDashboard />
    </Suspense>
  );
}

function GrowthManagerDashboardLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1f419a] border-t-transparent" />
    </div>
  );
}
