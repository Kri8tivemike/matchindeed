import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import {
  ADMIN_MFA_RECOVERY_ACTIONS,
  type AdminMfaRecoveryLogRow,
  generateAdminRecoveryCode,
  hashAdminRecoveryCode,
  resolveAdminRecoveryStatus,
} from "@/lib/admin/mfa-recovery";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { data, error } = await supabase
      .from("admin_logs")
      .select("action, created_at, meta")
      .eq("target_user_id", guard.context.userId)
      .in("action", [
        ADMIN_MFA_RECOVERY_ACTIONS.generated,
        ADMIN_MFA_RECOVERY_ACTIONS.used,
        ADMIN_MFA_RECOVERY_ACTIONS.deleted,
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[admin/mfa/recovery-code][GET] lookup error:", error);
      return NextResponse.json(
        { error: "Failed to load recovery code status" },
        { status: 500 }
      );
    }

    const state = resolveAdminRecoveryStatus(
      (data as AdminMfaRecoveryLogRow | null) || null
    );

    return NextResponse.json({
      has_recovery_code: state.hasRecoveryCode,
      active: state.active,
      created_at: state.createdAt,
      used_at: state.usedAt,
    });
  } catch (error) {
    console.error("[admin/mfa/recovery-code][GET] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const recoveryCode = generateAdminRecoveryCode();
    const nowIso = new Date().toISOString();

    const { error } = await supabase.from("admin_logs").insert({
      admin_id: guard.context.userId,
      target_user_id: guard.context.userId,
      action: ADMIN_MFA_RECOVERY_ACTIONS.generated,
      meta: {
        code_hash: hashAdminRecoveryCode(recoveryCode),
        generated_at: nowIso,
      },
    });

    if (error) {
      console.error("[admin/mfa/recovery-code][POST] insert error:", error);
      return NextResponse.json(
        { error: "Failed to generate recovery code" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      recovery_code: recoveryCode,
      created_at: nowIso,
    });
  } catch (error) {
    console.error("[admin/mfa/recovery-code][POST] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { error } = await supabase
      .from("admin_logs")
      .insert({
        admin_id: guard.context.userId,
        target_user_id: guard.context.userId,
        action: ADMIN_MFA_RECOVERY_ACTIONS.deleted,
        meta: {
          deleted_at: new Date().toISOString(),
        },
      });

    if (error) {
      console.error("[admin/mfa/recovery-code][DELETE] insert error:", error);
      return NextResponse.json(
        { error: "Failed to remove recovery code" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/mfa/recovery-code][DELETE] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
