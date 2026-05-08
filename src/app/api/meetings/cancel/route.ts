import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendMeetingCancelledEmail,
  sendCancellationChargeEmail,
} from "@/lib/email";
import { consumeCredits, refundConsumedCredits } from "@/lib/credits/actions";
import {
  evaluateCancellationPolicy,
  getCancellationFeeCredits,
} from "@/lib/meetings/validation";
import {
  deriveWorkflowState,
  requireMeetingStateTransition,
} from "@/lib/meetings/state-machine";
import { sendPushNotificationIfAllowed } from "@/lib/onesignal";
import { restoreStarterTrialMeeting } from "@/lib/starter-trial";

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

async function refundBookingValueToGuest(
  meetingId: string,
  guestUserId: string,
  meeting: {
    requester_credit_cost?: number | null;
    fee_cents?: number | null;
    charge_status?: string | null;
  }
) {
  await refundConsumedCredits(
    supabase,
    guestUserId,
    typeof meeting.requester_credit_cost === "number"
      ? meeting.requester_credit_cost
      : 1,
    {
      actionType: "meeting_canceled_refund",
      description:
        "Meeting canceled by the other participant; refunded booking credits.",
    }
  );

  if (meeting.charge_status !== "captured" || !meeting.fee_cents) {
    return false;
  }

  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance_cents")
    .eq("user_id", guestUserId)
    .single();

  if (!wallet) {
    return false;
  }

  const balanceBefore = wallet.balance_cents || 0;
  const balanceAfter = balanceBefore + meeting.fee_cents;

  await supabase
    .from("wallets")
    .update({
      balance_cents: balanceAfter,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", guestUserId);

  await supabase.from("wallet_transactions").insert({
    user_id: guestUserId,
    type: "meeting_cancellation_refund",
    amount_cents: meeting.fee_cents,
    description: `Meeting booking refund for canceled meeting ${meetingId}.`,
    balance_before_cents: balanceBefore,
    balance_after_cents: balanceAfter,
    reference_id: meetingId,
  });

  return true;
}

function formatCredits(amount: number) {
  return `${amount} credit${amount === 1 ? "" : "s"}`;
}

async function restoreStarterTrialForOtherParticipants(
  meetingId: string,
  canceledByUserId: string
) {
  const { data: participants, error } = await supabase
    .from("meeting_participants")
    .select("user_id")
    .eq("meeting_id", meetingId)
    .neq("user_id", canceledByUserId);

  if (error) {
    throw error;
  }

  const restoredUserIds = await Promise.all(
    (participants || []).map(async (participant) => {
      try {
        const result = await restoreStarterTrialMeeting(
          supabase,
          String(participant.user_id),
          meetingId
        );
        return result.restored ? String(participant.user_id) : null;
      } catch (starterTrialError) {
        console.error("Error restoring starter trial after meeting cancellation:", {
          meetingId,
          userId: participant.user_id,
          starterTrialError,
        });
        return null;
      }
    })
  );

  return restoredUserIds.filter((userId): userId is string => Boolean(userId));
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

    const { data: account } = await supabase
      .from("accounts")
      .select("tier, role")
      .eq("id", user.id)
      .single();

    const userTier = (account?.tier || "basic").toLowerCase();
    const isAdmin =
      !!account?.role &&
      ["admin", "superadmin"].includes(account.role);

    const { data: guest } = await supabase
      .from("meeting_participants")
      .select("user_id")
      .eq("meeting_id", meeting_id)
      .eq("role", "guest")
      .single();

    const refundsAffectedBooker = Boolean(guest?.user_id && guest.user_id !== user.id);

    const policy = evaluateCancellationPolicy({
      meetingStatus: meeting.status,
      userTier,
      isAdmin,
      isHostCanceller: participant.role === "host",
      cancellationFeeCents: getCancellationFeeCredits(userTier),
      meetingFeeCents: meeting.fee_cents,
      confirmed: true,
    });
    const isAdminApproved = meeting.status === "confirmed";
    const canCancel = policy.allowed;
    const cancellationBlocked = !policy.allowed;
    const blockReason = policy.allowed ? "" : policy.message || "Cancellation is blocked.";

    return NextResponse.json({
      meeting_id,
      meeting_status: meeting.status,
      user_role: participant.role,
      can_cancel: canCancel,
      cancellation_blocked: cancellationBlocked,
      block_reason: blockReason,
      cancellation_fee_credits: policy.cancellationFeeCents,
      is_admin_approved: isAdminApproved,
      // Warning message to display to user
      warning_message: isAdminApproved
        ? refundsAffectedBooker
          ? `This meeting has been approved. Cancelling will charge ${formatCredits(policy.cancellationFeeCents)} to your account, and the other participant's booking value will be refunded.`
          : `This meeting has been approved. Cancelling will result in ${formatCredits(policy.cancellationFeeCents)} being charged to your account. No refund will be issued.`
        : refundsAffectedBooker
        ? `Cancelling this meeting will charge ${formatCredits(policy.cancellationFeeCents)} to your account and refund the other participant's booking value.`
        : policy.cancellationFeeCents > 0
        ? `Cancelling this meeting will incur a fee of ${formatCredits(policy.cancellationFeeCents)}.`
        : "Are you sure you want to cancel this meeting?",
      // Fee breakdown
      fee_details: {
        cancellation_fee_credits: policy.cancellationFeeCents,
        credit_refund: refundsAffectedBooker,
        charged_to: "cancelling_user",
      },
    });
  } catch (error) {
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

    const { data: account } = await supabase
      .from("accounts")
      .select("tier, role")
      .eq("id", user.id)
      .single();

    const userTier = (account?.tier || "basic").toLowerCase();
    const isAdmin =
      !!account?.role &&
      ["admin", "superadmin"].includes(account.role);

    const cancellationPolicy = evaluateCancellationPolicy({
      meetingStatus: meeting.status,
      userTier,
      isAdmin,
      isHostCanceller: participant.role === "host",
      cancellationFeeCents: getCancellationFeeCredits(userTier),
      meetingFeeCents: meeting.fee_cents,
      confirmed: !!confirmed,
    });
    if (!cancellationPolicy.allowed) {
      return NextResponse.json(
        {
          error: cancellationPolicy.code || "cancellation_blocked",
          message: cancellationPolicy.message || "Cancellation is not allowed.",
          cancellation_fee_credits: cancellationPolicy.cancellationFeeCents,
          requires_confirmation: cancellationPolicy.requiresConfirmation || false,
          requires_upgrade:
            cancellationPolicy.code === "tier_cancellation_forbidden",
        },
        { status: cancellationPolicy.status }
      );
    }

    const cancellationFeeCredits = cancellationPolicy.cancellationFeeCents;
    const formattedCancellationFee =
      cancellationFeeCredits > 0
        ? formatCredits(cancellationFeeCredits)
        : "";

    const currentWorkflowState = deriveWorkflowState({
      workflowState:
        typeof meeting.workflow_state === "string" ? meeting.workflow_state : null,
      status: meeting.status,
    });
    const transitionValidation = requireMeetingStateTransition({
      from: currentWorkflowState,
      to: "canceled",
    });
    if (!transitionValidation.allowed) {
      return NextResponse.json(
        {
          error: "invalid_state_transition",
          message:
            transitionValidation.message ||
            "Meeting cannot be moved to canceled state.",
        },
        { status: 409 }
      );
    }

    if (cancellationFeeCredits > 0) {
      const charge = await consumeCredits(supabase, user.id, cancellationFeeCredits, {
        actionType: "meeting_cancellation_fee",
        description: `Cancellation fee for meeting ${meeting_id}. Canceled by ${participant.role}.`,
      });

      if (!charge.success) {
        return NextResponse.json(
          {
            error: "insufficient_credits",
            message: `You need ${formattedCancellationFee} to cancel this meeting.`,
            cancellation_fee_credits: cancellationFeeCredits,
            credits_available: charge.available,
          },
          { status: 402 }
        );
      }
    }

    const { error: updateError } = await supabase
      .from("meetings")
      .update({
        status: "canceled",
        workflow_state: "canceled",
        canceled_by: user.id,
        canceled_at: new Date().toISOString(),
        cancellation_reason: reason || null,
      })
      .eq("id", meeting_id);

    if (updateError) {
      if (cancellationFeeCredits > 0) {
        await refundConsumedCredits(supabase, user.id, cancellationFeeCredits, {
          actionType: "meeting_cancellation_fee_refund",
          description: `Refunded ${formattedCancellationFee} because the meeting cancellation could not be completed.`,
        });
      }
      console.error("Error canceling meeting:", updateError);
      return NextResponse.json(
        { error: "Failed to cancel meeting" },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------------
    // CREDIT REFUND LOGIC
    // ---------------------------------------------------------------

    // Per client rules: If meeting was confirmed (admin approved),
    // NO credit refund to the requester (guest).
    // If meeting was still pending, guest gets credit back.
    const { data: guest } = await supabase
      .from("meeting_participants")
      .select("user_id")
      .eq("meeting_id", meeting_id)
      .eq("role", "guest")
      .single();

    const refundsAffectedBooker = Boolean(guest?.user_id && guest.user_id !== user.id);
    let bookingValueRefunded = false;

    if (refundsAffectedBooker && guest?.user_id) {
      bookingValueRefunded = true;
      await refundBookingValueToGuest(meeting_id, guest.user_id, meeting);
    }

      const restoredStarterTrialUserIds =
        meeting.status === "pending"
          ? await restoreStarterTrialForOtherParticipants(meeting_id, user.id)
          : [];

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
        const cancellationMessage = `${cancellerName} has canceled the video meeting scheduled for ${new Date(meeting.scheduled_at).toLocaleDateString()} at ${new Date(meeting.scheduled_at).toLocaleTimeString()}.${
          cancellationFeeCredits > 0
            ? ` The cancelling party has been charged ${formattedCancellationFee}.`
            : ""
        }${
          refundsAffectedBooker
            ? " Your booking value has been refunded."
            : ""
        }`;

        await supabase.from("notifications").insert({
          user_id: otherP.user_id,
          type: "meeting_canceled",
          title: "Meeting Canceled",
          message: cancellationMessage,
          data: {
            meeting_id,
            canceled_by: user.id,
            canceled_by_role: participant.role,
            cancellation_fee_applied: cancellationFeeCredits > 0,
          },
        });

        await sendPushNotificationIfAllowed({
          userId: otherP.user_id,
          type: "meeting_canceled",
          title: "Video meeting canceled",
          message: cancellationMessage,
          url: "/dashboard/meetings?tab=all",
          data: {
            meeting_id,
            canceled_by: user.id,
            canceled_by_role: participant.role,
            cancellation_fee_applied: cancellationFeeCredits > 0,
          },
        });
      }

      // Notify the cancelling user with a receipt
      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "meeting_canceled",
        title: "Meeting Cancellation Confirmed",
        message: `You have canceled the video meeting scheduled for ${new Date(meeting.scheduled_at).toLocaleDateString()}.${
          cancellationFeeCredits > 0
            ? ` ${formattedCancellationFee} has been charged to your credits balance.`
            : ""
        }${refundsAffectedBooker ? " The other participant has been refunded." : " No refund will be issued."}`,
        data: {
          meeting_id,
          cancellation_fee_credits: cancellationFeeCredits,
          credit_refunded: bookingValueRefunded,
        },
      });

      // Send email notifications to both parties
      const meetingDateStr = new Date(meeting.scheduled_at).toLocaleDateString();

      if (cancellerAccount?.email) {
        const { data: cancellerProfile } = await supabase
          .from("user_profiles")
          .select("first_name")
          .eq("user_id", user.id)
          .single();

        await sendMeetingCancelledEmail(cancellerAccount.email, {
          recipientName: cancellerProfile?.first_name || cancellerName,
          meetingDate: meetingDateStr,
          cancelledBy: "you",
          refundIssued: false,
          chargeApplied: cancellationFeeCredits > 0,
        });
      }

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
            refundIssued: bookingValueRefunded && otherP.role === "guest",
            freePlanRestored: restoredStarterTrialUserIds.includes(otherP.user_id),
            chargeApplied: false,
          }, otherP.user_id);
        }
      }

      // Send cancellation charge email to the cancelling user if fee applies
      if (cancellationFeeCredits > 0 && cancellerAccount?.email) {
        await sendCancellationChargeEmail(cancellerAccount.email, {
          recipientName: cancellerName,
          meetingDate: meetingDateStr,
          meetingRef: meeting_id.slice(0, 8),
          creditAmount: formattedCancellationFee,
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
      cancellation_fee_applied: cancellationFeeCredits > 0,
      cancellation_fee_credits: cancellationFeeCredits,
      credit_refunded: bookingValueRefunded,
      canceled_by: user.id,
    });
  } catch (error) {
    console.error("Error in POST /api/meetings/cancel:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
