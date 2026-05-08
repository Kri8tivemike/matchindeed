import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendInvestigationNoticeEmail } from "@/lib/email";
import { refundConsumedCredits } from "@/lib/credits/actions";
import { evaluateFinalizationPolicy } from "@/lib/meetings/validation";
import {
  deriveWorkflowState,
  requireMeetingStateTransition,
} from "@/lib/meetings/state-machine";
import { CIO_EVENTS, trackCustomerEventSafely } from "@/lib/customerio";

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
    const {
      meeting_id,
      outcome,
      fault,
      notes,
      charge_decision,
      technical_fault_proven,
      grace_period_waited_minutes,
    } = body;

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
      ["admin", "superadmin"].includes(account.role);
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

    const currentWorkflowState = deriveWorkflowState({
      workflowState:
        typeof meeting.workflow_state === "string" ? meeting.workflow_state : null,
      status: meeting.status,
    });
    const transitionValidation = requireMeetingStateTransition({
      from: currentWorkflowState,
      to: "completed",
    });
    if (!transitionValidation.allowed) {
      return NextResponse.json(
        {
          error: "invalid_state_transition",
          message:
            transitionValidation.message ||
            "Meeting cannot be moved to completed state.",
        },
        { status: 409 }
      );
    }

    const finalizationPolicy = evaluateFinalizationPolicy({
      outcome,
      fault,
      chargeDecision: charge_decision,
      technicalFaultProven: !!technical_fault_proven,
      gracePeriodWaitedMinutes:
        typeof grace_period_waited_minutes === "number"
          ? grace_period_waited_minutes
          : null,
      meetingMatched: !!meeting.matched,
    });
    if (!finalizationPolicy.allowed) {
      return NextResponse.json(
        {
          error: finalizationPolicy.code || "finalization_blocked",
          message:
            finalizationPolicy.message ||
            "Meeting finalization decision violates meeting rules.",
        },
        { status: finalizationPolicy.status }
      );
    }

    // ---------------------------------------------------------------
    // DETERMINE CHARGE STATUS BASED ON HOST DECISION
    // ---------------------------------------------------------------

    let newChargeStatus: string;
    let refundIssued = false;
    const chargeDecision =
      finalizationPolicy.shouldRefundRequester &&
      finalizationPolicy.normalizedChargeDecision !== "refund"
        ? "refund"
        : finalizationPolicy.normalizedChargeDecision;

    switch (chargeDecision) {
      case "capture":
        // Charges are captured — requester paid, no refund
        newChargeStatus = "captured";
        break;

      case "refund":
        // Refund credits to requester (guest)
        newChargeStatus = "refunded";
        refundIssued = true;

        await refundConsumedCredits(
          supabase,
          guest.user_id,
          typeof meeting.requester_credit_cost === "number"
            ? meeting.requester_credit_cost
            : 1,
          {
            actionType: "meeting_finalize_refund",
            description:
              "Host finalized meeting with refund decision; returned requester credits.",
          }
        );
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

    const finalizedAt = new Date().toISOString();
    const fullUpdatePayload = {
      status: "completed",
      workflow_state: "completed",
      charge_status: newChargeStatus,
      completed_at: finalizedAt,
      // Store host's finalization data when the schema supports it.
      finalized_at: finalizedAt,
      finalized_by: user.id,
      outcome,
      fault_determination: fault,
      host_notes: notes || null,
    };

    const { error: updateError } = await supabase
      .from("meetings")
      .update(fullUpdatePayload)
      .eq("id", meeting_id);

    if (updateError?.code === "42703") {
      const { error: fallbackUpdateError } = await supabase
        .from("meetings")
        .update({
          status: "completed",
          workflow_state: "completed",
          charge_status: newChargeStatus,
          completed_at: finalizedAt,
        })
        .eq("id", meeting_id);

      if (fallbackUpdateError) {
        console.error("Error finalizing meeting:", fallbackUpdateError);
        return NextResponse.json(
          { error: "Failed to finalize meeting" },
          { status: 500 }
        );
      }
    } else if (updateError) {
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
        chargeDecision
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
          charge_decision: chargeDecision,
          refund_issued: refundIssued,
        },
      });

      // If pending review, also notify admins
      if (chargeDecision === "pending_review") {
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
      if (fault !== "no_fault" && chargeDecision === "pending_review") {
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

    await Promise.allSettled([
      trackCustomerEventSafely(guest.user_id, CIO_EVENTS.MEETING_COMPLETED, {
        meeting_id,
        role: "guest",
        outcome,
        fault,
        charge_decision: chargeDecision,
        charge_status: newChargeStatus,
        refund_issued: refundIssued,
      }),
      trackCustomerEventSafely(host.user_id, CIO_EVENTS.MEETING_COMPLETED, {
        meeting_id,
        role: "host",
        outcome,
        fault,
        charge_decision: chargeDecision,
        charge_status: newChargeStatus,
        refund_issued: refundIssued,
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Meeting finalized successfully",
      charge_status: newChargeStatus,
      charge_decision: chargeDecision,
      refund_issued: refundIssued,
      outcome,
      fault,
    });
  } catch (error) {
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
  chargeDecision: string
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
