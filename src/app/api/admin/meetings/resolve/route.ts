import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendInvestigationResolvedEmail } from "@/lib/email";
import { refundConsumedCredits } from "@/lib/credits/actions";
import { requireAdminAccess } from "@/lib/admin/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const REVIEW_SELECT_WITH_ADMIN_FIELDS = `
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
  admin_resolved_at,
  created_at,
  meeting_participants (
    user_id,
    role,
    response
  )
`;

const REVIEW_SELECT_BASELINE = `
  id,
  host_id,
  type,
  status,
  scheduled_at,
  fee_cents,
  charge_status,
  cancellation_fee_cents,
  created_at,
  meeting_participants (
    user_id,
    role,
    response
  )
`;

type ReviewFetchOptions = {
  page: number;
  limit: number;
};

type ReviewParticipantRow = {
  user_id: string;
  role: string;
  response: string | null;
};

type ReviewMeetingRow = {
  id: string;
  host_id: string;
  type: string;
  status: string;
  scheduled_at: string;
  fee_cents: number;
  charge_status: string;
  cancellation_fee_cents: number;
  outcome?: string | null;
  fault_determination?: string | null;
  host_notes?: string | null;
  finalized_at?: string | null;
  finalized_by?: string | null;
  admin_resolved_at?: string | null;
  created_at: string;
  meeting_participants?: ReviewParticipantRow[] | null;
};

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
};

type AccountRow = {
  id: string;
  email: string | null;
  tier: string | null;
};

type MeetingResponseRow = {
  meeting_id: string;
  user_id: string;
  response: string;
  agreement_text: string | null;
  signed_at: string | null;
};

const DEFAULT_REVIEW_LIMIT = 25;
const MAX_REVIEW_LIMIT = 50;

function getPaginationOptions(searchParams: URLSearchParams): ReviewFetchOptions {
  const rawPage = Number(searchParams.get("page") || "1");
  const rawLimit = Number(searchParams.get("limit") || DEFAULT_REVIEW_LIMIT);

  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
    limit:
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(MAX_REVIEW_LIMIT, Math.floor(rawLimit))
        : DEFAULT_REVIEW_LIMIT,
  };
}

async function fetchReviewMeetings(status: string, options: ReviewFetchOptions) {
  const from = (options.page - 1) * options.limit;
  const to = from + options.limit - 1;

  const runQuery = async (targetStatus: string, includeAdminFields: boolean) => {
    const query = supabase
      .from("meetings")
      .select(
        includeAdminFields
          ? REVIEW_SELECT_WITH_ADMIN_FIELDS
          : REVIEW_SELECT_BASELINE,
        { count: "exact" }
      )
      .eq("charge_status", targetStatus)
      .order(
        targetStatus === "pending_review"
          ? "finalized_at"
          : targetStatus === "captured" || targetStatus === "refunded"
            ? "admin_resolved_at"
            : "created_at",
        { ascending: targetStatus === "pending_review" }
      )
      .range(from, to);

    return query;
  };

  let query = await runQuery(status, true);

  if (query.error?.code === "22P02" && status === "pending_review") {
    // Older databases may not have the pending_review enum value yet.
    query = await runQuery("pending", true);
  }

  if (query.error && query.error.code === "42703") {
    let fallback = await runQuery(status, false);

    if (fallback.error?.code === "22P02" && status === "pending_review") {
      fallback = await runQuery("pending", false);
    }

    if (fallback.error) {
      return fallback;
    }

    return {
      data: ((fallback.data || []) as unknown as ReviewMeetingRow[]).map((meeting) => ({
        ...meeting,
        outcome: null,
        fault_determination: null,
        host_notes: null,
        finalized_at: null,
        finalized_by: null,
        admin_resolved_at: null,
      })),
      error: null,
      count: fallback.count,
    };
  }

  return query;
}

async function safeInsertNotification(payload: Record<string, unknown>) {
  const { error } = await supabase.from("notifications").insert(payload);
  if (error) {
    // Notification schema differs across deployments; do not block admin resolutions.
    console.warn("[admin/meetings/resolve] notification insert skipped:", error.message);
  }
}

function normalizeReviewStatus(rawStatus: string) {
  const status = rawStatus.toLowerCase();
  if (["pending_review", "pending", "captured", "refunded"].includes(status)) {
    return status;
  }
  return null;
}

/**
 * GET /api/admin/meetings/resolve
 *
 * Fetch meetings that are under investigation (charge_status = 'pending_review').
 * Returns meeting details, participants, host notes, and fault info.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["view_meetings", "manage_meetings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { searchParams } = new URL(request.url);
    const requestedStatus = searchParams.get("status") || "pending_review";
    const status = normalizeReviewStatus(requestedStatus);
    const pagination = getPaginationOptions(searchParams);
    if (!status) {
      return NextResponse.json(
        { error: "Invalid status. Use pending_review, pending, captured, or refunded." },
        { status: 400 }
      );
    }

    // Fetch meetings under review
    const { data: meetings, error, count } = await fetchReviewMeetings(
      status,
      pagination
    );

    if (error) {
      console.error("Error fetching review meetings:", error);
      return NextResponse.json(
        { error: "Failed to fetch meetings" },
        { status: 500 }
      );
    }

    const meetingRows = (meetings || []) as unknown as ReviewMeetingRow[];
    const meetingIds = meetingRows.map((meeting) => meeting.id);
    const userIds = [
      ...new Set(
        meetingRows.flatMap((meeting) =>
          (meeting.meeting_participants || []).map((participant) => participant.user_id)
        )
      ),
    ];

    const [profilesResult, accountsResult, responsesResult] = await Promise.all([
      userIds.length > 0
        ? supabase
            .from("user_profiles")
            .select("user_id, first_name, last_name")
            .in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length > 0
        ? supabase
            .from("accounts")
            .select("id, email, tier")
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      meetingIds.length > 0
        ? supabase
            .from("meeting_responses")
            .select("meeting_id, user_id, response, agreement_text, signed_at")
            .in("meeting_id", meetingIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) {
      console.warn(
        "[admin/meetings/resolve] profile enrichment skipped:",
        profilesResult.error.message
      );
    }
    if (accountsResult.error) {
      console.warn(
        "[admin/meetings/resolve] account enrichment skipped:",
        accountsResult.error.message
      );
    }
    if (responsesResult.error) {
      console.warn(
        "[admin/meetings/resolve] response enrichment skipped:",
        responsesResult.error.message
      );
    }

    const profilesByUserId = new Map(
      ((profilesResult.data || []) as ProfileRow[]).map((profile) => [
        profile.user_id,
        profile,
      ])
    );
    const accountsByUserId = new Map(
      ((accountsResult.data || []) as AccountRow[]).map((account) => [
        account.id,
        account,
      ])
    );
    const responsesByMeetingId = ((responsesResult.data || []) as MeetingResponseRow[])
      .reduce<Record<string, Omit<MeetingResponseRow, "meeting_id">[]>>(
        (acc, response) => {
          if (!acc[response.meeting_id]) {
            acc[response.meeting_id] = [];
          }
          acc[response.meeting_id].push({
            user_id: response.user_id,
            response: response.response,
            agreement_text: response.agreement_text,
            signed_at: response.signed_at,
          });
          return acc;
        },
        {}
      );

    const enrichedMeetings = meetingRows.map((meeting) => {
      const participants = (meeting.meeting_participants || []).map((participant) => {
        const profile = profilesByUserId.get(participant.user_id);
        const account = accountsByUserId.get(participant.user_id);
        const name = profile
          ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
          : "";

        return {
          user_id: participant.user_id,
          role: participant.role,
          response: participant.response,
          name: name || account?.email?.split("@")[0] || "Unknown",
          email: account?.email || "",
          tier: account?.tier || "basic",
        };
      });

      return {
        ...meeting,
        meeting_participants: undefined,
        participants,
        responses: responsesByMeetingId[meeting.id] || [],
      };
    });

    return NextResponse.json({
      meetings: enrichedMeetings,
      count: count ?? enrichedMeetings.length,
      page: pagination.page,
      limit: pagination.limit,
      total_pages: Math.max(
        1,
        Math.ceil((count ?? enrichedMeetings.length) / pagination.limit)
      ),
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
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_meetings"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const admin = guard.context;

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

    if (!["pending_review", "pending"].includes(meeting.charge_status)) {
      return NextResponse.json(
        {
          error: `Meeting charge_status is "${meeting.charge_status}", expected "pending"`,
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
      await refundConsumedCredits(
        supabase,
        refundUserId,
        typeof meeting.requester_credit_cost === "number"
          ? meeting.requester_credit_cost
          : 1,
        {
          actionType: "admin_meeting_resolution_refund",
          description:
            "Admin resolved meeting dispute with credit refund to requester.",
        }
      );

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
            balance_before_cents: wallet.balance_cents || 0,
            balance_after_cents: (wallet.balance_cents || 0) + meeting.fee_cents,
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
          balance_before_cents: wallet.balance_cents || 0,
          balance_after_cents: (wallet.balance_cents || 0) - meeting.fee_cents,
        });
      }
    }

    // Update meeting record
    const updatePayload = {
      charge_status: newChargeStatus,
      admin_resolution: resolution,
      admin_resolution_notes: admin_notes || null,
      admin_resolved_at: new Date().toISOString(),
      admin_resolved_by: admin.userId,
    };

    const { error: meetingUpdateError } = await supabase
      .from("meetings")
      .update(updatePayload)
      .eq("id", meeting_id);

    if (meetingUpdateError?.code === "42703") {
      const { error: fallbackUpdateError } = await supabase
        .from("meetings")
        .update({ charge_status: newChargeStatus })
        .eq("id", meeting_id);

      if (fallbackUpdateError) {
        throw fallbackUpdateError;
      }
    } else if (meetingUpdateError) {
      throw meetingUpdateError;
    }

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

      await safeInsertNotification({
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
      admin_id: admin.userId,
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
  } catch (error) {
    console.error("Error in POST /api/admin/meetings/resolve:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
