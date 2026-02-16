import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Helper to get authenticated user from request
 */
async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * POST /api/profile/reactivate
 * 
 * Request profile reactivation after matching
 * Body:
 * - reason: Reason code (1-26) or "other"
 * - custom_reason: Custom reason text (if reason is "other", minimum 200 words)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { reason, custom_reason } = body;

    if (!reason) {
      return NextResponse.json(
        { error: "reason is required" },
        { status: 400 }
      );
    }

    // Validate custom reason if "other" is selected
    if (reason === "other" || reason === "26") {
      if (!custom_reason || custom_reason.trim().split(/\s+/).length < 200) {
        return NextResponse.json(
          { error: "Custom reason must be at least 200 words" },
          { status: 400 }
        );
      }
    }

    // Check if user has an active match
    const { data: match, error: matchError } = await supabase
      .from("user_matches")
      .select("*")
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .eq("profile_reactivation_requested", false)
      .single();

    if (matchError || !match) {
      return NextResponse.json(
        { error: "No active match found or reactivation already requested" },
        { status: 400 }
      );
    }

    // Get partner ID
    const partnerId = match.user1_id === user.id ? match.user2_id : match.user1_id;

    // Update match record with reactivation request
    const { error: updateError } = await supabase
      .from("user_matches")
      .update({
        profile_reactivation_requested: true,
        reactivation_reason: reason === "other" || reason === "26" ? custom_reason : reason,
        reactivation_status: "pending",
        reactivation_requested_at: new Date().toISOString(),
      })
      .eq("id", match.id);

    if (updateError) {
      console.error("Error updating match:", updateError);
      return NextResponse.json(
        { error: "Failed to submit reactivation request" },
        { status: 500 }
      );
    }

    // Notify partner to also fill the form
    await supabase.from("notifications").insert({
      user_id: partnerId,
      type: "profile_reactivation_request",
      title: "Profile Reactivation Request",
      message: "Your matched partner has requested to reactivate their profile. Please review and respond.",
      data: { match_id: match.id, requester_id: user.id },
    });

    // Send email notification to partner
    try {
      const { data: partnerAccount } = await supabase
        .from("accounts")
        .select("email")
        .eq("id", partnerId)
        .single();

      const { data: partnerProfile } = await supabase
        .from("user_profiles")
        .select("first_name")
        .eq("user_id", partnerId)
        .single();

      if (partnerAccount?.email) {
        await sendEmail({
          to: partnerAccount.email,
          template: "account_warning",
          data: {
            recipientName: partnerProfile?.first_name || "User",
            warningMessage: "Your matched partner has requested to reactivate their profile. Please review and respond.",
            details: "Log in to your dashboard to review and respond to this reactivation request.",
          },
        });
      }
    } catch (emailErr) {
      console.error("Error sending reactivation email:", emailErr);
    }

    return NextResponse.json({
      success: true,
      message: "Reactivation request submitted. Your partner will be notified to respond.",
    });
  } catch (error: any) {
    console.error("Error in POST /api/profile/reactivate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/profile/reactivate
 * 
 * Get reactivation request status
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: match, error } = await supabase
      .from("user_matches")
      .select("*")
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .single();

    if (error || !match) {
      return NextResponse.json({
        has_match: false,
        reactivation_requested: false,
      });
    }

    return NextResponse.json({
      has_match: true,
      reactivation_requested: match.profile_reactivation_requested || false,
      reactivation_status: match.reactivation_status || null,
      reactivation_reason: match.reactivation_reason || null,
    });
  } catch (error: any) {
    console.error("Error in GET /api/profile/reactivate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
