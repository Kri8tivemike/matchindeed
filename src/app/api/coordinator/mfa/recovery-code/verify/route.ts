import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ADMIN_MFA_RECOVERY_ACTIONS,
  matchesAdminRecoveryCode,
  resolveAdminRecoveryStatus,
  type AdminMfaRecoveryLogRow,
} from "@/lib/admin/mfa-recovery";
import { requireCoordinatorAccess } from "@/lib/coordinator/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const guard = await requireCoordinatorAccess(request);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code : "";

    if (!code.trim()) {
      return NextResponse.json(
        { error: "Recovery code is required" },
        { status: 400 }
      );
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
      console.error("[admin/mfa/recovery-code/verify][POST] lookup error:", error);
      return NextResponse.json(
        { error: "Failed to verify recovery code" },
        { status: 500 }
      );
    }

    const state = resolveAdminRecoveryStatus(
      (data as AdminMfaRecoveryLogRow | null) || null
    );

    if (!state.active || !state.codeHash) {
      return NextResponse.json(
        { error: "No active recovery code is available for this account." },
        { status: 400 }
      );
    }

    if (!matchesAdminRecoveryCode(code, state.codeHash)) {
      return NextResponse.json(
        { error: "Invalid recovery code." },
        { status: 400 }
      );
    }

    const factorsResult = await supabase.auth.admin.mfa.listFactors({
      userId: guard.context.userId,
    });

    if (factorsResult.error) {
      console.error(
        "[admin/mfa/recovery-code/verify][POST] factor list error:",
        factorsResult.error
      );
      return NextResponse.json(
        { error: "Failed to reset authenticator factors" },
        { status: 500 }
      );
    }

    for (const factor of factorsResult.data?.factors || []) {
      const deleteResult = await supabase.auth.admin.mfa.deleteFactor({
        userId: guard.context.userId,
        id: factor.id,
      });

      if (deleteResult.error) {
        console.error(
          "[admin/mfa/recovery-code/verify][POST] factor delete error:",
          deleteResult.error
        );
        return NextResponse.json(
          { error: "Failed to reset authenticator factors" },
          { status: 500 }
        );
      }
    }

    const usedAt = new Date().toISOString();
    const { error: insertError } = await supabase.from("admin_logs").insert({
      admin_id: guard.context.userId,
      target_user_id: guard.context.userId,
      action: ADMIN_MFA_RECOVERY_ACTIONS.used,
      meta: {
        created_at: state.createdAt,
        used_at: usedAt,
        factors_reset: (factorsResult.data?.factors || []).length,
      },
    });

    if (insertError) {
      console.error(
        "[admin/mfa/recovery-code/verify][POST] insert error:",
        insertError
      );
      return NextResponse.json(
        { error: "Failed to consume recovery code" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      used_at: usedAt,
      redirect_to_mfa_setup: true,
    });
  } catch (error) {
    console.error("[admin/mfa/recovery-code/verify][POST] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
