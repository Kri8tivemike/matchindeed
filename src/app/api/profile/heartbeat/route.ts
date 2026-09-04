/**
 * Heartbeat API
 *
 * POST — Update the current user's last_active_at timestamp.
 * Called periodically from the dashboard layout to track activity.
 * Lightweight endpoint — minimal processing for low latency.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendPeopleNearYouActiveAlerts,
  shouldTriggerPeopleNearYouActiveAlert,
} from "@/lib/alerts/people-near-you";
import {
  getInactiveAccountMessage,
  isExpiredSuspension,
} from "@/lib/admin/account-moderation";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let hasLastActiveAtColumn: boolean | null = null;

type HeartbeatAccount = {
  last_active_at: string | null;
  account_status: string | null;
  suspended_until: string | null;
};

function isMissingLastActiveAtColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "42703" || // postgres undefined_column
    code === "PGRST204" || // postgrest schema cache missing column
    message.includes("last_active_at")
  );
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let previousAccount: HeartbeatAccount | null = null;
    let previousAccountResult = await supabaseAdmin
      .from("accounts")
      .select("last_active_at, account_status, suspended_until")
      .eq("id", user.id)
      .maybeSingle();

    if (isMissingLastActiveAtColumn(previousAccountResult.error)) {
      hasLastActiveAtColumn = false;
      previousAccountResult = await supabaseAdmin
        .from("accounts")
        .select("account_status, suspended_until")
        .eq("id", user.id)
        .maybeSingle();
    }

    if (!previousAccountResult.error && previousAccountResult.data) {
      previousAccount = {
        last_active_at:
          "last_active_at" in previousAccountResult.data
            ? String(previousAccountResult.data.last_active_at || "") || null
            : null,
        account_status: previousAccountResult.data.account_status,
        suspended_until: previousAccountResult.data.suspended_until,
      };
    }

    const inactiveMessage = getInactiveAccountMessage(
      previousAccount?.account_status,
      previousAccount?.suspended_until
    );
    if (previousAccount && inactiveMessage) {
      return NextResponse.json(
        { error: inactiveMessage, code: "account_inactive" },
        { status: 403 }
      );
    }

    const expiredSuspension =
      previousAccount && isExpiredSuspension(previousAccount);

    // If this older schema has no activity column, status enforcement still ran.
    if (hasLastActiveAtColumn === false) {
      if (expiredSuspension) {
        await supabaseAdmin
          .from("accounts")
          .update({
            account_status: "active",
            suspended_until: null,
            suspension_reason: null,
          })
          .eq("id", user.id);
      }
      return NextResponse.json({ ok: true });
    }

    // Update last_active_at — gracefully handle missing column
    const heartbeatUpdate: Record<string, string | null> = {
      last_active_at: new Date().toISOString(),
    };
    if (expiredSuspension) {
      heartbeatUpdate.account_status = "active";
      heartbeatUpdate.suspended_until = null;
      heartbeatUpdate.suspension_reason = null;
    }

    const { error: updateError } = await supabaseAdmin
      .from("accounts")
      .update(heartbeatUpdate)
      .eq("id", user.id);

    if (isMissingLastActiveAtColumn(updateError)) {
      // Column doesn't exist in the current DB/schema cache.
      // Memoize to avoid logging the same non-critical error on every heartbeat.
      hasLastActiveAtColumn = false;
      return NextResponse.json({ ok: true });
    }

    if (updateError) {
      console.error("Heartbeat update error:", updateError);
    } else {
      hasLastActiveAtColumn = true;
      if (shouldTriggerPeopleNearYouActiveAlert(previousAccount?.last_active_at || null)) {
        try {
          await sendPeopleNearYouActiveAlerts({
            supabase: supabaseAdmin,
            activeUserId: user.id,
          });
        } catch (alertError) {
          console.error("People-near-you alert error:", alertError);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Don't fail — heartbeat is non-critical
  }
}
