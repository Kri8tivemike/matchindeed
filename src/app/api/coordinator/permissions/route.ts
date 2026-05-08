import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { COORDINATOR_PERMISSIONS } from "@/lib/admin-permissions";
import { loadEffectiveAccountPermissions } from "@/lib/account-permissions";
import { loadCoordinatorAccessForUser } from "@/lib/coordinator/server-access";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = await loadCoordinatorAccessForUser(user.id);

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error || "Coordinator access required" },
        { status: access.status }
      );
    }

    const role = String(access.account?.role || "");
    if (role === "admin" || role === "superadmin") {
      return NextResponse.json({
        permissions: [...COORDINATOR_PERMISSIONS],
        configured: true,
      });
    }

    const effective = await loadEffectiveAccountPermissions(
      user.id,
      "coordinator"
    );

    return NextResponse.json({
      permissions: [...effective.permissions],
      configured: effective.configured,
    });
  } catch (error) {
    console.error("Error in GET /api/coordinator/permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
