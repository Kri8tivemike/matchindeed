import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendResponseSubmittedEmail, sendRawHtmlEmail } from "@/lib/email";
import {
  getAccountState,
  resolveOwnInteractionBlockMessage,
} from "@/lib/account-interactions";
import { buildRelationshipAgreementText } from "@/lib/agreements/templates";
import {
  deriveWorkflowState,
  requireMeetingStateTransition,
} from "@/lib/meetings/state-machine";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type MeetingStatusRelation = {
  id: string;
  status: string;
  workflow_state?: string | null;
  scheduled_at?: string | null;
  matched?: boolean | null;
};

type UserIdentity = {
  userId: string;
  firstName: string;
  fullName: string;
  email: string | null;
};

type AgreementRecord = {
  id: string;
  match_id: string;
  meeting_id: string | null;
  status: string;
};

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

function normalizeName(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed.length > 0 ? trimmed : "User";
}

function normalizeMatchPair(userA: string, userB: string) {
  return [userA, userB].sort((a, b) => a.localeCompare(b));
}

async function getMeetingIdentities(meetingId: string): Promise<UserIdentity[]> {
  const { data: participants } = await supabase
    .from("meeting_participants")
    .select("user_id")
    .eq("meeting_id", meetingId);

  const participantIds = (participants || []).map((p) => p.user_id);
  if (participantIds.length === 0) {
    return [];
  }

  const [{ data: profiles }, { data: accounts }] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", participantIds),
    supabase
      .from("accounts")
      .select("id, email, display_name")
      .in("id", participantIds),
  ]);

  return participantIds.map((userId) => {
    const profile = profiles?.find((p) => p.user_id === userId);
    const account = accounts?.find((a) => a.id === userId);

    const firstName = normalizeName(
      profile?.first_name ||
        account?.display_name ||
        account?.email?.split("@")[0]
    );

    const lastName = (profile?.last_name || "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    return {
      userId,
      firstName,
      fullName: fullName.length > 0 ? fullName : firstName,
      email: account?.email || null,
    };
  });
}

async function insertNotification(userId: string, payload: {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}) {
  const preferredInsert = await supabase.from("notifications").insert({
    user_id: userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    data: payload.data || {},
  });

  if (!preferredInsert.error) {
    return;
  }

  await supabase.from("notifications").insert({
    user_id: userId,
    notification_type: payload.type,
    site_enabled: true,
    push_enabled: true,
    email_enabled: true,
  });
}

async function updateMeetingMatchOutcome(params: {
  meetingId: string;
  matched: boolean;
  matchedAt: string | null;
  responseOutcome: "both_yes" | "both_no" | "mismatch";
  responsesCompletedAt: string;
}) {
  const primaryUpdate = await supabase
    .from("meetings")
    .update({
      matched: params.matched,
      matched_at: params.matchedAt,
      response_outcome: params.responseOutcome,
      responses_completed_at: params.responsesCompletedAt,
    })
    .eq("id", params.meetingId);

  if (!primaryUpdate.error) {
    return;
  }

  if (primaryUpdate.error.code === "42703") {
    await supabase
      .from("meetings")
      .update({
        matched: params.matched,
        matched_at: params.matchedAt,
      })
      .eq("id", params.meetingId);
  }
}

async function upsertMatchPendingAgreement(params: {
  meetingId: string;
  user1Id: string;
  user2Id: string;
  matchedAt: string;
}) {
  const payload = {
    meeting_id: params.meetingId,
    user1_id: params.user1Id,
    user2_id: params.user2Id,
    matched_at: params.matchedAt,
    messaging_enabled: false,
    relationship_agreement_status: "pending",
    relationship_agreement_signed_at: null,
  };

  const withAgreementFields = await supabase
    .from("user_matches")
    .upsert(payload, { onConflict: "user1_id,user2_id" })
    .select("id, user1_id, user2_id, meeting_id, messaging_enabled")
    .single();

  if (!withAgreementFields.error && withAgreementFields.data) {
    return withAgreementFields.data;
  }

  if (withAgreementFields.error?.code === "42703") {
    const fallback = await supabase
      .from("user_matches")
      .upsert(
        {
          meeting_id: params.meetingId,
          user1_id: params.user1Id,
          user2_id: params.user2Id,
          matched_at: params.matchedAt,
          messaging_enabled: false,
        },
        { onConflict: "user1_id,user2_id" }
      )
      .select("id, user1_id, user2_id, meeting_id, messaging_enabled")
      .single();

    if (!fallback.error && fallback.data) {
      return fallback.data;
    }
  }

  throw withAgreementFields.error;
}

