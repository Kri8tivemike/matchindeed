import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import {
  listReferralAmbassadors,
  normalizeAmbassadorStatus,
  parseAmbassadorTarget,
} from "@/lib/referrals/ambassadors";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function nullableIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nullableText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function logAmbassadorAction(
  actorId: string,
  action: string,
  meta: Record<string, unknown>
) {
  await supabase.from("referral_audit_logs").insert({
    actor_id: actorId,
    action,
    meta,
  });
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["view_referrals", "manage_referral_rewards"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    return NextResponse.json(await listReferralAmbassadors(supabase));
  } catch (error) {
    console.error("[admin/referrals/ambassadors][GET] error:", error);
    return NextResponse.json(
      { error: "Failed to load referral ambassadors" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_referral_settings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json().catch(() => ({}));
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const payload = {
      user_id: userId,
      status: normalizeAmbassadorStatus(body.status),
      contract_target_referrals: parseAmbassadorTarget(body.contractTargetReferrals),
      contract_target_subscriptions: parseAmbassadorTarget(
        body.contractTargetSubscriptions
      ),
      starts_at: nullableIsoDate(body.startsAt),
      ends_at: nullableIsoDate(body.endsAt),
      notes: nullableText(body.notes),
      created_by: guard.context.userId,
      updated_by: guard.context.userId,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("referral_ambassadors")
      .upsert(payload, { onConflict: "user_id" })
      .select("id, user_id")
      .maybeSingle<{ id: string; user_id: string }>();

    if (error) throw error;

    await logAmbassadorAction(guard.context.userId, "referral_ambassador_saved", {
      ambassador_id: data?.id || null,
      user_id: userId,
      contract_target_referrals: payload.contract_target_referrals,
      contract_target_subscriptions: payload.contract_target_subscriptions,
      status: payload.status,
    });

    return NextResponse.json(await listReferralAmbassadors(supabase));
  } catch (error) {
    console.error("[admin/referrals/ambassadors][POST] error:", error);
    return NextResponse.json(
      { error: "Failed to save referral ambassador" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_referral_settings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json().catch(() => ({}));
    const ambassadorId =
      typeof body.ambassadorId === "string" ? body.ambassadorId.trim() : "";
    if (!ambassadorId) {
      return NextResponse.json(
        { error: "ambassadorId is required" },
        { status: 400 }
      );
    }

    const updates = {
      status: normalizeAmbassadorStatus(body.status),
      contract_target_referrals: parseAmbassadorTarget(body.contractTargetReferrals),
      contract_target_subscriptions: parseAmbassadorTarget(
        body.contractTargetSubscriptions
      ),
      starts_at: nullableIsoDate(body.startsAt),
      ends_at: nullableIsoDate(body.endsAt),
      notes: nullableText(body.notes),
      updated_by: guard.context.userId,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("referral_ambassadors")
      .update(updates)
      .eq("id", ambassadorId)
      .select("id, user_id")
      .maybeSingle<{ id: string; user_id: string }>();

    if (error) throw error;
    if (!data?.id) {
      return NextResponse.json(
        { error: "Ambassador not found" },
        { status: 404 }
      );
    }

    await logAmbassadorAction(guard.context.userId, "referral_ambassador_updated", {
      ambassador_id: data.id,
      user_id: data.user_id,
      ...updates,
    });

    return NextResponse.json(await listReferralAmbassadors(supabase));
  } catch (error) {
    console.error("[admin/referrals/ambassadors][PATCH] error:", error);
    return NextResponse.json(
      { error: "Failed to update referral ambassador" },
      { status: 500 }
    );
  }
}
