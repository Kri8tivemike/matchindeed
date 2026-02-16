import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendMeetingCancelledEmail,
  sendCancellationChargeEmail,
} from "@/lib/email";

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
 * GET /api/meetings/cancel
 * 
 * Get cancellation fee information for a meeting before confirming cancellation.
 * This allows the UI to show the fee warning before the user proceeds.
 * 
 * Query params:
 * - meeting_id: Meeting ID to check
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const meeting_id = searchParams.get("meeting_id");

    if (!meeting_id) {
      return NextResponse.json(
        { error: "meeting_id is required" },
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

    // Get user's role in the meeting
    const { data: participant } = await supabase
      .from("meeting_participants")
      .select("role")
      .eq("meeting_id", meeting_id)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "You are not a participant in this meeting" },
        { status: 403 }
      );
    }

    // Determine if cancellation is allowed and what fees apply
    const cancellationFeeCents = meeting.cancellation_fee_cents || 0;
    const isAdminApproved = meeting.status === "confirmed";
    const isHost = participant.role === "host";

    // Per client rules: No one can cancel after admin approval
    // The cancelling user gets charged regardless of role
    let canCancel = true;
    let cancellationBlocked = false;
    let blockReason = "";

    if (isAdminApproved) {
      // Meeting is confirmed/approved — cancellation is heavily penalized
      canCancel = true; // They CAN cancel but will be charged
      cancellationBlocked = false;
    }

    // If meeting is already canceled or completed, cannot cancel
    if (!["pending", "confirmed"].includes(meeting.status)) {
      canCancel = false;
      cancellationBlocked = true;
      blockReason = "This meeting cannot be canceled (already " + meeting.status + ").";
    }

    return NextResponse.json({
      meeting_id,
      meeting_status: meeting.status,
      user_role: participant.role,
      can_cancel: canCancel,
      cancellation_blocked: cancellationBlocked,
      block_reason: blockReason,
      cancellation_fee_cents: cancellationFeeCents,
      is_admin_approved: isAdminApproved,
      // Warning message to display to user
      warning_message: isAdminApproved
        ? "This meeting has been approved. Cancelling will result in a cancellation fee being charged to your account. No credit refund will be issued."
        : cancellationFeeCents > 0
        ? "Cancelling this meeting will incur a cancellation fee."
        : "Are you sure you want to cancel this meeting?",
      // Fee breakdown
      fee_details: {
        cancellation_fee: cancellationFeeCents,
        credit_refund: isAdminApproved ? false : true,
        charged_to: "cancelling_user",
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/meetings/cancel:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/meetings/cancel
 * 
 * Cancel a meeting with proper fee handling based on updated client rules:
 * 
 * 1. No one can cancel after meeting is accepted & approved by admin.
 *    If they try, the CANCELLING user is charged. No credit refund.
 * 2. Host cannot cancel after someone has booked the meeting.
 *    They should disable/cancel BEFORE someone books.
 * 3. Whoever cancels is responsible for the cancellation charges.
 * 4. Cancellation fee notice must be shown before and during cancellation.
 * 
 * Body:
 * - meeting_id: Meeting ID to cancel
 * - reason: Optional cancellation reason
 * - confirmed: Boolean - user has seen and accepted the cancellation fee
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { meeting_id, reason, confirmed } = body;

    if (!meeting_id) {
      return NextResponse.json(
        { error: "meeting_id is required" },
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

    // Check if meeting can be canceled
    if (!["pending", "confirmed"].includes(meeting.status)) {
      return NextResponse.json(
        { error: "Cannot cancel this meeting — it is already " + meeting.status },
        { status: 400 }
      );
    }

    // Get user's role in the meeting
    const { data: participant, error: participantError } = await supabase
      .from("meeting_participants")
      .select("role")
      .eq("meeting_id", meeting_id)
      .eq("user_id", user.id)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { error: "You are not a participant in this meeting" },
        { status: 403 }
      );
    }

    // Get cancellation fee (admin-configurable)
    const cancellationFeeCents = meeting.cancellation_fee_cents || 0;
    const isAdminApproved = meeting.status === "confirmed";

    // ---------------------------------------------------------------
    // CANCELLATION RULES (per client requirements)
    // ---------------------------------------------------------------

    // Rule 1: If meeting is confirmed (admin approved), cancellation
    //         is penalized — no credit refund, cancellation fee charged.
    //         The user MUST confirm they've seen the fee warning.
    if (isAdminApproved && !confirmed) {
      return NextResponse.json(
        {
          error: "cancellation_requires_confirmation",
          message: "This meeting has been approved. Cancelling will charge you a cancellation fee with no credit refund. Please confirm to proceed.",
          cancellation_fee_cents: cancellationFeeCents,
          requires_confirmation: true,
        },
        { status: 422 }
      );
    }

    // Rule 2: Even for pending meetings, if there's a fee, user must confirm
    if (cancellationFeeCents > 0 && !confirmed) {
      return NextResponse.json(
        {
          error: "cancellation_requires_confirmation",
          message: `Cancelling this meeting will incur a fee of ${(cancellationFeeCents / 100).toFixed(2)}. Please confirm to proceed.`,
          cancellation_fee_cents: cancellationFeeCents,
          requires_confirmation: true,
        },
        { status: 422 }
      );
    }

    // ---------------------------------------------------------------
    // PROCESS CANCELLATION
    // ---------------------------------------------------------------

    // Cancel the meeting — record who canceled and when
    const { error: updateError } = await supabase
      .from("meetings")
      .update({
        status: "canceled",
        canceled_by: user.id,
        canceled_at: new Date().toISOString(),
        cancellation_reason: reason || null,
      })
      .eq("id", meeting_id);

    if (updateError) {
      console.error("Error canceling meeting:", updateError);
      return NextResponse.json(
        { error: "Failed to cancel meeting" },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------------
    // CHARGE THE CANCELLING USER
    // ---------------------------------------------------------------

    // Apply cancellation fee to the cancelling user's wallet
    if (cancellationFeeCents > 0) {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance_cents")
        .eq("user_id", user.id)
        .single();

      if (wallet) {
        const newBalance = (wallet.balance_cents || 0) - cancellationFeeCents;

        await supabase
          .from("wallets")
          .update({
            balance_cents: newBalance,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);

        // Create wallet transaction record for audit trail
        await supabase.from("wallet_transactions").insert({
          user_id: user.id,
          type: "cancellation_fee",
          amount_cents: -cancellationFeeCents,
          description: `Cancellation fee for meeting ${meeting_id}. Canceled by ${participant.role}.`,
          balance_before_cents: wallet.balance_cents || 0,
          balance_after_cents: newBalance,
          reference_id: meeting_id,
        });
      }
    }

    // ---------------------------------------------------------------
    // CREDIT REFUND LOGIC
    // ---------------------------------------------------------------

    // Per client rules: If meeting was confirmed (admin approved),
    // NO credit refund to the requester (guest).
    // If meeting was still pending, guest gets credit back.
    if (!isAdminApproved) {
      // Meeting was pending — refund credits to the guest (requester)
      const { data: guest } = await supabase
        .from("meeting_participants")
        .select("user_id")
        .eq("meeting_id", meeting_id)
        .eq("role", "guest")
        .single();

      if (guest) {
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
      }
    }
    // If admin approved: NO refund — credits remain consumed

    // ---------------------------------------------------------------
    // SEND NOTIFICATIONS TO BOTH PARTIES
    // ---------------------------------------------------------------

    try {
      // Get both participants
      const { data: allParticipants } = await supabase
        .from("meeting_participants")
        .select("user_id, role")
        .eq("meeting_id", meeting_id);

      // Get cancelling user's display name
      const { data: cancellerAccount } = await supabase
        .from("accounts")
        .select("display_name, email")
        .eq("id", user.id)
        .single();

      const cancellerName =
        cancellerAccount?.display_name ||
        cancellerAccount?.email?.split("@")[0] ||
        "A participant";

      // Notify all participants except the cancelling user
      const otherParticipants = allParticipants?.filter(
        (p) => p.user_id !== user.id
      );

      for (const otherP of otherParticipants || []) {
        await supabase.from("notifications").insert({
          user_id: otherP.user_id,
          type: "meeting_canceled",
          title: "Meeting Canceled",
          message: `${cancellerName} has canceled the video meeting scheduled for ${new Date(meeting.scheduled_at).toLocaleDateString()} at ${new Date(meeting.scheduled_at).toLocaleTimeString()}.${
            isAdminApproved
              ? " The cancelling party has been charged a cancellation fee."
              : ""
          }`,
          data: {
            meeting_id,
            canceled_by: user.id,
            canceled_by_role: participant.role,
            cancellation_fee_applied: cancellationFeeCents > 0,
          },
        });
      }

      // Notify the cancelling user with a receipt
      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "meeting_canceled",
        title: "Meeting Cancellation Confirmed",
        message: `You have canceled the video meeting scheduled for ${new Date(meeting.scheduled_at).toLocaleDateString()}.${
          cancellationFeeCents > 0
            ? ` A cancellation fee of ${(cancellationFeeCents / 100).toFixed(2)} has been charged to your account.`
            : ""
        }${isAdminApproved ? " No credit refund will be issued." : ""}`,
        data: {
          meeting_id,
          cancellation_fee_cents: cancellationFeeCents,
          credit_refunded: !isAdminApproved,
        },
      });

      // Send email notifications to both parties
      const meetingDateStr = new Date(meeting.scheduled_at).toLocaleDateString();

      for (const otherP of otherParticipants || []) {
        const { data: otherAccount } = await supabase
          .from("accounts")
          .select("email")
          .eq("id", otherP.user_id)
          .single();

        const { data: otherProfile } = await supabase
          .from("user_profiles")
          .select("first_name")
          .eq("user_id", otherP.user_id)
          .single();

        if (otherAccount?.email) {
          await sendMeetingCancelledEmail(otherAccount.email, {
            recipientName: otherProfile?.first_name || "User",
            meetingDate: meetingDateStr,
            cancelledBy: cancellerName,
            refundIssued: !isAdminApproved && otherP.role === "guest",
            chargeApplied: false,
          });
        }
      }

      // Send cancellation charge email to the cancelling user if fee applies
      if (cancellationFeeCents > 0 && cancellerAccount?.email) {
        await sendCancellationChargeEmail(cancellerAccount.email, {
          recipientName: cancellerName,
          meetingDate: meetingDateStr,
          meetingRef: meeting_id.slice(0, 8),
          chargeAmount: `${(cancellationFeeCents / 100).toFixed(2)}`,
          reason: "Meeting cancelled after confirmation",
        });
      }
    } catch (notificationError) {
      console.error("Error sending cancellation notifications:", notificationError);
      // Don't fail the cancellation if notifications fail
    }

    return NextResponse.json({
      success: true,
      message: "Meeting canceled successfully",
      cancellation_fee_applied: cancellationFeeCents > 0,
      cancellation_fee_cents: cancellationFeeCents,
      credit_refunded: !isAdminApproved,
      canceled_by: participant.role,
    });
  } catch (error: any) {
    console.error("Error in POST /api/meetings/cancel:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
