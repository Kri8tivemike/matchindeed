import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendInvestigationResolvedEmail } from "@/lib/email";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Helper to get authenticated admin user from request
 */
async function getAdminUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Check admin role
  const { data: account } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    !account?.role ||
    !["admin", "superadmin", "moderator"].includes(account.role)
  ) {
    return null;
  }

  return { user, role: account.role };
}

/**
 * GET /api/admin/meetings/resolve
 *
 * Fetch meetings that are under investigation (charge_status = 'pending_review').
 * Returns meeting details, participants, host notes, and fault info.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminUser(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending_review";

    // Fetch meetings under review
    const { data: meetings, error } = await supabase
      .from("meetings")
      .select(
        `
        id,
        host_id,
        type,
        status,
        scheduled_at,
        fee_cents,
        charge_status,
        cancellation_fee_cents,
        outcome,
        fault_determination,
        host_notes,
        finalized_at,
        finalized_by,
        created_at,
        meeting_participants (
          user_id,
          role,
          response
        )
      `
      )
      .eq("charge_status", status)
      .order("finalized_at", { ascending: true });

    if (error) {
      console.error("Error fetching review meetings:", error);
      return NextResponse.json(
        { error: "Failed to fetch meetings" },
        { status: 500 }
      );
    }

    // Enrich with participant names
    const enrichedMeetings = [];
    for (const meeting of meetings || []) {
      const participants = [];
      for (const p of meeting.meeting_participants || []) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("first_name, last_name")
          .eq("user_id", p.user_id)
          .single();

        const { data: account } = await supabase
          .from("accounts")
          .select("email, tier")
          .eq("id", p.user_id)
          .single();

        participants.push({
          user_id: p.user_id,
          role: p.role,
          response: p.response,
          name: profile
            ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
            : "Unknown",
          email: account?.email || "",
          tier: account?.tier || "basic",
        });
      }

      // Get meeting responses (Yes/No from both users)
      const { data: responses } = await supabase
        .from("meeting_responses")
        .select("user_id, response, agreement_text, signed_at")
        .eq("meeting_id", meeting.id);

      enrichedMeetings.push({
        ...meeting,
        meeting_participants: undefined,
        participants,
        responses: responses || [],
      });
    }

    return NextResponse.json({
      meetings: enrichedMeetings,
      count: enrichedMeetings.length,
    });
  } catch (error) {
    console.error("Error in GET /api/admin/meetings/resolve:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/meetings/resolve
 *
 * Admin resolves an investigation for a meeting under review.
 *
 * Body:
 * - meeting_id: string
 * - resolution: "charge_requester" | "refund_requester" | "charge_accepter" | "no_charge" | "split"
 * - admin_notes: string
 *
 * Per client requirements:
 * - Admin reviews evidence and determines charges within 1-2 business days
 * - If fault is with the accepter and there is evidence, the requester gets a refund
 * - Both parties are notified of the outcome with an investigation resolution notice
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser(request);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { meeting_id, resolution, admin_notes } = body;

    if (!meeting_id || !resolution) {
      return NextResponse.json(
        { error: "meeting_id and resolution are required" },
        { status: 400 }
      );
    }

    const validResolutions = [
      "charge_requester",
      "refund_requester",
      "charge_accepter",
      "no_charge",
      "split",
    ];
    if (!validResolutions.includes(resolution)) {
      return NextResponse.json(
        {
          error: `Invalid resolution. Must be one of: ${validResolutions.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Fetch the meeting
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

    if (meeting.charge_status !== "pending_review") {
      return NextResponse.json(
        {
          error: `Meeting charge_status is "${meeting.charge_status}", expected "pending_review"`,
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
    // APPLY RESOLUTION
    // ---------------------------------------------------------------

    let newChargeStatus: string;
    let refundUserId: string | null = null;
    let chargeUserId: string | null = null;

    switch (resolution) {
      case "charge_requester":
        // Requester (guest) pays — normal flow
        newChargeStatus = "captured";
        chargeUserId = guest.user_id;
        break;

      case "refund_requester":
        // Requester gets a refund (fault was with the accepter)
        newChargeStatus = "refunded";
        refundUserId = guest.user_id;
        break;

      case "charge_accepter":
        // Accepter (host) is charged — refund requester and charge accepter
        newChargeStatus = "refunded";
        refundUserId = guest.user_id;
        chargeUserId = host.user_id;
        break;

      case "no_charge":
        // No one is charged — full refund
        newChargeStatus = "refunded";
        refundUserId = guest.user_id;
        break;

      case "split":
        // Both share responsibility — partial resolution
        newChargeStatus = "captured";
        // In a split, charges stay as-is (no refund)
        break;

      default:
        newChargeStatus = "captured";
    }

    // Refund credits if needed
    if (refundUserId) {
      const { data: credits } = await supabase
        .from("credits")
        .select("used")
        .eq("user_id", refundUserId)
        .single();

      if (credits) {
        await supabase
          .from("credits")
          .update({ used: Math.max(0, credits.used - 1) })
          .eq("user_id", refundUserId);
      }

      // Refund wallet if applicable
      if (meeting.fee_cents) {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("balance_cents")
          .eq("user_id", refundUserId)
          .single();

        if (wallet) {
          await supabase
            .from("wallets")
            .update({
              balance_cents: (wallet.balance_cents || 0) + meeting.fee_cents,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", refundUserId);

          await supabase.from("wallet_transactions").insert({
            user_id: refundUserId,
            type: "investigation_refund",
            amount_cents: meeting.fee_cents,
            description: `Refund after investigation for meeting ${meeting_id.slice(0, 8)}`,
            balance_before: wallet.balance_cents || 0,
            balance_after: (wallet.balance_cents || 0) + meeting.fee_cents,
          });
        }
      }
    }

    // Charge the at-fault user's wallet if applicable
    if (chargeUserId && resolution === "charge_accepter" && meeting.fee_cents) {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance_cents")
        .eq("user_id", chargeUserId)
        .single();

      if (wallet) {
        await supabase
          .from("wallets")
          .update({
            balance_cents: (wallet.balance_cents || 0) - meeting.fee_cents,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", chargeUserId);

        await supabase.from("wallet_transactions").insert({
          user_id: chargeUserId,
          type: "investigation_charge",
          amount_cents: -meeting.fee_cents,
          description: `Charge after investigation for meeting ${meeting_id.slice(0, 8)} — fault determined`,
          balance_before: wallet.balance_cents || 0,
          balance_after: (wallet.balance_cents || 0) - meeting.fee_cents,
        });
      }
    }

    // Update meeting record
    await supabase
      .from("meetings")
      .update({
        charge_status: newChargeStatus,
        admin_resolution: resolution,
        admin_resolution_notes: admin_notes || null,
        admin_resolved_at: new Date().toISOString(),
        admin_resolved_by: admin.user.id,
      })
      .eq("id", meeting_id);

    // ---------------------------------------------------------------
    // SEND RESOLUTION NOTIFICATIONS
    // ---------------------------------------------------------------

    const meetingDate = new Date(meeting.scheduled_at).toLocaleDateString();

    for (const p of participants || []) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("first_name")
        .eq("user_id", p.user_id)
        .single();

      const name = profile?.first_name || "User";
      let message = "";

      if (p.user_id === refundUserId && resolution !== "charge_accepter") {
        message = `Dear ${name}, after reviewing your video dating meeting held on ${meetingDate}, we have determined that a refund is warranted. Your credits have been returned to your account.`;
      } else if (p.user_id === chargeUserId) {
        message = `Dear ${name}, after reviewing your video dating meeting held on ${meetingDate}, charges have been applied to your account based on our investigation findings.`;
      } else if (resolution === "no_charge") {
        message = `Dear ${name}, after reviewing your video dating meeting held on ${meetingDate}, no charges have been applied. Credits have been refunded.`;
      } else if (resolution === "split") {
        message = `Dear ${name}, after reviewing your video dating meeting held on ${meetingDate}, both parties share responsibility. Charges remain as finalized.`;
      } else {
        message = `Dear ${name}, the investigation for your video dating meeting held on ${meetingDate} has been concluded. Please check your account for details.`;
      }

      await supabase.from("notifications").insert({
        user_id: p.user_id,
        type: "investigation_resolved",
        title: "Investigation Complete",
        message,
        data: {
          meeting_id,
          resolution,
          refund_issued: p.user_id === refundUserId,
        },
      });

      // Send investigation resolved email
      const { data: pAccount } = await supabase
        .from("accounts")
        .select("email")
        .eq("id", p.user_id)
        .single();

      if (pAccount?.email) {
        await sendInvestigationResolvedEmail(pAccount.email, {
          recipientName: name,
          meetingDate,
          meetingRef: meeting_id.slice(0, 8),
          refundIssued: p.user_id === refundUserId,
          chargeApplied: p.user_id === chargeUserId,
          adminNotes: admin_notes,
        });
      }
    }

    // Log admin action
    await supabase.from("admin_logs").insert({
      admin_id: admin.user.id,
      action: "investigation_resolved",
      meta: {
        meeting_id,
        resolution,
        admin_notes,
        refund_user_id: refundUserId,
        charge_user_id: chargeUserId,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Investigation resolved successfully",
      resolution,
      charge_status: newChargeStatus,
      refund_issued: !!refundUserId,
    });
  } catch (error: any) {
    console.error("Error in POST /api/admin/meetings/resolve:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
