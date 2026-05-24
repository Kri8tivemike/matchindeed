import { redirect } from "next/navigation";
import { GROWTH_MANAGER_DASHBOARD_PATH } from "@/lib/growth-manager/path";

export default function GrowthManagerIndexPage() {
  redirect(GROWTH_MANAGER_DASHBOARD_PATH);
}
