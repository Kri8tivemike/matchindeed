/**
 * Heartbeat API
 *
 * POST — Update the current user's last_active_at timestamp.
 * Called periodically from the dashboard layout to track activity.
 * Lightweight endpoint — minimal processing for low latency.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // Update last_active_at — gracefully handle missing column
    const { error: updateError } = await supabaseAdmin
      .from("accounts")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", user.id);

    if (updateError && updateError.code === "42703") {
      // Column doesn't exist yet — migration not run, silently skip
      return NextResponse.json({ ok: true });
    }

    if (updateError) {
      console.error("Heartbeat update error:", updateError);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Don't fail — heartbeat is non-critical
  }
}
