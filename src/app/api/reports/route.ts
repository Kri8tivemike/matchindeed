import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * User Reports API
 *
 * Allows authenticated users to report other users for:
 * - fake_profile, harassment, inappropriate_content, scam, spam,
 *   underage, impersonation, threats, other
 *
 * POST /api/reports         — Submit a new report
 * GET  /api/reports?target=ID — Check if user already reported a target
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Valid report reasons
const VALID_REASONS = [
  "fake_profile",
  "harassment",
  "inappropriate_content",
  "scam",
  "spam",
  "underage",
  "impersonation",
  "threats",
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
 * POST /api/reports
 * Submit a new user report
 *
 * Body: {
 *   reported_user_id: string,  — The user being reported
 *   reason: string,            — One of the valid reasons
 *   description?: string,      — Optional free-text details
 *   priority?: string          — Auto-set based on reason (user can't override)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { reported_user_id, reason, description } = body;

    // Validate required fields
    if (!reported_user_id || !reason) {
      return NextResponse.json(
        { error: "reported_user_id and reason are required" },
        { status: 400 }
      );
    }

    // Validate reason
    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        {
          error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Prevent self-reporting
    if (userId === reported_user_id) {
      return NextResponse.json(
        { error: "Cannot report yourself" },
        { status: 400 }
      );
    }

    // Check if the target user exists
    const { data: targetUser } = await supabase
      .from("accounts")
      .select("id, display_name")
      .eq("id", reported_user_id)
      .single();

    if (!targetUser) {
      return NextResponse.json(
        { error: "Reported user not found" },
        { status: 404 }
      );
    }

    // Check for duplicate report (same reporter + target + reason within 24h)
    const oneDayAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: existingReport } = await supabase
      .from("user_reports")
      .select("id")
      .eq("reporter_id", userId)
      .eq("reported_user_id", reported_user_id)
      .eq("reason", reason)
      .gte("created_at", oneDayAgo)
      .maybeSingle();

    if (existingReport) {
      return NextResponse.json(
        { error: "You have already reported this user for this reason recently" },
        { status: 409 }
      );
    }

    // Auto-assign priority based on reason severity
    let priority = "normal";
    if (["threats", "underage"].includes(reason)) {
      priority = "urgent";
    } else if (["harassment", "scam", "impersonation"].includes(reason)) {
      priority = "high";
    } else if (["spam"].includes(reason)) {
      priority = "low";
    }

    // Check how many reports exist against this user (escalate if repeated)
    const { count: existingReportCount } = await supabase
      .from("user_reports")
      .select("*", { count: "exact", head: true })
      .eq("reported_user_id", reported_user_id)
      .neq("status", "dismissed");

    // Escalate priority if user has multiple reports
    if ((existingReportCount || 0) >= 3 && priority === "normal") {
      priority = "high";
    }
    if ((existingReportCount || 0) >= 5) {
      priority = "urgent";
    }

    // Insert report
    const { data: report, error: insertError } = await supabase
      .from("user_reports")
      .insert({
        reporter_id: userId,
        reported_user_id,
        reason,
        description: description?.trim() || null,
        priority,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating report:", insertError);
      return NextResponse.json(
        { error: "Failed to submit report" },
        { status: 500 }
      );
    }

    // Send notification to admins (insert a notification for any admin/superadmin)
    try {
      const { data: admins } = await supabase
        .from("accounts")
        .select("id")
        .in("role", ["admin", "superadmin"]);

      if (admins && admins.length > 0) {
        const adminNotifications = admins.map((admin: any) => ({
          user_id: admin.id,
          type: "admin_report",
          title: "New User Report",
          message: `A user has been reported for ${reason.replace(/_/g, " ")}`,
          data: {
            report_id: report.id,
            reported_user_id,
            reason,
            priority,
          },
        }));

        await supabase.from("notifications").insert(adminNotifications);
      }
    } catch {
      // Non-critical — admin notifications are best-effort
    }

    return NextResponse.json({
      success: true,
      report_id: report.id,
      message: "Report submitted successfully. Our team will review it shortly.",
    });
  } catch (error) {
    console.error("Error in POST /api/reports:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/reports?target=USER_ID
 * Check if the current user has an active report against a target user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get("target");

    if (!targetId) {
      return NextResponse.json(
        { error: "target query parameter is required" },
        { status: 400 }
      );
    }

    // Check for any pending/reviewing report from this user against target
    const { data: activeReport } = await supabase
      .from("user_reports")
      .select("id, reason, status, created_at")
      .eq("reporter_id", userId)
      .eq("reported_user_id", targetId)
      .in("status", ["pending", "reviewing"])
      .maybeSingle();

    return NextResponse.json({
      has_active_report: !!activeReport,
      report: activeReport || null,
    });
  } catch (error) {
    console.error("Error in GET /api/reports:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
