import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";
import { sendMeetingCancelledEmail } from "@/lib/email";
import { refundConsumedCredits } from "@/lib/credits/actions";
import {
  deriveWorkflowState,
  requireMeetingStateTransition,
} from "@/lib/meetings/state-machine";
import { sendPushNotificationIfAllowed } from "@/lib/onesignal";
import { restoreStarterTrialMeeting } from "@/lib/starter-trial";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function formatMeetingDate(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

async function verifyAdminPassword(email: string | null, password: string) {
  if (!email || !password) return false;

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { error } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  return !error;
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
      actionType: "admin_meeting_canceled_refund",
      description:
        "Meeting canceled by MatchIndeed admin; refunded booking credits.",
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
    type: "admin_meeting_cancellation_refund",
    amount_cents: meeting.fee_cents,
    description: `Meeting booking refund for admin-canceled meeting ${meetingId}.`,
    balance_before_cents: balanceBefore,
    balance_after_cents: balanceAfter,
    reference_id: meetingId,
  });

  return true;
}

async function restoreStarterTrialsForParticipants(meetingId: string) {
  const { data: participants, error } = await supabase
    .from("meeting_participants")
    .select("user_id")
    .eq("meeting_id", meetingId);

  if (error) throw error;

  const restored = await Promise.all(
    (participants || []).map(async (participant) => {
      try {
        const result = await restoreStarterTrialMeeting(
          supabase,
          String(participant.user_id),
          meetingId
        );
        return result.restored ? String(participant.user_id) : null;
      } catch (starterTrialError) {
        console.error("[admin/meetings/cancel] starter trial restore error:", {
          meetingId,
          userId: participant.user_id,
          starterTrialError,
        });
        return null;
      }
    })
  );

  return restored.filter((userId): userId is string => Boolean(userId));
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_meetings"],
    });

    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const body = (await request.json().catch(() => ({}))) as {
      meeting_id?: string;
      password?: string;
      reason?: string;
      confirm?: boolean;
    };

    const meetingId = body.meeting_id;
    const password = body.password || "";
    const reason = body.reason?.trim() || "";

    if (!meetingId) {
      return NextResponse.json(
        { error: "meeting_id is required" },
        { status: 400 }
      );
    }

    if (!body.confirm) {
      return NextResponse.json(
        { error: "Please confirm that you want to cancel this meeting." },
        { status: 400 }
      );
    }

    if (!reason) {
      return NextResponse.json(
        { error: "Cancellation reason is required." },
        { status: 400 }
      );
    }

    const passwordValid = await verifyAdminPassword(guard.context.email, password);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Admin password confirmation failed." },
        { status: 403 }
      );
    }

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select(
        "id, host_id, status, workflow_state, scheduled_at, requester_credit_cost, fee_cents, charge_status"
      )
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if (!["pending", "confirmed"].includes(meeting.status)) {
      return NextResponse.json(
        { error: `Cannot cancel this meeting because it is ${meeting.status}.` },
        { status: 409 }
      );
    }

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

    const canceledAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("meetings")
      .update({
        status: "canceled",
        workflow_state: "canceled",
        canceled_by: guard.context.userId,
        canceled_at: canceledAt,
        cancellation_reason: reason,
        video_link: null,
        video_password: null,
        zoom_meeting_id: null,
        video_link_is_fallback: false,
      })
      .eq("id", meetingId)
      .in("status", ["pending", "confirmed"]);

    if (updateError) {
      console.error("[admin/meetings/cancel] update error:", updateError);
      return NextResponse.json(
        { error: "Failed to cancel meeting." },
        { status: 500 }
      );
    }

    const { data: participants } = await supabase
      .from("meeting_participants")
      .select("user_id, role")
      .eq("meeting_id", meetingId);

    const guest = participants?.find((participant) => participant.role === "guest");
    const bookingValueRefunded = guest?.user_id
      ? await refundBookingValueToGuest(meetingId, guest.user_id, meeting)
      : false;
    const restoredStarterTrialUserIds =
      meeting.status === "pending"
        ? await restoreStarterTrialsForParticipants(meetingId)
        : [];

    try {
      const participantIds = (participants || []).map(
        (participant) => participant.user_id
      );
      const [{ data: accounts }, { data: profiles }] =
        participantIds.length > 0
          ? await Promise.all([
              supabase
                .from("accounts")
                .select("id, email, display_name")
                .in("id", participantIds),
              supabase
                .from("user_profiles")
                .select("user_id, first_name")
                .in("user_id", participantIds),
            ])
          : [{ data: [] }, { data: [] }];

      const meetingDate = formatMeetingDate(meeting.scheduled_at);
      const notificationMessage = `MatchIndeed admin has canceled the video meeting scheduled for ${meetingDate}. Reason: ${reason}.${
        bookingValueRefunded ? " Your booking value has been refunded." : ""
      }`;

      await Promise.all(
        (participants || []).map(async (participant) => {
          await supabase.from("notifications").insert({
            user_id: participant.user_id,
            type: "meeting_canceled",
            title: "Meeting canceled by admin",
            message: notificationMessage,
            data: {
              meeting_id: meetingId,
              canceled_by: guard.context.userId,
              canceled_by_role: "admin",
              admin_cancelled: true,
              credit_refunded:
                bookingValueRefunded && participant.role === "guest",
            },
          });

          await sendPushNotificationIfAllowed({
            userId: participant.user_id,
            type: "meeting_canceled",
            title: "Meeting canceled by admin",
            message: notificationMessage,
            url: "/dashboard/meetings?tab=all",
            data: {
              meeting_id: meetingId,
              admin_cancelled: true,
            },
          });

          const account = accounts?.find(
            (entry) => entry.id === participant.user_id
          );
          if (!account?.email) return;

          const profile = profiles?.find(
            (entry) => entry.user_id === participant.user_id
          );
          const recipientName =
            profile?.first_name ||
            account.display_name ||
            account.email.split("@")[0] ||
            "User";

          await sendMeetingCancelledEmail(
            account.email,
            {
              recipientName,
              meetingDate,
              cancelledBy: "MatchIndeed Admin",
              refundIssued: bookingValueRefunded && participant.role === "guest",
              freePlanRestored: restoredStarterTrialUserIds.includes(
                participant.user_id
              ),
              chargeApplied: false,
              cancellationReason: reason,
            },
            participant.user_id
          );
        })
      );
    } catch (notificationError) {
      console.error(
        "[admin/meetings/cancel] notification error:",
        notificationError
      );
    }

    await supabase.from("admin_logs").insert({
      admin_id: guard.context.userId,
      target_user_id: meeting.host_id,
      action: "meeting_canceled_by_admin",
      meta: {
        meeting_id: meetingId,
        previous_status: meeting.status,
        previous_workflow_state: meeting.workflow_state,
        canceled_at: canceledAt,
        reason,
        booking_value_refunded: bookingValueRefunded,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Meeting canceled successfully.",
      meeting_status: "canceled",
      credit_refunded: bookingValueRefunded,
    });
  } catch (error) {
    console.error("[admin/meetings/cancel] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
