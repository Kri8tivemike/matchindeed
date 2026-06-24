import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getGenderChangeStatus } from "@/lib/profile/gender-change";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function extractBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.replace("Bearer ", "");
}

export async function GET(req: NextRequest) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const status = await getGenderChangeStatus(supabaseAdmin, data.user.id);
    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[profile/gender-change-status] error:", error);
    return NextResponse.json(
      { error: "Failed to load gender change status" },
      { status: 500 }
    );
  }
}
