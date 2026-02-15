import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Health Check Endpoint
 * Used by BetterStack (or any uptime monitor) to verify the app is running.
 *
 * Returns:
 * - 200 with { status: "healthy" } when everything is OK
 * - 503 with { status: "degraded" } when database is unreachable
 *
 * Setup in BetterStack:
 * 1. Create account at https://betterstack.com
 * 2. Add monitor: GET https://www.matchindeed.com/api/health
 * 3. Expected status: 200
 * 4. Check interval: 60 seconds
 * 5. Alert via: Slack, email, or SMS
 */
export async function GET() {
  const checks: Record<string, boolean> = {
    app: true,
    database: false,
  };

  // Check Supabase connectivity
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase
      .from("accounts")
      .select("id")
      .limit(1)
      .single();
    // Even if no rows, a successful query means the DB is up
    checks.database = !error || error.code === "PGRST116"; // PGRST116 = no rows
  } catch {
    checks.database = false;
  }

  const allHealthy = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 }
  );
}