async function ensureRelationshipAgreement(params: {
  matchId: string;
  meetingId: string;
  user1Id: string;
  user2Id: string;
  user1Name: string;
  user2Name: string;
  meetingDate?: string | null;
}): Promise<AgreementRecord | null> {
  const existing = await supabase
    .from("relationship_agreements")
    .select("id, match_id, meeting_id, status")
    .eq("match_id", params.matchId)
    .maybeSingle();

  if (!existing.error && existing.data) {
    return existing.data as AgreementRecord;
  }

  if (existing.error && existing.error.code === "42P01") {
    return null;
  }

  const agreementText = buildRelationshipAgreementText({
    userOneName: params.user1Name,
    userTwoName: params.user2Name,
    meetingDate: params.meetingDate || null,
  });

  const created = await supabase
    .from("relationship_agreements")
    .insert({
      match_id: params.matchId,
      meeting_id: params.meetingId,
      user1_id: params.user1Id,
      user2_id: params.user2Id,
      agreement_text: agreementText,
      status: "pending",
      signed_by_user1: false,
      signed_by_user2: false,
    })
    .select("id, match_id, meeting_id, status")
    .single();

  if (created.error) {
    if (created.error.code === "42P01" || created.error.code === "42703") {
      return null;
    }
    throw created.error;
  }

  return created.data as AgreementRecord;
}

