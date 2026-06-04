import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function escapeLike(value: string) {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["view_referrals", "manage_referral_settings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").trim();
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") || 10)));

    let query = supabase
      .from("accounts")
      .select("id, email, display_name, tier, role, created_at")
      .eq("role", "user")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      query = query.or(`email.ilike.${pattern},display_name.ilike.${pattern}`);
    }

    const { data: accounts, error } = await query;
    if (error) throw error;

    const userIds = (accounts || []).map((account) => account.id);
    const { data: ambassadors } = userIds.length
      ? await supabase
          .from("referral_ambassadors")
          .select("user_id, status")
          .in("user_id", userIds)
      : { data: [] };
    const ambassadorStatus = new Map(
      (ambassadors || []).map((ambassador) => [
        ambassador.user_id,
        ambassador.status,
      ])
    );

    return NextResponse.json({
      users: (accounts || []).map((account) => ({
        ...account,
        ambassador_status: ambassadorStatus.get(account.id) || null,
      })),
    });
  } catch (error) {
    console.error("[admin/referrals/ambassadors/candidates] error:", error);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500 }
    );
  }
}
