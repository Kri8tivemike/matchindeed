import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

    const access = await loadCoordinatorAccessForUser(user.id, {
      repair: true,
    });

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error || "Coordinator access required" },
        { status: access.status }
      );
    }

    return NextResponse.json({
      account: access.account,
      coordinator: access.coordinator,
    });
  } catch (error) {
    console.error("Error in GET /api/coordinator/access:", error);
    return NextResponse.json(
      { error: "Unable to verify coordinator access." },
      { status: 500 }
    );
  }
}
