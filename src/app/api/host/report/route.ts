import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Host Report API
 * 
 * Allows hosts to report issues with meetings, guests, or platform problems.
 * 
 * POST /api/host/report - Submit a new report
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Valid report types
const VALID_REPORT_TYPES = [
  "guest_behavior",
  "meeting_issue",
  "payment_problem",
  "technical_issue",
  "safety_concern",
  "other",
];

/**
 * Authenticate the request and return the user ID
 */
async function getAuthUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return user.id;
}

/**
 * Verify the user is a host
 */
async function verifyHost(userId: string): Promise<boolean> {
  const { data: account } = await supabase
    .from("accounts")
    .select("user_type")
    .eq("id", userId)
    .single();

  return account?.user_type === "host";
}

/**
 * POST /api/host/report
 * Submit a new report
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is a host
    const isHost = await verifyHost(userId);
    if (!isHost) {
      return NextResponse.json(
        { error: "Only hosts can submit reports" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { report_type, meeting_id, guest_id, title, description, severity } = body;

    // Validation
    if (!report_type || !VALID_REPORT_TYPES.includes(report_type)) {
      return NextResponse.json(
        { error: "Invalid report_type" },
        { status: 400 }
      );
    }

    if (!title || title.trim().length < 5) {
      return NextResponse.json(
        { error: "Title must be at least 5 characters" },
        { status: 400 }
      );
    }

    if (!description || description.trim().length < 10) {
      return NextResponse.json(
        { error: "Description must be at least 10 characters" },
        { status: 400 }
      );
    }

    const validSeverities = ["low", "medium", "high", "critical"];
    const severityLevel = severity && validSeverities.includes(severity) ? severity : "medium";

    // Create report
    const { data: report, error } = await supabase
      .from("host_reports")
      .insert([
        {
          host_id: userId,
          report_type,
          meeting_id: meeting_id || null,
          guest_id: guest_id || null,
          title,
          description,
          severity: severityLevel,
          status: "pending",
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("[host/report] DB Error:", error);
      return NextResponse.json(
        { error: "Failed to create report" },
        { status: 500 }
      );
    }

    return NextResponse.json(report, { status: 201 });
  } catch (err) {
    console.error("[host/report] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
