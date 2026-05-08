import { NextRequest, NextResponse } from "next/server";
import { createClient, type PostgrestError } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isMissingBlockedUsersTable(error: PostgrestError | null): boolean {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (error.code === "PGRST204" && message.includes("blocked_users")) ||
    message.includes("blocked_users")
  );
}

async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null, error: "Missing or invalid authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return { user: null, error: "Invalid or expired token" };
  }
  return { user, error: null };
}

export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const [blockedByMe, blockedMe] = await Promise.all([
      supabaseAdmin
        .from("blocked_users")
        .select("blocked_id")
        .eq("blocker_id", user.id),
      supabaseAdmin
        .from("blocked_users")
        .select("blocker_id")
        .eq("blocked_id", user.id),
    ]);

    if (isMissingBlockedUsersTable(blockedByMe.error) || isMissingBlockedUsersTable(blockedMe.error)) {
      return NextResponse.json({ blocked_ids: [] });
    }

    if (blockedByMe.error || blockedMe.error) {
      return NextResponse.json(
        { error: "Failed to fetch blocked user ids" },
        { status: 500 }
      );
    }

    const ids = new Set<string>();
    (blockedByMe.data || []).forEach((row) => ids.add(row.blocked_id));
    (blockedMe.data || []).forEach((row) => ids.add(row.blocker_id));

    return NextResponse.json({ blocked_ids: Array.from(ids) });
  } catch {
    return NextResponse.json({ blocked_ids: [] });
  }
}
