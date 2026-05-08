import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin/permissions";

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    return NextResponse.json({
      user_id: guard.context.userId,
      role: guard.context.role,
      permissions: [...guard.context.permissions],
    });
  } catch (error) {
    console.error("Error in GET /api/admin/permissions/me:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
