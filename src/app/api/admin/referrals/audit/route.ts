import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  referral_id: string | null;
  reward_id: string | null;
  action: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: [
        "view_referrals",
        "manage_referral_rewards",
        "manage_referral_settings",
        "review_referral_fraud",
      ],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: auditLogs, error, count } = await supabase
      .from("referral_audit_logs")
      .select("id, actor_id, referral_id, reward_id, action, meta, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<AuditLogRow[]>();

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json({
          audit_logs: [],
          pagination: { page, limit, total: 0, total_pages: 1 },
        });
      }
      throw error;
    }

    const actorIds = [
      ...new Set(
        (auditLogs || [])
          .map((row) => row.actor_id)
          .filter((actorId): actorId is string => Boolean(actorId))
      ),
    ];

    const { data: actors } = actorIds.length
      ? await supabase
          .from("accounts")
          .select("id, email, display_name")
          .in("id", actorIds)
      : { data: [] };
    const actorMap = new Map((actors || []).map((actor) => [actor.id, actor]));

    return NextResponse.json({
      audit_logs: (auditLogs || []).map((row) => ({
        ...row,
        actor: row.actor_id ? actorMap.get(row.actor_id) || null : null,
      })),
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.max(1, Math.ceil((count || 0) / limit)),
      },
    });
  } catch (error) {
    console.error("[admin/referrals/audit] error:", error);
    return NextResponse.json(
      { error: "Failed to load referral audit logs" },
      { status: 500 }
    );
  }
}
