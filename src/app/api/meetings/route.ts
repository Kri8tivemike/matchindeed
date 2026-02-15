import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMeetingRequestEmail, sendMeetingAcceptedEmail } from "@/lib/email";
import { createZoomMeeting } from "@/lib/zoom";

// Initialize Supabase client with service role for API routes
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
 * GET /api/meetings
 * 
 * Fetch meetings for the current user
 * Query params:
 * - status: Filter by status (pending, confirmed, canceled, completed)
 * - type: Filter by type (group, one_on_one)
 * - upcoming: If "true", only return future meetings
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const upcoming = searchParams.get("upcoming") === "true";

    // Get meetings where user is host
    let hostQuery = supabase
      .from("meetings")
      .select(`
        *,
        meeting_participants (
          user_id,
          role,
          response,
          responded_at
        )
      `)
      .eq("host_id", user.id);

    if (status) {
      hostQuery = hostQuery.eq("status", status);
    }
    if (type) {
      hostQuery = hostQuery.eq("type", type);
    }
    if (upcoming) {
      hostQuery = hostQuery.gte("scheduled_at", new Date().toISOString());
    }

    const { data: hostMeetings, error: hostError } = await hostQuery.order("scheduled_at", { ascending: true });

    if (hostError) {
      console.error("Error fetching host meetings:", hostError);
      return NextResponse.json({ error: "Failed to fetch meetings" }, { status: 500 });
    }

    // Get meetings where user is participant (not host)
    const { data: participantData, error: participantError } = await supabase
      .from("meeting_participants")
      .select(`
        meeting_id,
        role,
        response,
        responded_at,
        meetings (*)
      `)
      .eq("user_id", user.id)
      .neq("role", "host");

    if (participantError) {
      console.error("Error fetching participant meetings:", participantError);
    }

    // Combine and deduplicate
    const meetingMap = new Map();
    
    hostMeetings?.forEach((m) => {
      meetingMap.set(m.id, {
        ...m,
        participants: m.meeting_participants,
        user_role: "host",
      });
    });

    participantData?.forEach((p: any) => {
      if (p.meetings && !meetingMap.has(p.meetings.id)) {
        // Apply filters to participant meetings too
        if (status && p.meetings.status !== status) return;
        if (type && p.meetings.type !== type) return;
        if (upcoming && new Date(p.meetings.scheduled_at) < new Date()) return;

        meetingMap.set(p.meetings.id, {
          ...p.meetings,
          participants: [{ user_id: user.id, role: p.role, response: p.response, responded_at: p.responded_at }],
          user_role: p.role,
          user_response: p.response,
        });
      }
    });

    const meetings = Array.from(meetingMap.values()).sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );

    return NextResponse.json({ meetings });
  } catch (error) {
    console.error("Error in GET /api/meetings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/meetings
 * 
 * Create a new meeting request
 * Body:
 * - target_user_id: User ID to request meeting with
 * - slot_date: Date of the meeting (YYYY-MM-DD)
 * - slot_time: Time of the meeting (HH:MM)
 * - type: "one_on_one" | "group" (default: "one_on_one")
 * - location_pref: Optional location preference
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { target_user_id, slot_date, slot_time, type = "one_on_one", location_pref, participant_ids } = body;

    // Validate required fields
    if (!target_user_id || !slot_date || !slot_time) {
      return NextResponse.json(
        { error: "target_user_id, slot_date, and slot_time are required" },
        { status: 400 }
      );
    }

    // Cannot book meeting with yourself
    if (target_user_id === user.id) {
      return NextResponse.json(
        { error: "Cannot request a meeting with yourself" },
        { status: 400 }
      );
    }

    // Get requester's account tier
    const { data: requesterAccount, error: requesterError } = await supabase
      .from("accounts")
      .select("tier")
      .eq("id", user.id)
      .single();

    if (requesterError || !requesterAccount) {
      return NextResponse.json({ error: "Failed to verify account" }, { status: 500 });
    }

    // Get target user's account tier
    const { data: targetAccount, error: targetError } = await supabase
      .from("accounts")
      .select("tier")
      .eq("id", target_user_id)
      .single();

    if (targetError || !targetAccount) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    // Get requester's tier configuration
    const { data: tierConfig, error: tierError } = await supabase
      .from("account_tier_config")
      .select("*")
      .eq("tier", requesterAccount.tier)
      .single();

    if (tierError || !tierConfig) {
      return NextResponse.json({ error: "Failed to verify tier permissions" }, { status: 500 });
    }

    // Check if user can contact the target tier
    const canContact = checkTierPermission(tierConfig, targetAccount.tier);
    if (!canContact.allowed) {
      return NextResponse.json(
        { 
          error: canContact.message,
          requires_upgrade: true,
          target_tier: targetAccount.tier
        },
        { status: 403 }
      );
    }

    // Check if target user has this slot available
    const { data: availableSlot, error: slotError } = await supabase
      .from("meeting_availability")
      .select("id")
      .eq("user_id", target_user_id)
      .eq("slot_date", slot_date)
      .eq("slot_time", slot_time)
      .single();

    if (slotError || !availableSlot) {
      return NextResponse.json(
        { error: "This time slot is not available" },
        { status: 400 }
      );
    }

    // Check requester's credit balance
    const { data: credits, error: creditsError } = await supabase
      .from("credits")
      .select("total, used")
      .eq("user_id", user.id)
      .single();

    const availableCredits = credits ? credits.total - credits.used : 0;
    const requiredCredits = canContact.extra_charge ? 2 : 1; // Extra charge for premium->VIP

    if (availableCredits < requiredCredits) {
      return NextResponse.json(
        { 
          error: `Insufficient credits. You need ${requiredCredits} credit(s) for this meeting.`,
          credits_required: requiredCredits,
          credits_available: availableCredits
        },
        { status: 402 }
      );
    }

    // Calculate meeting fee (based on tier pricing)
    const { data: pricing, error: pricingError } = await supabase
      .from("subscription_pricing")
      .select("price_ngn")
      .eq("tier_id", requesterAccount.tier)
      .single();

    const feeCents = pricing ? Math.round(pricing.price_ngn / tierConfig.monthly_outgoing_credits * 100) : 0;

    // Create the meeting
    // Per client rules: charge_status starts as "pending" and stays pending
    // until the meeting is concluded by the host and finalized by MatchIndeed.
    // The host determines the final credit charges based on fault.
    const scheduledAt = new Date(`${slot_date}T${slot_time}:00`);

    // Default cancellation fee — admin can adjust per meeting
    // This is charged to whoever cancels after the meeting is confirmed
    const defaultCancellationFeeCents = feeCents; // Same as meeting fee
    
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .insert({
        host_id: target_user_id, // Target user is the "host" of their calendar slot
        type,
        status: "pending",
        scheduled_at: scheduledAt.toISOString(),
        location_pref,
        fee_cents: feeCents,
        charge_status: "pending", // Stays pending until host finalizes
        cancellation_fee_cents: defaultCancellationFeeCents,
      })
      .select()
      .single();

    if (meetingError || !meeting) {
      console.error("Error creating meeting:", meetingError);
      return NextResponse.json({ error: "Failed to create meeting" }, { status: 500 });
    }

    // Add participants
    // For group meetings, include additional participants
    const participants: any[] = [
      { meeting_id: meeting.id, user_id: target_user_id, role: "host", response: "requested" },
      { meeting_id: meeting.id, user_id: user.id, role: "guest", response: "accepted" }, // Requester auto-accepts
    ];

    // Add additional participants for group meetings
    if (type === "group" && participant_ids && Array.isArray(participant_ids)) {
      for (const participantId of participant_ids) {
        if (participantId !== user.id && participantId !== target_user_id) {
          participants.push({
            meeting_id: meeting.id,
            user_id: participantId,
            role: "guest",
            response: "requested",
          });
        }
      }
    }

    const { error: participantsError } = await supabase
      .from("meeting_participants")
      .insert(participants);

    if (participantsError) {
      console.error("Error adding participants:", participantsError);
      // Rollback meeting creation
      await supabase.from("meetings").delete().eq("id", meeting.id);
      return NextResponse.json({ error: "Failed to create meeting" }, { status: 500 });
    }

    // Deduct credits from requester (hold as pending)
    const { error: creditError } = await supabase
      .from("credits")
      .update({ used: (credits?.used || 0) + requiredCredits })
      .eq("user_id", user.id);

    if (creditError) {
      console.error("Error deducting credits:", creditError);
      // Note: Meeting created but credits not deducted - admin may need to review
    }

    // Send notification to target user (host)
    try {
      // Get requester's account info to show account type
      const { data: requesterAccount } = await supabase
        .from("accounts")
        .select("tier, display_name, email")
        .eq("id", user.id)
        .single();

      const requesterTier = requesterAccount?.tier || "basic";
      const requesterName = requesterAccount?.display_name || requesterAccount?.email?.split("@")[0] || "Someone";

      // Create dashboard notification
      await supabase.from("notifications").insert({
        user_id: target_user_id,
        type: "meeting_request",
        title: "New Meeting Request",
        message: `${requesterName} (${requesterTier.charAt(0).toUpperCase() + requesterTier.slice(1)} account) has requested a video meeting with you on ${new Date(scheduledAt).toLocaleDateString()} at ${new Date(scheduledAt).toLocaleTimeString()}`,
        data: { 
          meeting_id: meeting.id,
          requester_id: user.id,
          requester_tier: requesterTier,
          scheduled_at: scheduledAt,
        },
      });

      // Send email notification to the target user
      const { data: targetAccount } = await supabase
        .from("accounts")
        .select("email")
        .eq("id", target_user_id)
        .single();

      const { data: targetProfile } = await supabase
        .from("user_profiles")
        .select("first_name")
        .eq("user_id", target_user_id)
        .single();

      if (targetAccount?.email) {
        await sendMeetingRequestEmail(targetAccount.email, {
          recipientName: targetProfile?.first_name || "User",
          requesterName,
          meetingDate: new Date(scheduledAt).toLocaleDateString(),
          meetingTime: new Date(scheduledAt).toLocaleTimeString(),
          meetingType: type || "Video Call",
        });
      }
    } catch (notificationError) {
      console.error("Error sending notification:", notificationError);
      // Don't fail the request if notification fails
    }

    return NextResponse.json({ 
      meeting: {
        ...meeting,
        participants,
      },
      credits_used: requiredCredits,
    }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/meetings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Check if a user's tier can contact another tier
 */
function checkTierPermission(
  config: any, 
  targetTier: string
): { allowed: boolean; message: string; extra_charge: boolean } {
  const tierLevels: Record<string, number> = {
    basic: 1,
    standard: 2,
    premium: 3,
    vip: 4,
  };

  // VIP can contact everyone
  if (config.tier === "vip") {
    return { allowed: true, message: "", extra_charge: false };
  }

  // Check tier-specific permissions from config
  switch (targetTier) {
    case "basic":
      return { 
        allowed: config.can_one_on_one_to_basic, 
        message: config.can_one_on_one_to_basic ? "" : "Your plan cannot contact Basic users",
        extra_charge: false
      };
    case "standard":
      return { 
        allowed: config.can_one_on_one_to_standard, 
        message: config.can_one_on_one_to_standard ? "" : "Your plan cannot contact Standard users",
        extra_charge: false
      };
    case "premium":
      return { 
        allowed: config.can_one_on_one_to_premium, 
        message: config.can_one_on_one_to_premium ? "" : "Upgrade to Premium to contact Premium users",
        extra_charge: config.extra_charge_one_on_one_to_premium
      };
    case "vip":
      return { 
        allowed: config.can_one_on_one_to_vip, 
        message: config.can_one_on_one_to_vip ? "" : "Only Premium users can contact VIP members",
        extra_charge: config.extra_charge_one_on_one_to_vip
      };
    default:
      return { allowed: false, message: "Unknown tier", extra_charge: false };
  }
}

/**
 * PATCH /api/meetings
 * 
 * Update a meeting (accept, decline, cancel)
 * Body:
 * - meeting_id: Meeting ID to update
 * - action: "accept" | "decline" | "cancel"
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { meeting_id, action } = body;

    if (!meeting_id || !action) {
      return NextResponse.json(
        { error: "meeting_id and action are required" },
        { status: 400 }
      );
    }

    if (!["accept", "decline", "cancel"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be accept, decline, or cancel" },
        { status: 400 }
      );
    }

    // Verify user is a participant
    const { data: participant, error: participantError } = await supabase
      .from("meeting_participants")
      .select("role, response")
      .eq("meeting_id", meeting_id)
      .eq("user_id", user.id)
      .single();

    if (participantError || !participant) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Get meeting details
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Handle different actions
    switch (action) {
      case "accept":
        // Update participant response
        await supabase
          .from("meeting_participants")
          .update({ 
            response: "accepted",
            responded_at: new Date().toISOString()
          })
          .eq("meeting_id", meeting_id)
          .eq("user_id", user.id);

        // Check if all participants accepted
        const { data: allParticipants } = await supabase
          .from("meeting_participants")
          .select("response")
          .eq("meeting_id", meeting_id);

        const allAccepted = allParticipants?.every(p => p.response === "accepted");
        
        if (allAccepted) {
          await supabase
            .from("meetings")
            .update({ status: "confirmed" })
            .eq("id", meeting_id);

          // Auto-generate video meeting link (Zoom or fallback)
          try {
            const { data: mtgForZoom } = await supabase
              .from("meetings")
              .select("scheduled_at")
              .eq("id", meeting_id)
              .single();

            const { data: zoomParticipants } = await supabase
              .from("meeting_participants")
              .select("user_id, role")
              .eq("meeting_id", meeting_id);

            const zoomGuest = zoomParticipants?.find((p) => p.role === "guest");
            const zoomHost = zoomParticipants?.find((p) => p.role === "host");

            const { data: zoomGuestProfile } = await supabase
              .from("user_profiles")
              .select("first_name")
              .eq("user_id", zoomGuest?.user_id || "")
              .single();

            const { data: zoomHostProfile } = await supabase
              .from("user_profiles")
              .select("first_name")
              .eq("user_id", zoomHost?.user_id || "")
              .single();

            const zoomResult = await createZoomMeeting({
              topic: `MatchIndeed: ${zoomHostProfile?.first_name || "Host"} & ${zoomGuestProfile?.first_name || "Guest"}`,
              startTime: mtgForZoom?.scheduled_at || new Date().toISOString(),
              durationMinutes: 30,
              hostName: zoomHostProfile?.first_name,
              guestName: zoomGuestProfile?.first_name,
            });

            if (zoomResult.success) {
              const videoUpdate: Record<string, any> = {
                video_link: zoomResult.join_url,
                video_password: zoomResult.password || null,
                video_link_is_fallback: zoomResult.is_fallback || false,
              };
              if (zoomResult.meeting_id) {
                videoUpdate.zoom_meeting_id = String(zoomResult.meeting_id);
              }

              await supabase
                .from("meetings")
                .update(videoUpdate)
                .eq("id", meeting_id);

              console.log(`[Zoom] Auto-generated link for meeting ${meeting_id}`);
            }
          } catch (zoomErr) {
            console.error("Error auto-generating Zoom link:", zoomErr);
            // Non-critical — link can be generated on-demand from the join page
          }

          // Schedule pre-meeting notifications
          try {
            const notificationResponse = await fetch(
              `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/meetings/notifications/schedule`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${request.headers.get("authorization")?.substring(7)}`,
                },
                body: JSON.stringify({ meeting_id }),
              }
            );
            if (!notificationResponse.ok) {
              console.error("Failed to schedule notifications");
            }
          } catch (error) {
            console.error("Error scheduling notifications:", error);
          }

          // Send "Meeting Accepted" email to all participants
          try {
            const { data: meetingForEmail } = await supabase
              .from("meetings")
              .select("scheduled_at")
              .eq("id", meeting_id)
              .single();

            const { data: allParticipantsForEmail } = await supabase
              .from("meeting_participants")
              .select("user_id")
              .eq("meeting_id", meeting_id);

            for (const p of allParticipantsForEmail || []) {
              const { data: pAccount } = await supabase
                .from("accounts")
                .select("email")
                .eq("id", p.user_id)
                .single();

              const { data: pProfile } = await supabase
                .from("user_profiles")
                .select("first_name")
                .eq("user_id", p.user_id)
                .single();

              const otherP = allParticipantsForEmail?.find(
                (x) => x.user_id !== p.user_id
              );
              const { data: otherProfile } = await supabase
                .from("user_profiles")
                .select("first_name")
                .eq("user_id", otherP?.user_id || "")
                .single();

              if (pAccount?.email && meetingForEmail) {
                await sendMeetingAcceptedEmail(pAccount.email, {
                  recipientName: pProfile?.first_name || "User",
                  partnerName: otherProfile?.first_name || "Your match",
                  meetingDate: new Date(meetingForEmail.scheduled_at).toLocaleDateString(),
                  meetingTime: new Date(meetingForEmail.scheduled_at).toLocaleTimeString(),
                });
              }
            }
          } catch (emailErr) {
            console.error("Error sending meeting accepted emails:", emailErr);
          }
        }

        return NextResponse.json({ 
          success: true, 
          meeting_status: allAccepted ? "confirmed" : "pending" 
        });

      case "decline":
        // Update participant response
        await supabase
          .from("meeting_participants")
          .update({ 
            response: "declined",
            responded_at: new Date().toISOString()
          })
          .eq("meeting_id", meeting_id)
          .eq("user_id", user.id);

        // Cancel the meeting
        await supabase
          .from("meetings")
          .update({ status: "canceled" })
          .eq("id", meeting_id);

        // Refund credits to the requester (guest)
        const { data: guest } = await supabase
          .from("meeting_participants")
          .select("user_id")
          .eq("meeting_id", meeting_id)
          .eq("role", "guest")
          .single();

        if (guest) {
          // Get current credits
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

        return NextResponse.json({ success: true, meeting_status: "canceled" });

      case "cancel":
        // Redirect to dedicated cancel endpoint for proper fee handling.
        // Per client rules:
        // - No one can cancel after admin approval without being charged
        // - Whoever cancels is responsible for the charges
        // - Cancellation fee notice must be shown before proceeding
        // Use POST /api/meetings/cancel for full cancellation flow.
        
        // Check if meeting can be canceled (only pending or confirmed)
        if (!["pending", "confirmed"].includes(meeting.status)) {
          return NextResponse.json(
            { error: "Cannot cancel this meeting — it is already " + meeting.status },
            { status: 400 }
          );
        }

        const isConfirmedMeeting = meeting.status === "confirmed";
        const meetingFeeCents = meeting.cancellation_fee_cents || 0;

        // If meeting is confirmed (admin approved), require explicit confirmation
        // because cancellation carries penalties (no refund, fee charged)
        if (isConfirmedMeeting || meetingFeeCents > 0) {
          return NextResponse.json(
            {
              error: "cancellation_requires_confirmation",
              message: isConfirmedMeeting
                ? "This meeting has been approved. Cancelling will charge you a cancellation fee with no credit refund. Use the dedicated cancellation endpoint with confirmation."
                : "Cancelling this meeting will incur a fee. Use the dedicated cancellation endpoint with confirmation.",
              cancellation_fee_cents: meetingFeeCents,
              requires_confirmation: true,
              redirect_to: "/api/meetings/cancel",
            },
            { status: 422 }
          );
        }

        // For pending meetings with no fee — allow direct cancellation
        await supabase
          .from("meetings")
          .update({
            status: "canceled",
            canceled_by: user.id,
            canceled_at: new Date().toISOString(),
          })
          .eq("id", meeting_id);

        // Refund credits to the guest (requester) since meeting was not yet approved
        const { data: cancelGuest } = await supabase
          .from("meeting_participants")
          .select("user_id")
          .eq("meeting_id", meeting_id)
          .eq("role", "guest")
          .single();

        if (cancelGuest) {
          const { data: cancelGuestCredits } = await supabase
            .from("credits")
            .select("used")
            .eq("user_id", cancelGuest.user_id)
            .single();

          if (cancelGuestCredits) {
            await supabase
              .from("credits")
              .update({ used: Math.max(0, cancelGuestCredits.used - 1) })
              .eq("user_id", cancelGuest.user_id);
          }
        }

        return NextResponse.json({
          success: true,
          meeting_status: "canceled",
          cancellation_fee_applied: false,
          cancellation_fee_cents: 0,
          credit_refunded: true,
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error in PATCH /api/meetings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
