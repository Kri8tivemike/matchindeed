import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendMatchFoundEmail,
  sendResponseSubmittedEmail,
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
 * POST /api/meetings/response
 * 
 * Submit Yes/No response after a meeting
 * Body:
 * - meeting_id: Meeting ID
 * - response: "yes" | "no"
 * - partner_name: Partner's full name for agreement text
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { meeting_id, response, partner_name } = body;

    if (!meeting_id || !response || !partner_name) {
      return NextResponse.json(
        { error: "meeting_id, response, and partner_name are required" },
        { status: 400 }
      );
    }

    if (!["yes", "no"].includes(response.toLowerCase())) {
      return NextResponse.json(
        { error: "response must be 'yes' or 'no'" },
        { status: 400 }
      );
    }

    // Verify user is a participant in this meeting
    const { data: participant, error: participantError } = await supabase
      .from("meeting_participants")
      .select("role, meetings!inner(status)")
      .eq("meeting_id", meeting_id)
      .eq("user_id", user.id)
      .single();

    if (participantError || !participant) {
      return NextResponse.json(
        { error: "You are not a participant in this meeting" },
        { status: 403 }
      );
    }

    // Check if meeting is completed
    const meeting = participant.meetings as any;
    if (meeting.status !== "completed") {
      return NextResponse.json(
        { error: "Meeting must be completed before submitting response" },
        { status: 400 }
      );
    }

    // Get user's full name
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("first_name, last_name")
      .eq("user_id", user.id)
      .single();

    const userFullName = profile 
      ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "User"
      : "User";

    // Create agreement text
    const agreementText = response.toLowerCase() === "yes"
      ? `I, ${userFullName}, solemnly agree to ${partner_name} in his/her request for a relationship after our video dating meeting. Yes, I accept.`
      : `I, ${userFullName}, solemnly agree to ${partner_name} in his/her request for a relationship after our video dating meeting. NO, I do not accept.`;

    // Check if response already exists
    const { data: existingResponse } = await supabase
      .from("meeting_responses")
      .select("id")
      .eq("meeting_id", meeting_id)
      .eq("user_id", user.id)
      .single();

    if (existingResponse) {
      // Update existing response
      const { error: updateError } = await supabase
        .from("meeting_responses")
        .update({
          response: response.toLowerCase(),
          agreement_text: agreementText,
          signed_at: new Date().toISOString(),
        })
        .eq("id", existingResponse.id);

      if (updateError) {
        console.error("Error updating response:", updateError);
        return NextResponse.json(
          { error: "Failed to update response" },
          { status: 500 }
        );
      }
    } else {
      // Create new response
      const { error: insertError } = await supabase
        .from("meeting_responses")
        .insert({
          meeting_id,
          user_id: user.id,
          response: response.toLowerCase(),
          agreement_text: agreementText,
        });

      if (insertError) {
        console.error("Error creating response:", insertError);
        return NextResponse.json(
          { error: "Failed to submit response" },
          { status: 500 }
        );
      }
    }

    // ---------------------------------------------------------------
    // SEND NOTIFICATION TO PARTNER AND ADMIN
    // ---------------------------------------------------------------

    try {
      // Get all participants for the meeting
      const { data: meetingParticipants } = await supabase
        .from("meeting_participants")
        .select("user_id, role")
        .eq("meeting_id", meeting_id);

      // Notify the partner that the user has submitted their response
      const partner = meetingParticipants?.find((p) => p.user_id !== user.id);
      if (partner) {
        await supabase.from("notifications").insert({
          user_id: partner.user_id,
          type: "meeting_response_submitted",
          title: "Meeting Response Received",
          message: `${userFullName} has submitted their response for your video dating meeting.`,
          data: { meeting_id, responder_id: user.id },
        });

        // Send email notification to partner
        const { data: partnerAccount } = await supabase
          .from("accounts")
          .select("email")
          .eq("id", partner.user_id)
          .single();

        const { data: partnerProfile } = await supabase
          .from("user_profiles")
          .select("first_name")
          .eq("user_id", partner.user_id)
          .single();

        // Check if partner has already responded
        const { data: partnerResponse } = await supabase
          .from("meeting_responses")
          .select("id")
          .eq("meeting_id", meeting_id)
          .eq("user_id", partner.user_id)
          .single();

        // Get meeting date
        const { data: mtg } = await supabase
          .from("meetings")
          .select("scheduled_at")
          .eq("id", meeting_id)
          .single();

        if (partnerAccount?.email) {
          await sendResponseSubmittedEmail(partnerAccount.email, {
            recipientName: partnerProfile?.first_name || "User",
            partnerName: userFullName,
            meetingDate: mtg?.scheduled_at
              ? new Date(mtg.scheduled_at).toLocaleDateString()
              : "Recent",
            yourResponsePending: !partnerResponse,
            meetingId: meeting_id,
          });
        }
      }
    } catch (notifErr) {
      console.error("Error sending response notification:", notifErr);
      // Don't fail the response submission if notifications fail
    }

    // ---------------------------------------------------------------
    // CHECK IF BOTH PARTICIPANTS HAVE RESPONDED → MATCH LOGIC
    // ---------------------------------------------------------------

    const { data: allResponses } = await supabase
      .from("meeting_responses")
      .select("user_id, response")
      .eq("meeting_id", meeting_id);

    let matchCreated = false;

    if (allResponses && allResponses.length === 2) {
      const bothYes = allResponses.every((r) => r.response === "yes");

      if (bothYes) {
        // Both said yes → create match and enable messaging
        const { data: matchParticipants } = await supabase
          .from("meeting_participants")
          .select("user_id")
          .eq("meeting_id", meeting_id);

        if (matchParticipants && matchParticipants.length === 2) {
          const [user1_id, user2_id] = matchParticipants.map(
            (p) => p.user_id
          );

          // Create match record
          const { error: matchError } = await supabase
            .from("user_matches")
            .insert({
              meeting_id,
              user1_id,
              user2_id,
              matched_at: new Date().toISOString(),
              messaging_enabled: true,
            });

          if (!matchError) {
            matchCreated = true;

            // Update meeting record
            await supabase
              .from("meetings")
              .update({
                matched: true,
                matched_at: new Date().toISOString(),
              })
              .eq("id", meeting_id);

            // Notify both users about the match (in-app + email)
            for (const p of matchParticipants) {
              const { data: pProfile } = await supabase
                .from("user_profiles")
                .select("first_name")
                .eq("user_id", p.user_id)
                .single();

              const otherUser = matchParticipants.find(
                (mp) => mp.user_id !== p.user_id
              );
              const { data: otherProfile } = await supabase
                .from("user_profiles")
                .select("first_name")
                .eq("user_id", otherUser?.user_id || "")
                .single();

              await supabase.from("notifications").insert({
                user_id: p.user_id,
                type: "match_created",
                title: "It's a Match!",
                message: `Congratulations ${pProfile?.first_name || ""}! Both you and ${otherProfile?.first_name || "your partner"} accepted. Messaging is now enabled between you.`,
                data: { meeting_id, match: true },
              });

              // Send "It's a Match!" email
              const { data: pAccount } = await supabase
                .from("accounts")
                .select("email")
                .eq("id", p.user_id)
                .single();

              if (pAccount?.email) {
                await sendMatchFoundEmail(pAccount.email, {
                  recipientName: pProfile?.first_name || "User",
                  partnerName: otherProfile?.first_name || "Your Partner",
                });
              }
            }
          }
        }
      } else {
        // Responses don't match — notify both parties
        try {
          const { data: allParticipants } = await supabase
            .from("meeting_participants")
            .select("user_id")
            .eq("meeting_id", meeting_id);

          for (const p of allParticipants || []) {
            const { data: pProfile } = await supabase
              .from("user_profiles")
              .select("first_name")
              .eq("user_id", p.user_id)
              .single();

            await supabase.from("notifications").insert({
              user_id: p.user_id,
              type: "meeting_responses_complete",
              title: "Meeting Responses Complete",
              message: `Dear ${pProfile?.first_name || "User"}, both responses for your video dating meeting have been submitted. Your profile remains active and visible.`,
              data: { meeting_id, match: false },
            });
          }
        } catch (notifErr) {
          console.error("Error sending completion notifications:", notifErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Response submitted successfully",
      match_created: matchCreated,
    });
  } catch (error) {
    console.error("Error in POST /api/meetings/response:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/meetings/response
 * 
 * Get responses for a meeting
 * Query params:
 * - meeting_id: Meeting ID
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

    // Verify user is a participant or admin
    const { data: participant } = await supabase
      .from("meeting_participants")
      .select("user_id")
      .eq("meeting_id", meeting_id)
      .eq("user_id", user.id)
      .single();

    // Check if admin
    const { data: account } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = account?.role && ["admin", "superadmin", "moderator"].includes(account.role);

    if (!participant && !isAdmin) {
      return NextResponse.json(
        { error: "You are not authorized to view these responses" },
        { status: 403 }
      );
    }

    // Get all responses for this meeting
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
      .eq("meeting_id", meeting_id);

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
