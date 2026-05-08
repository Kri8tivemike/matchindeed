import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import { getDefaultAccountPermissions, saveAccountPermissions } from "@/lib/account-permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type CoordinatorRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  enabled: boolean | null;
  permissions: Record<string, unknown> | null;
  created_at: string;
};

type AccountRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  account_status: string;
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function loadCoordinatorAccounts(userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, AccountRow>();
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id, email, display_name, role, account_status")
    .in("id", userIds);

  if (error) {
    throw error;
  }

  return new Map(
    ((data || []) as AccountRow[]).map((account) => [account.id, account])
  );
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_hosts", "manage_meetings", "view_meetings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { data, error } = await supabase
      .from("meeting_coordinators")
      .select("id, name, email, phone, user_id, enabled, permissions, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[admin/coordinators][GET] coordinators error:", error);
      return NextResponse.json(
        { error: "Failed to load coordinators" },
        { status: 500 }
      );
    }

    const coordinators = (data || []) as CoordinatorRow[];
    const accountMap = await loadCoordinatorAccounts(
      coordinators
        .map((coordinator) => coordinator.user_id)
        .filter((userId): userId is string => !!userId)
    );

    return NextResponse.json({
      coordinators: coordinators.map((coordinator) => ({
        ...coordinator,
        enabled: coordinator.enabled !== false,
        account: coordinator.user_id
          ? accountMap.get(coordinator.user_id) || null
          : null,
      })),
    });
  } catch (error) {
    console.error("[admin/coordinators][GET] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_hosts", "manage_meetings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = normalizeEmail(body.email);
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";

    if (!name || !email) {
      return NextResponse.json(
        { error: "Coordinator name and email are required" },
        { status: 400 }
      );
    }

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id, email, display_name, role, account_status")
      .eq("email", email)
      .maybeSingle();

    if (accountError) {
      console.error("[admin/coordinators][POST] account lookup error:", accountError);
      return NextResponse.json(
        { error: "Failed to verify coordinator account" },
        { status: 500 }
      );
    }

    if (!account) {
      return NextResponse.json(
        {
          error:
            "No user account found for this email. Ask the coordinator to create an account first, then add them here.",
        },
        { status: 400 }
      );
    }

    if (account.account_status !== "active") {
      return NextResponse.json(
        { error: "Coordinator account must be active before assignment." },
        { status: 400 }
      );
    }

    if (account.role === "user") {
      const { error: roleError } = await supabase
        .from("accounts")
        .update({ role: "coordinator" })
        .eq("id", account.id);

      if (roleError) {
        console.error("[admin/coordinators][POST] role update error:", roleError);
        return NextResponse.json(
          { error: "Failed to enable coordinator role for this account" },
          { status: 500 }
        );
      }
    }

    const { data: coordinator, error: coordinatorError } = await supabase
      .from("meeting_coordinators")
      .upsert(
        {
          name,
          email,
          phone: phone || null,
          user_id: account.id,
          enabled: true,
          created_by: guard.context.userId,
        },
        { onConflict: "email" }
      )
      .select("id, name, email, phone, user_id, enabled, permissions, created_at")
      .single();

    if (coordinatorError) {
      console.error("[admin/coordinators][POST] coordinator upsert error:", coordinatorError);
      return NextResponse.json(
        { error: "Failed to save coordinator" },
        { status: 500 }
      );
    }

    if (account.role === "user" || account.role === "coordinator") {
      await saveAccountPermissions({
        userId: account.id,
        permissions: getDefaultAccountPermissions("coordinator"),
        configuredBy: guard.context.userId,
      });
    }

    await supabase.from("admin_logs").insert({
      admin_id: guard.context.userId,
      target_user_id: account.id,
      action: "coordinator_saved",
      meta: {
        coordinator_id: coordinator.id,
        email,
      },
    });

    return NextResponse.json({
      success: true,
      coordinator: {
        ...(coordinator as CoordinatorRow),
        account: {
          ...account,
          role: account.role === "user" ? "coordinator" : account.role,
        },
      },
    });
  } catch (error) {
    console.error("[admin/coordinators][POST] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_hosts", "manage_meetings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = await request.json();
    const coordinatorId =
      typeof body.coordinator_id === "string" ? body.coordinator_id : "";
    const enabled = body.enabled;

    if (!coordinatorId || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "coordinator_id and enabled are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("meeting_coordinators")
      .update({ enabled })
      .eq("id", coordinatorId)
      .select("id, user_id, email")
      .single();

    if (error) {
      console.error("[admin/coordinators][PATCH] update error:", error);
      return NextResponse.json(
        { error: "Failed to update coordinator" },
        { status: 500 }
      );
    }

    await supabase.from("admin_logs").insert({
      admin_id: guard.context.userId,
      target_user_id: data.user_id,
      action: enabled ? "coordinator_enabled" : "coordinator_disabled",
      meta: {
        coordinator_id: coordinatorId,
        email: data.email,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/coordinators][PATCH] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
