import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateCronAuth } from "@/lib/cron-auth";
import { processDueScheduledAlerts } from "@/lib/alerts/scheduled-alerts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const cronAuth = validateCronAuth(request);
    if (!cronAuth.authorized) {
      return NextResponse.json(
        { error: cronAuth.error || "Unauthorized" },
        { status: cronAuth.status }
      );
    }

    const result = await processDueScheduledAlerts(supabase, { limit: 100 });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error in GET /api/cron/user-alerts:", error);
    return NextResponse.json(
      { error: "Failed to process scheduled user alerts" },
      { status: 500 }
    );
  }
}
