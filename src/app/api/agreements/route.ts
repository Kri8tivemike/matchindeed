import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildRelationshipAgreementText } from "@/lib/agreements/templates";
import { sendRawHtmlEmail } from "@/lib/email";
import { autoDeactivateMatchedProfiles } from "@/lib/profile/auto-deactivate";
import { CIO_EVENTS, trackCustomerEventSafely } from "@/lib/customerio";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type MatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  meeting_id: string | null;
  messaging_enabled: boolean | null;
  matched_at: string | null;
  relationship_agreement_status?: string | null;
};

type RelationshipAgreementRow = {
  id: string;
  match_id: string;
  meeting_id: string | null;
  user1_id: string;
  user2_id: string;
  agreement_text: string;
  signed_by_user1: boolean | null;
  signed_by_user2: boolean | null;
  user1_signed_at: string | null;
  user2_signed_at: string | null;
  signed_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type UserIdentity = {
  email: string | null;
  fullName: string;
  firstName: string;
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

function sanitizeName(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed.length > 0 ? trimmed : "User";
}

async function getUserIdentity(userId: string): Promise<UserIdentity> {
  const [{ data: account }, { data: profile }] = await Promise.all([
    supabase
      .from("accounts")
      .select("email, display_name")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("first_name, last_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const firstName = sanitizeName(
    (profile?.first_name as string | null) ||
      (account?.display_name as string | null) ||
      account?.email?.split("@")[0]
  );
  const lastName = (profile?.last_name || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    email: account?.email || null,
    firstName,
    fullName: fullName.length > 0 ? fullName : firstName,
  };
}

function normalizeMatchPair(userA: string, userB: string) {
  return [userA, userB].sort((a, b) => a.localeCompare(b));
}

async function getMatchForRequest(params: {
  matchId?: string | null;
  meetingId?: string | null;
}): Promise<MatchRow | null> {
  if (params.matchId) {
    const { data } = await supabase
      .from("user_matches")
      .select("id, user1_id, user2_id, meeting_id, messaging_enabled, matched_at, relationship_agreement_status")
      .eq("id", params.matchId)
      .maybeSingle();

    return (data as MatchRow | null) || null;
  }

  if (!params.meetingId) {
    return null;
  }

  const { data } = await supabase
    .from("user_matches")
    .select("id, user1_id, user2_id, meeting_id, messaging_enabled, matched_at, relationship_agreement_status")
    .eq("meeting_id", params.meetingId)
    .order("matched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as MatchRow | null) || null;
}

async function getExistingAgreement(matchId: string) {
  const { data } = await supabase
    .from("relationship_agreements")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();

  return (data as RelationshipAgreementRow | null) || null;
}

async function insertNotification(userId: string, payload: {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}) {
  const newFormat = await supabase.from("notifications").insert({
    user_id: userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    data: payload.data || {},
  });

  if (!newFormat.error) {
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

function agreementToJson(
  agreement: RelationshipAgreementRow,
  userId: string
) {
  const isUser1 = agreement.user1_id === userId;
  const isUser2 = agreement.user2_id === userId;
  const hasSigned = isUser1
    ? !!agreement.signed_by_user1
    : isUser2
      ? !!agreement.signed_by_user2
      : false;

  const partnerSigned = isUser1
    ? !!agreement.signed_by_user2
    : isUser2
      ? !!agreement.signed_by_user1
      : false;

  return {
    id: agreement.id,
    match_id: agreement.match_id,
    meeting_id: agreement.meeting_id,
    agreement_text: agreement.agreement_text,
    status: agreement.status,
    signed_at: agreement.signed_at,
    user_signed: hasSigned,
    partner_signed: partnerSigned,
    fully_signed: !!agreement.signed_by_user1 && !!agreement.signed_by_user2,
    user1_signed_at: agreement.user1_signed_at,
    user2_signed_at: agreement.user2_signed_at,
  };
}

function buildAgreementEmailHtml(params: {
  recipientName: string;
  partnerName: string;
  agreementText: string;
  signedAt: string;
}) {
  const agreementTextHtml = params.agreementText
    .split("\n")
    .map((line) => line.trim())
    .join("<br/>");

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
      <h2 style="margin-bottom: 8px;">Relationship Agreement Signed</h2>
      <p>Hello ${params.recipientName},</p>
      <p>You and ${params.partnerName} have fully signed your MatchIndeed relationship agreement.</p>
      <p><strong>Signed on:</strong> ${new Date(params.signedAt).toLocaleString("en-US")}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <p style="font-weight: 600; margin-bottom: 8px;">Agreement copy:</p>
      <p style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">${agreementTextHtml}</p>
      <p style="margin-top: 16px;">Your profile has been marked as <strong>Profile Offline - Matched</strong>.</p>
    </div>
  `.trim();
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("match_id");
    const meetingId = searchParams.get("meeting_id");

    if (!matchId && !meetingId) {
      return NextResponse.json(
        { error: "match_id or meeting_id is required" },
        { status: 400 }
      );
    }

    const match = await getMatchForRequest({ matchId, meetingId });
    if (!match) {
      return NextResponse.json({ agreement: null, match: null });
    }

    const isMatchParticipant =
      match.user1_id === user.id || match.user2_id === user.id;
    if (!isMatchParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const agreement = await getExistingAgreement(match.id);
    if (!agreement) {
      return NextResponse.json({
        agreement: null,
        match: {
          id: match.id,
          meeting_id: match.meeting_id,
          messaging_enabled: !!match.messaging_enabled,
          relationship_agreement_status:
            match.relationship_agreement_status || "pending",
        },
      });
    }

    return NextResponse.json({
      agreement: agreementToJson(agreement, user.id),
      match: {
        id: match.id,
        meeting_id: match.meeting_id,
        messaging_enabled: !!match.messaging_enabled,
        relationship_agreement_status:
          match.relationship_agreement_status || agreement.status,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/agreements:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const matchId = String(body?.match_id || "").trim() || null;
    const meetingId = String(body?.meeting_id || "").trim() || null;

    if (!matchId && !meetingId) {
      return NextResponse.json(
        { error: "match_id or meeting_id is required" },
        { status: 400 }
      );
    }

    const match = await getMatchForRequest({ matchId, meetingId });
    if (!match) {
      return NextResponse.json(
        { error: "Match not found for agreement" },
        { status: 404 }
      );
    }

    if (match.user1_id !== user.id && match.user2_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [userOneId, userTwoId] = normalizeMatchPair(
      match.user1_id,
      match.user2_id
    );
    const meetingLookupId = match.meeting_id || meetingId;

    const [userOneIdentity, userTwoIdentity, meetingData] = await Promise.all([
      getUserIdentity(userOneId),
      getUserIdentity(userTwoId),
      meetingLookupId
        ? supabase
            .from("meetings")
            .select("id, scheduled_at")
            .eq("id", meetingLookupId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    let agreement = await getExistingAgreement(match.id);
    if (!agreement) {
      const agreementText = buildRelationshipAgreementText({
        userOneName: userOneIdentity.fullName,
        userTwoName: userTwoIdentity.fullName,
        meetingDate:
          (meetingData && "data" in meetingData
            ? (meetingData.data as { scheduled_at?: string } | null)?.scheduled_at
            : null) || null,
      });

      const { data: insertedAgreement, error: insertAgreementError } =
        await supabase
          .from("relationship_agreements")
          .insert({
            match_id: match.id,
            meeting_id: meetingLookupId,
            user1_id: userOneId,
            user2_id: userTwoId,
            agreement_text: agreementText,
            status: "pending",
            signed_by_user1: false,
            signed_by_user2: false,
          })
          .select("*")
          .single();

      if (insertAgreementError || !insertedAgreement) {
        console.error("Error creating relationship agreement:", insertAgreementError);
        return NextResponse.json(
          { error: "Failed to create relationship agreement" },
          { status: 500 }
        );
      }

      agreement = insertedAgreement as RelationshipAgreementRow;
    }

    const nowIso = new Date().toISOString();
    const isUserOne = agreement.user1_id === user.id;
    const isUserTwo = agreement.user2_id === user.id;

    if (!isUserOne && !isUserTwo) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updatePayload: Record<string, unknown> = {};

    if (isUserOne && !agreement.signed_by_user1) {
      updatePayload.signed_by_user1 = true;
      updatePayload.user1_signed_at = nowIso;
    }

    if (isUserTwo && !agreement.signed_by_user2) {
      updatePayload.signed_by_user2 = true;
      updatePayload.user2_signed_at = nowIso;
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateAgreementError } = await supabase
        .from("relationship_agreements")
        .update(updatePayload)
        .eq("id", agreement.id);

      if (updateAgreementError) {
        console.error("Error signing relationship agreement:", updateAgreementError);
        return NextResponse.json(
          { error: "Failed to sign agreement" },
          { status: 500 }
        );
      }
    }

    const refreshedAgreement = await getExistingAgreement(match.id);
    if (!refreshedAgreement) {
      return NextResponse.json(
        { error: "Failed to refresh agreement state" },
        { status: 500 }
      );
    }

    let finalizedAgreement = refreshedAgreement;
    const bothSigned =
      !!refreshedAgreement.signed_by_user1 &&
      !!refreshedAgreement.signed_by_user2;
    let migrationPending = false;

    if (bothSigned) {
      if (refreshedAgreement.status !== "signed" || !refreshedAgreement.signed_at) {
        const { data: signedAgreement, error: finalizeAgreementError } =
          await supabase
            .from("relationship_agreements")
            .update({
              status: "signed",
              signed_at: nowIso,
            })
            .eq("id", refreshedAgreement.id)
            .select("*")
            .single();

        if (finalizeAgreementError || !signedAgreement) {
          console.error("Error finalizing relationship agreement:", finalizeAgreementError);
          return NextResponse.json(
            { error: "Failed to finalize agreement" },
            { status: 500 }
          );
        }

        finalizedAgreement = signedAgreement as RelationshipAgreementRow;
      }

      await supabase
        .from("user_matches")
        .update({
          messaging_enabled: true,
          relationship_agreement_status: "signed",
          relationship_agreement_signed_at: nowIso,
        })
        .eq("id", match.id);

      const deactivation = await autoDeactivateMatchedProfiles(supabase, [
        match.user1_id,
        match.user2_id,
      ]);
      migrationPending = deactivation.migrationPending;

      await Promise.all([
        insertNotification(match.user1_id, {
          type: "agreement_fully_signed",
          title: "Agreement Signed",
          message:
            "Your relationship agreement is now fully signed. Messaging is enabled.",
          data: { match_id: match.id, agreement_id: finalizedAgreement.id },
        }),
        insertNotification(match.user2_id, {
          type: "agreement_fully_signed",
          title: "Agreement Signed",
          message:
            "Your relationship agreement is now fully signed. Messaging is enabled.",
          data: { match_id: match.id, agreement_id: finalizedAgreement.id },
        }),
      ]);

      const agreementSignedAt = finalizedAgreement.signed_at || nowIso;
      await Promise.all([
        userOneIdentity.email
          ? sendRawHtmlEmail(
              userOneIdentity.email,
              "Relationship Agreement Signed - MatchIndeed",
              buildAgreementEmailHtml({
                recipientName: userOneIdentity.firstName,
                partnerName: userTwoIdentity.firstName,
                agreementText: finalizedAgreement.agreement_text,
                signedAt: agreementSignedAt,
              })
            )
          : Promise.resolve(),
        userTwoIdentity.email
          ? sendRawHtmlEmail(
              userTwoIdentity.email,
              "Relationship Agreement Signed - MatchIndeed",
              buildAgreementEmailHtml({
                recipientName: userTwoIdentity.firstName,
                partnerName: userOneIdentity.firstName,
                agreementText: finalizedAgreement.agreement_text,
                signedAt: agreementSignedAt,
              })
            )
          : Promise.resolve(),
      ]);

      await Promise.allSettled([
        trackCustomerEventSafely(match.user1_id, CIO_EVENTS.AGREEMENT_SIGNED, {
          match_id: match.id,
          meeting_id: match.meeting_id,
          agreement_id: finalizedAgreement.id,
          signed_at: agreementSignedAt,
        }),
        trackCustomerEventSafely(match.user2_id, CIO_EVENTS.AGREEMENT_SIGNED, {
          match_id: match.id,
          meeting_id: match.meeting_id,
          agreement_id: finalizedAgreement.id,
          signed_at: agreementSignedAt,
        }),
        trackCustomerEventSafely(match.user1_id, CIO_EVENTS.CHAT_UNLOCKED, {
          match_id: match.id,
          meeting_id: match.meeting_id,
          agreement_id: finalizedAgreement.id,
          unlocked_at: nowIso,
        }),
        trackCustomerEventSafely(match.user2_id, CIO_EVENTS.CHAT_UNLOCKED, {
          match_id: match.id,
          meeting_id: match.meeting_id,
          agreement_id: finalizedAgreement.id,
          unlocked_at: nowIso,
        }),
      ]);
    } else {
      await supabase
        .from("user_matches")
        .update({
          messaging_enabled: false,
          relationship_agreement_status: "pending",
        })
        .eq("id", match.id);

      const partnerId = isUserOne ? match.user2_id : match.user1_id;
      await insertNotification(partnerId, {
        type: "agreement_signature_pending",
        title: "Agreement Signature Update",
        message:
          "Your match has signed the relationship agreement. Please sign to enable messaging.",
        data: { match_id: match.id, agreement_id: refreshedAgreement.id },
      });
    }

    return NextResponse.json({
      success: true,
      agreement: agreementToJson(finalizedAgreement, user.id),
      both_signed: bothSigned,
      messaging_enabled: bothSigned,
      profile_auto_deactivated: bothSigned,
      migration_pending: migrationPending,
    });
  } catch (error) {
    console.error("Error in POST /api/agreements:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