function buildMatchPendingAgreementEmail(params: {
  recipientName: string;
  partnerName: string;
  meetingId: string;
}) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin-bottom: 8px;">Mutual YES Confirmed</h2>
      <p>Hello ${params.recipientName},</p>
      <p>You and ${params.partnerName} both selected YES after your video date.</p>
      <p>To continue, sign your relationship agreement in your dashboard:</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com"}/dashboard/meetings/${params.meetingId}/response">Open Agreement</a></p>
      <p>Messaging unlocks only after both signatures are completed.</p>
    </div>
  `.trim();
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requesterAccount = await getAccountState(supabase, user.id);
    const requesterBlockedMessage = resolveOwnInteractionBlockMessage(requesterAccount);
    if (requesterBlockedMessage) {
      return NextResponse.json(
        { error: requesterBlockedMessage, code: "account_deactivated" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const meetingId = String(body?.meeting_id || "").trim();
    const response = String(body?.response || "").trim().toLowerCase();
    const partnerNameInput = String(body?.partner_name || "").trim();

    if (!meetingId || !response) {
      return NextResponse.json(
        { error: "meeting_id and response are required" },
        { status: 400 }
      );
    }

    if (!["yes", "no"].includes(response)) {
      return NextResponse.json(
        { error: "response must be 'yes' or 'no'" },
        { status: 400 }
      );
    }

    const { data: participant, error: participantError } = await supabase
      .from("meeting_participants")
      .select("role, meetings!inner(id, status, workflow_state, scheduled_at, matched)")
      .eq("meeting_id", meetingId)
      .eq("user_id", user.id)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { error: "You are not a participant in this meeting" },
        { status: 403 }
      );
    }

    const meetingRelation = participant.meetings as
      | MeetingStatusRelation
      | MeetingStatusRelation[];
    const meeting = Array.isArray(meetingRelation)
      ? meetingRelation[0]
      : meetingRelation;

    if (!meeting || meeting.status !== "completed") {
      return NextResponse.json(
        { error: "Meeting must be completed before submitting response" },
        { status: 400 }
      );
    }

    const identities = await getMeetingIdentities(meetingId);
    const currentIdentity =
      identities.find((identity) => identity.userId === user.id) || null;
    const partnerIdentity =
      identities.find((identity) => identity.userId !== user.id) || null;

    const userFullName = currentIdentity?.fullName || "User";
    const partnerName =
      partnerIdentity?.fullName ||
      partnerNameInput ||
      "your meeting partner";

    const agreementText =
      response === "yes"
        ? `I, ${userFullName}, confirm YES to continue with ${partnerName} after our video dating meeting.`
        : `I, ${userFullName}, confirm NO to continue with ${partnerName} after our video dating meeting.`;

    const { error: upsertResponseError } = await supabase
      .from("meeting_responses")
      .upsert(
        {
          meeting_id: meetingId,
          user_id: user.id,
          response,
          agreement_text: agreementText,
          signed_at: new Date().toISOString(),
        },
        { onConflict: "meeting_id,user_id" }
      );

    if (upsertResponseError) {
      console.error("Error upserting meeting response:", upsertResponseError);
      return NextResponse.json(
        { error: "Failed to submit response" },
        { status: 500 }
      );
    }

    if (partnerIdentity) {
      await insertNotification(partnerIdentity.userId, {
        type: "meeting_response_submitted",
        title: "Meeting Response Received",
        message: `${userFullName} has submitted a response for your completed meeting.`,
        data: { meeting_id: meetingId, responder_id: user.id },
      });

      if (partnerIdentity.email) {
        await sendResponseSubmittedEmail(partnerIdentity.email, {
          recipientName: partnerIdentity.firstName,
          partnerName: currentIdentity?.firstName || "Your match",
          meetingDate: meeting.scheduled_at
            ? new Date(meeting.scheduled_at).toLocaleDateString("en-US")
            : "Recent",
          yourResponsePending: true,
          meetingId,
        });
      }
    }

    const { data: allResponses } = await supabase
      .from("meeting_responses")
      .select("user_id, response")
      .eq("meeting_id", meetingId);

    if (!allResponses || allResponses.length < 2) {
      return NextResponse.json({
        success: true,
        message: "Response submitted successfully",
        match_created: false,
        agreement_required: false,
        both_responded: false,
        response_outcome: null,
      });
    }

    const currentWorkflowState = deriveWorkflowState({
      workflowState: meeting.workflow_state || null,
      status: meeting.status,
    });
    const transitionValidation = requireMeetingStateTransition({
      from: currentWorkflowState,
      to: "rated",
    });

    if (!transitionValidation.allowed) {
      return NextResponse.json(
        {
          error: "invalid_state_transition",
          message:
            transitionValidation.message ||
            "Cannot move meeting to rated state.",
        },
        { status: 409 }
      );
    }

    await supabase
      .from("meetings")
      .update({
        workflow_state: "rated",
        rated_at: new Date().toISOString(),
      })
      .eq("id", meetingId);

    const responseValues = allResponses.map((entry) => entry.response);
    const bothYes = responseValues.every((value) => value === "yes");
    const bothNo = responseValues.every((value) => value === "no");
    const nowIso = new Date().toISOString();

    let matchCreated = false;
    let agreementRequired = false;
    let responseOutcome: "both_yes" | "both_no" | "mismatch" = "mismatch";
    let matchId: string | null = null;
    let agreementId: string | null = null;

    const participantIds =
      identities.length >= 2
        ? identities.map((entry) => entry.userId)
        : (await supabase
            .from("meeting_participants")
            .select("user_id")
            .eq("meeting_id", meetingId)).data?.map((row) => row.user_id) || [];

    const normalizedParticipants = normalizeMatchPair(
      participantIds[0] || user.id,
      participantIds[1] || user.id
    );

    if (bothYes && normalizedParticipants.length === 2) {
      responseOutcome = "both_yes";

      const userOneIdentity =
        identities.find((item) => item.userId === normalizedParticipants[0]) ||
        null;
      const userTwoIdentity =
        identities.find((item) => item.userId === normalizedParticipants[1]) ||
        null;

      const match = await upsertMatchPendingAgreement({
        meetingId,
        user1Id: normalizedParticipants[0],
        user2Id: normalizedParticipants[1],
        matchedAt: nowIso,
      });

      matchCreated = true;
      agreementRequired = true;
      matchId = match.id;

      const agreement = await ensureRelationshipAgreement({
        matchId: match.id,
        meetingId,
        user1Id: normalizedParticipants[0],
        user2Id: normalizedParticipants[1],
        user1Name: userOneIdentity?.fullName || "Participant 1",
        user2Name: userTwoIdentity?.fullName || "Participant 2",
        meetingDate: meeting.scheduled_at || null,
      });

      agreementId = agreement?.id || null;

      await updateMeetingMatchOutcome({
        meetingId,
        matched: true,
        matchedAt: nowIso,
        responseOutcome,
        responsesCompletedAt: nowIso,
      });

      const participantIdentities = identities.filter((identity) =>
        normalizedParticipants.includes(identity.userId)
      );
      for (const identity of participantIdentities) {
        const partner = participantIdentities.find(
          (p) => p.userId !== identity.userId
        );

        await insertNotification(identity.userId, {
          type: "match_confirmed_pending_agreement",
          title: "It's a Match - Sign Agreement",
          message: `You and ${partner?.firstName || "your match"} selected YES. Sign your relationship agreement to unlock messaging.`,
          data: {
            meeting_id: meetingId,
            match_id: match.id,
            agreement_id: agreement?.id || null,
            action: "sign_relationship_agreement",
          },
        });

        if (identity.email) {
          await sendRawHtmlEmail(
            identity.email,
            "Mutual YES confirmed - sign your agreement",
            buildMatchPendingAgreementEmail({
              recipientName: identity.firstName,
              partnerName: partner?.firstName || "your match",
              meetingId,
            })
          );
        }
      }
    } else {
      responseOutcome = bothNo ? "both_no" : "mismatch";

      await updateMeetingMatchOutcome({
        meetingId,
        matched: false,
        matchedAt: null,
        responseOutcome,
        responsesCompletedAt: nowIso,
      });

      if (normalizedParticipants.length === 2) {
        await supabase
          .from("user_matches")
          .update({
            messaging_enabled: false,
            relationship_agreement_status: responseOutcome,
          })
          .or(
            `and(user1_id.eq.${normalizedParticipants[0]},user2_id.eq.${normalizedParticipants[1]}),and(user1_id.eq.${normalizedParticipants[1]},user2_id.eq.${normalizedParticipants[0]})`
          );
      }

      for (const identity of identities) {
        const partner = identities.find((p) => p.userId !== identity.userId);
        await insertNotification(identity.userId, {
          type: "meeting_responses_complete",
          title:
            responseOutcome === "both_no"
              ? "Both Responses: No"
              : "Responses Did Not Match",
          message:
            responseOutcome === "both_no"
              ? "Both participants selected NO. Profiles remain active."
              : `You and ${partner?.firstName || "your partner"} submitted different responses. No match was created.`,
          data: {
            meeting_id: meetingId,
            outcome: responseOutcome,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Response submitted successfully",
      match_created: matchCreated,
      agreement_required: agreementRequired,
      both_responded: true,
      response_outcome: responseOutcome,
      match_id: matchId,
      agreement_id: agreementId,
    });
  } catch (error) {
    console.error("Error in POST /api/meetings/response:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get("meeting_id");

    if (!meetingId) {
      return NextResponse.json(
        { error: "meeting_id is required" },
        { status: 400 }
      );
    }

    const { data: participant } = await supabase
      .from("meeting_participants")
      .select("user_id")
      .eq("meeting_id", meetingId)
      .eq("user_id", user.id)
      .single();

    const { data: account } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin =
      !!account?.role &&
      ["admin", "superadmin"].includes(account.role);

    if (!participant && !isAdmin) {
      return NextResponse.json(
        { error: "You are not authorized to view these responses" },
        { status: 403 }
      );
    }

    const { data: responses, error } = await supabase
      .from("meeting_responses")
      .select(`
        *,
        user:accounts!meeting_responses_user_id_fkey(
          id,
          email,
          display_name
        )
      `)
      .eq("meeting_id", meetingId);

    if (error) {
      console.error("Error fetching responses:", error);
      return NextResponse.json(
        { error: "Failed to fetch responses" },
        { status: 500 }
      );
    }

    return NextResponse.json({ responses: responses || [] });
  } catch (error) {
    console.error("Error in GET /api/meetings/response:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
