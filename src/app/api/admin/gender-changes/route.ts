import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const REVIEWABLE_STATUSES = ["pending_verification", "pending_approval"];

function normalizeDecision(value: unknown) {
  if (value === "approved" || value === "rejected") return value;
  return null;
}

async function restoreIfEligible(eventId: string) {
  const { data: event, error: eventError } = await supabase
    .from("gender_change_events")
    .select("id, user_id, pause_until, previous_profile_visible, status, restored_at")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    if (eventError) throw eventError;
    return { restored: false };
  }

  const pauseUntil =
    typeof event.pause_until === "string" ? Date.parse(event.pause_until) : Number.NaN;
  if (
    event.status !== "approved" ||
    event.restored_at ||
    event.previous_profile_visible !== true ||
    !Number.isFinite(pauseUntil) ||
    pauseUntil > Date.now()
  ) {
    return { restored: false };
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("account_status, profile_visible, profile_status")
    .eq("id", event.user_id)
    .maybeSingle();

  if (accountError) throw accountError;

  const accountRow = account as {
    account_status?: string | null;
    profile_visible?: boolean | null;
    profile_status?: string | null;
  } | null;

  const shouldRestore =
    accountRow?.account_status === "active" &&
    accountRow?.profile_visible === false &&
    accountRow?.profile_status === "hidden";

  if (!shouldRestore) {
    await supabase
      .from("gender_change_events")
      .update({ restored_at: new Date().toISOString() })
      .eq("id", event.id);
    return { restored: false };
  }

  const { error: accountUpdateError } = await supabase
    .from("accounts")
    .update({
      profile_visible: true,
      profile_status: "online",
    })
    .eq("id", event.user_id)
    .eq("account_status", "active")
    .eq("profile_visible", false)
    .eq("profile_status", "hidden");

  if (accountUpdateError) throw accountUpdateError;

  const { error: eventUpdateError } = await supabase
    .from("gender_change_events")
    .update({
      status: "restored",
      restored_at: new Date().toISOString(),
    })
    .eq("id", event.id);

  if (eventUpdateError) throw eventUpdateError;
  return { restored: true };
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["moderate_photos", "edit_users"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = supabase
      .from("gender_change_events")
      .select(
        "id, user_id, old_gender, new_gender, changed_at, pause_until, previous_profile_visible, status, verification_completed_at, approval_reviewed_at, approval_reviewed_by, approval_notes, restored_at, metadata"
      )
      .order("changed_at", { ascending: false })
      .limit(100);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: events, error } = await query;
    if (error) throw error;

    const userIds = Array.from(
      new Set((events || []).map((event) => event.user_id).filter(Boolean))
    );
    const reviewerIds = Array.from(
      new Set(
        (events || [])
          .map((event) => event.approval_reviewed_by)
          .filter((value): value is string => typeof value === "string")
      )
    );

    const [{ data: accounts }, { data: profiles }, { data: reviewers }] =
      await Promise.all([
        userIds.length
          ? supabase
              .from("accounts")
              .select("id, email, display_name, account_status, profile_visible, profile_status")
              .in("id", userIds)
          : Promise.resolve({ data: [] }),
        userIds.length
          ? supabase
              .from("user_profiles")
              .select("user_id, first_name")
              .in("user_id", userIds)
          : Promise.resolve({ data: [] }),
        reviewerIds.length
          ? supabase
              .from("accounts")
              .select("id, email, display_name")
              .in("id", reviewerIds)
          : Promise.resolve({ data: [] }),
      ]);

    const accountMap = new Map((accounts || []).map((row) => [row.id, row]));
    const profileMap = new Map((profiles || []).map((row) => [row.user_id, row]));
    const reviewerMap = new Map((reviewers || []).map((row) => [row.id, row]));

    return NextResponse.json({
      success: true,
      events: (events || []).map((event) => ({
        ...event,
        user: accountMap.get(event.user_id) || null,
        profile: profileMap.get(event.user_id) || null,
        reviewer:
          typeof event.approval_reviewed_by === "string"
            ? reviewerMap.get(event.approval_reviewed_by) || null
            : null,
      })),
    });
  } catch (error) {
    console.error("[admin/gender-changes] GET failed:", error);
    return NextResponse.json(
      { error: "Failed to load gender change requests" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["moderate_photos", "edit_users"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json().catch(() => null);
    const eventId =
      body && typeof body === "object" && typeof (body as { eventId?: unknown }).eventId === "string"
        ? (body as { eventId: string }).eventId
        : "";
    const decision = normalizeDecision(
      body && typeof body === "object"
        ? (body as { decision?: unknown }).decision
        : null
    );
    const notes =
      body && typeof body === "object" && typeof (body as { notes?: unknown }).notes === "string"
        ? (body as { notes: string }).notes.trim()
        : "";

    if (!eventId || !decision) {
      return NextResponse.json(
        { error: "eventId and decision are required" },
        { status: 400 }
      );
    }

    const { data: event, error: eventError } = await supabase
      .from("gender_change_events")
      .select("id, user_id, status")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) throw eventError;
    if (!event) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (!REVIEWABLE_STATUSES.includes(event.status)) {
      return NextResponse.json(
        { error: `Request cannot be reviewed in status '${event.status}'` },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("gender_change_events")
      .update({
        status: decision,
        approval_reviewed_at: now,
        approval_reviewed_by: guard.context.userId,
        approval_notes: notes || null,
      })
      .eq("id", event.id);

    if (updateError) throw updateError;

    let restored = false;
    if (decision === "approved") {
      restored = (await restoreIfEligible(event.id)).restored;
    }

    await supabase.from("admin_logs").insert({
      admin_id: guard.context.userId,
      target_user_id: event.user_id,
      action: `gender_change_${decision}`,
      meta: {
        event_id: event.id,
        decision,
        notes: notes || null,
        restored,
      },
    });

    return NextResponse.json({
      success: true,
      decision,
      restored,
    });
  } catch (error) {
    console.error("[admin/gender-changes] POST failed:", error);
    return NextResponse.json(
      { error: "Failed to review gender change request" },
      { status: 500 }
    );
  }
}
