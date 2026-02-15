import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendInvestigationNoticeEmail } from "@/lib/email";

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
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * POST /api/meetings/finalize
 *
 * Host finalizes the meeting charges after the meeting is concluded.
 *
 * Per client requirements:
 * - The host has the final say about the meeting
 * - Charges remain "pending" until the host concludes and MatchIndeed finalizes
 * - Host determines final credit charges based on fault:
 *   - "no_fault"       → charges captured normally (requester pays)
 *   - "requester_fault" → charges captured, requester pays
 *   - "accepter_fault"  → requester gets refund, accepter (host side) may be charged
 *   - "both_fault"      → host determines split, MatchIndeed reviews
 *   - "network_issue"   → 4-minute grace period rule applies
 *
 * If the person who accepted the meeting leaves untimely/unexpectedly/no-show,
 * they are charged.
 *
 * If the person who sent the request leaves for any reason, the host gives
 * 4 minutes to reappear; if not, charges apply to this user.
 *
 * If fault is with the user who accepted and there is evidence, the user
 * gets a refund after 1-2 days investigation by MatchIndeed.
 *
 * Body:
 * - meeting_id: Meeting ID
 * - outcome: "completed" | "no_show" | "early_leave" | "network_disconnect"
 * - fault: "no_fault" | "requester_fault" | "accepter_fault" | "both_fault"
 * - notes: Host's notes/comments about the meeting conclusion
 * - charge_decision: "capture" | "refund" | "pending_review"
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { meeting_id, outcome, fault, notes, charge_decision } = body;

    // Validate required fields
    if (!meeting_id || !outcome || !fault || !charge_decision) {
      return NextResponse.json(
        {
          error:
            "meeting_id, outcome, fault, and charge_decision are required",
        },
        { status: 400 }
      );
    }

    // Validate enum values
    const validOutcomes = [
      "completed",
      "no_show",
      "early_leave",
      "network_disconnect",
    ];
    const validFaults = [
      "no_fault",
      "requester_fault",
      "accepter_fault",
      "both_fault",
    ];
    const validDecisions = ["capture", "refund", "pending_review"];

    if (!validOutcomes.includes(outcome)) {
      return NextResponse.json(
        { error: `Invalid outcome. Must be one of: ${validOutcomes.join(", ")}` },
        { status: 400 }
      );
    }
    if (!validFaults.includes(fault)) {
      return NextResponse.json(
        { error: `Invalid fault. Must be one of: ${validFaults.join(", ")}` },
        { status: 400 }
      );
    }
    if (!validDecisions.includes(charge_decision)) {
      return NextResponse.json(
        {
          error: `Invalid charge_decision. Must be one of: ${validDecisions.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Get meeting details
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    // Verify the user is the host or an admin
    const { data: account } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin =
      account?.role &&
      ["admin", "superadmin", "moderator"].includes(account.role);
    const isHost = meeting.host_id === user.id;

    if (!isHost && !isAdmin) {
      return NextResponse.json(
        { error: "Only the host or an admin can finalize meeting charges" },
        { status: 403 }
      );
    }

    // Meeting must be confirmed or completed to finalize
    if (!["confirmed", "completed"].includes(meeting.status)) {
      return NextResponse.json(
        {
          error: `Cannot finalize a meeting with status "${meeting.status}". Meeting must be confirmed or completed.`,
        },
        { status: 400 }
      );
    }

    // Get participants
    const { data: participants } = await supabase
      .from("meeting_participants")
      .select("user_id, role")
      .eq("meeting_id", meeting_id);

    const guest = participants?.find((p) => p.role === "guest");
    const host = participants?.find((p) => p.role === "host");

    if (!guest || !host) {
      return NextResponse.json(
        { error: "Could not find meeting participants" },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------------
    // DETERMINE CHARGE STATUS BASED ON HOST DECISION
    // ---------------------------------------------------------------

    let newChargeStatus: string;
    let refundIssued = false;

    switch (charge_decision) {
      case "capture":
        // Charges are captured — requester paid, no refund
        newChargeStatus = "captured";
        break;

      case "refund":
        // Refund credits to requester (guest)
        newChargeStatus = "refunded";
        refundIssued = true;

        // Refund the guest's credit
        const { data: guestCredits } = await supabase
          .from("credits")
          .select("used")
          .eq("user_id", guest.user_id)
          .single();

        if (guestCredits) {
          await supabase
            .from("credits")
            .update({ used: Math.max(0, guestCredits.used - 1) })
            .eq("user_id", guest.user_id);
        }
        break;

      case "pending_review":
        // Charges stay pending for MatchIndeed admin review (1-2 days)
        newChargeStatus = "pending_review";
        break;

      default:
        newChargeStatus = "pending";
    }

    // ---------------------------------------------------------------
    // UPDATE MEETING RECORD
    // ---------------------------------------------------------------

    const { error: updateError } = await supabase
      .from("meetings")
      .update({
        status: "completed",
        charge_status: newChargeStatus,
        // Store host's finalization data
        finalized_at: new Date().toISOString(),
        finalized_by: user.id,
        outcome,
        fault_determination: fault,
        host_notes: notes || null,
      })
      .eq("id", meeting_id);

    if (updateError) {
      console.error("Error finalizing meeting:", updateError);
      return NextResponse.json(
        { error: "Failed to finalize meeting" },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------------
    // SEND NOTIFICATIONS
    // ---------------------------------------------------------------

    try {
      // Notification to the guest (requester)
      const notificationMessage = buildNotificationMessage(
        outcome,
        fault,
        charge_decision,
        refundIssued
      );

      // Get guest's name for the notification
      const { data: guestProfile } = await supabase
        .from("user_profiles")
        .select("first_name")
        .eq("user_id", guest.user_id)
        .single();

      const guestName = guestProfile?.first_name || "User";

      // Notify guest
      await supabase.from("notifications").insert({
        user_id: guest.user_id,
        type: "meeting_finalized",
        title: "Meeting Review Complete",
        message: `Dear ${guestName}, ${notificationMessage}`,
        data: {
          meeting_id,
          outcome,
          fault,
          charge_decision,
          refund_issued: refundIssued,
        },
      });

      // If pending review, also notify admins
      if (charge_decision === "pending_review") {
        // Create admin notification
        await supabase.from("notifications").insert({
          user_id: host.user_id,
          type: "meeting_pending_review",
          title: "Meeting Pending Admin Review",
          message: `Meeting ${meeting_id} has been flagged for admin review. Fault: ${fault}. Please review within 1-2 business days.`,
          data: {
            meeting_id,
            outcome,
            fault,
            notes,
          },
        });
      }

      // Investigation notice for fault cases (per client requirement)
      if (fault !== "no_fault" && charge_decision === "pending_review") {
        // Send investigation notice to both parties
        const meetingDate = new Date(meeting.scheduled_at).toLocaleDateString();
        const investigationNotice = `In your previous video dating meeting held on ${meetingDate}, the meeting will be reviewed to determine if there is irregularity and inconsistency which determines the charges. This review may take 1-2 business days.`;

        for (const p of participants || []) {
          const { data: pProfile } = await supabase
            .from("user_profiles")
            .select("first_name")
            .eq("user_id", p.user_id)
            .single();

          await supabase.from("notifications").insert({
            user_id: p.user_id,
            type: "meeting_investigation",
            title: "Meeting Under Review",
            message: `Dear ${pProfile?.first_name || "User"}, ${investigationNotice}`,
            data: {
              meeting_id,
              review_type: "charge_investigation",
            },
          });

          // Send investigation notice email
          const { data: pAccount } = await supabase
            .from("accounts")
            .select("email")
            .eq("id", p.user_id)
            .single();

          if (pAccount?.email) {
            await sendInvestigationNoticeEmail(pAccount.email, {
              recipientName: pProfile?.first_name || "User",
              meetingDate,
            });
          }
        }
      }
    } catch (notificationError) {
      console.error(
        "Error sending finalization notifications:",
        notificationError
      );
      // Don't fail finalization if notifications fail
    }

    return NextResponse.json({
      success: true,
      message: "Meeting finalized successfully",
      charge_status: newChargeStatus,
      refund_issued: refundIssued,
      outcome,
      fault,
    });
  } catch (error: any) {
    console.error("Error in POST /api/meetings/finalize:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Build notification message based on meeting outcome and charge decision
 */
function buildNotificationMessage(
  outcome: string,
  fault: string,
  chargeDecision: string,
  refundIssued: boolean
): string {
  let message = "";

  switch (outcome) {
    case "completed":
      message = "Your video dating meeting has been concluded. ";
      break;
    case "no_show":
      message =
        "The video dating meeting has been concluded due to a no-show. ";
      break;
    case "early_leave":
      message =
        "The video dating meeting has been concluded due to an early departure. ";
      break;
    case "network_disconnect":
      message =
        "The video dating meeting has been concluded due to a network disconnection. ";
      break;
  }

  switch (chargeDecision) {
    case "capture":
      message += "The meeting charges have been finalized.";
      break;
    case "refund":
      message += "Your credits have been refunded to your account.";
      break;
    case "pending_review":
      message +=
        "The charges are under review by MatchIndeed. This may take 1-2 business days. You will be notified of the outcome.";
      break;
  }

  return message;
}
