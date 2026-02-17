import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Admin Permissions API
 *
 * GET: List permissions by role
 * POST: Update permissions for a role (superadmin only)
 *
 * GET /api/admin/permissions?role=moderator
 * POST /api/admin/permissions
 * Body: { role, permissions: string[] }
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function verifySuperAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return false;

  const { data: account } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();

  return account?.role === "superadmin";
}

import { ALL_PERMISSIONS } from "@/lib/admin-permissions";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");

    let query = supabase
      .from("admin_permissions")
      .select("id, role, permission, created_at")
      .order("role")
      .order("permission");

    if (role) {
      query = query.eq("role", role);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching permissions:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Group by role
    const byRole: Record<string, string[]> = {};
    for (const row of data || []) {
      if (!byRole[row.role]) byRole[row.role] = [];
      byRole[row.role].push(row.permission);
    }

    return NextResponse.json({
      permissions: data || [],
      by_role: byRole,
    });
  } catch (error) {
    console.error("Error in GET /api/admin/permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const isSuperAdmin = await verifySuperAdmin(request);
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Superadmin role required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { role, permissions } = body;

    if (!role || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: "role and permissions (array) required" },
        { status: 400 }
      );
    }

    if (!["moderator", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "role must be moderator or admin" },
        { status: 400 }
      );
    }

    // Delete existing permissions for role
    await supabase
      .from("admin_permissions")
      .delete()
      .eq("role", role);

    // Insert new permissions
    if (permissions.length > 0) {
      const rows = permissions.map((p: string) => ({
        role,
        permission: p,
      }));
      const { error } = await supabase
        .from("admin_permissions")
        .insert(rows);

      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      role,
      permissions,
    });
  } catch (error) {
    console.error("Error in POST /api/admin/permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
