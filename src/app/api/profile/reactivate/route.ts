import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendRawHtmlEmail } from "@/lib/email";
import { getPreferredEmailRecipientName } from "@/lib/email-recipient-name";
import {
  getReactivationReasonById,
  validateCustomReason,
} from "@/lib/reactivation-reasons";
import {
  reactivationPartnerNotificationTemplate,
  reactivationRequestReceivedTemplate,
} from "@/lib/email/reactivation-templates";

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AccountRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  profile_status?: string | null;
  profile_visible?: boolean | null;
};

type ProfileNameRow = {
  user_id: string;
  first_name: string | null;
};

type MatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  matched_at: string | null;
};

type ReactivationRequestRow = {
  id: string;
  user_id: string;
  matched_with_user_id: string;
  reason_code: number | null;
  reason_text: string | null;
  status: string;
  created_at: string;
  expires_at?: string | null;
};

/**
 * Resolve auth user from either bearer token (API clients) or cookie session (dashboard fetch).
 */
async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const {
      data: { user },
      error,
    } = await supabaseService.auth.getUser(token);
    if (!error && user) return user;
  }

  const cookieStore = await cookies();
  const supabaseServer = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // No-op for route handler reads.
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabaseServer.auth.getUser();
  if (error || !user) return null;

  return user;
}

/**
 * POST /api/profile/reactivate
 *
 * Request profile reactivation after matching.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      reason?: string;
      custom_reason?: string;
    };

    const { reason, custom_reason } = body;

    if (!reason) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }

    const isCustomReason = reason === "other" || reason === "26";
    const parsedReason = Number.parseInt(reason, 10);
    const reasonCode = Number.isNaN(parsedReason) ? (isCustomReason ? 26 : null) : parsedReason;

    if (!reasonCode) {
      return NextResponse.json({ error: "Invalid reason code" }, { status: 400 });
    }

    if (isCustomReason) {
      if (!custom_reason || !validateCustomReason(custom_reason, 200)) {
        return NextResponse.json(
          { error: "Custom reason must be at least 200 words" },
          { status: 400 }
        );
      }
    } else if (!getReactivationReasonById(reasonCode)) {
      return NextResponse.json(
        { error: "Invalid predefined reactivation reason" },
        { status: 400 }
      );
    }

    const { data: requesterAccount, error: requesterAccountError } =
      await supabaseService
        .from("accounts")
        .select("id, profile_status, profile_visible")
        .eq("id", user.id)
        .maybeSingle();

    if (requesterAccountError || !requesterAccount) {
      return NextResponse.json(
        { error: "Failed to verify account status" },
        { status: 500 }
      );
    }

    const profileStatus = String(
      (requesterAccount as AccountRow).profile_status || ""
    ).toLowerCase();
    const isOfflineMatched =
      profileStatus === "offline_matched" ||
      (requesterAccount as AccountRow).profile_visible === false;

    if (!isOfflineMatched) {
      return NextResponse.json(
        {
          error:
            "Reactivation is only available when your profile is offline after a completed match.",
        },
        { status: 409 }
      );
    }

    const { data: latestMatch, error: matchError } = await supabaseService
      .from("user_matches")
      .select("id, user1_id, user2_id, matched_at")
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order("matched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (matchError || !latestMatch) {
      return NextResponse.json(
        { error: "No active match found for reactivation request" },
        { status: 400 }
      );
    }

    const matchRow = latestMatch as MatchRow;
    const partnerId = matchRow.user1_id === user.id ? matchRow.user2_id : matchRow.user1_id;

    const { data: existingRequest } = await supabaseService
      .from("profile_reactivation_requests")
      .select("id, status, created_at")
      .eq("user_id", user.id)
      .in("status", ["pending", "partner_notified", "partner_responded"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingRequest) {
      return NextResponse.json(
        {
          error: "You already have a pending reactivation request",
          existing_request_id: existingRequest.id,
          status: existingRequest.status,
        },
        { status: 409 }
      );
    }

    const reasonLabel = getReactivationReasonById(reasonCode)?.label || "Other";
    const reasonText = isCustomReason ? custom_reason!.trim() : reasonLabel;

    const { data: insertedRequest, error: requestInsertError } = await supabaseService
      .from("profile_reactivation_requests")
      .insert({
        user_id: user.id,
        matched_with_user_id: partnerId,
        reason_code: reasonCode,
        reason_text: reasonText,
        status: "partner_notified",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id, user_id, matched_with_user_id, reason_code, reason_text, status, created_at, expires_at")
      .single();

    if (requestInsertError || !insertedRequest) {
      console.error("Error creating reactivation request:", requestInsertError);
      return NextResponse.json(
        { error: "Failed to submit reactivation request" },
        { status: 500 }
      );
    }

    const expiresAt = insertedRequest.expires_at
      ? new Date(insertedRequest.expires_at)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const responseUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com"}/dashboard/reactivate/respond?request_id=${insertedRequest.id}`;

    await supabaseService.from("notifications").insert([
      {
        user_id: partnerId,
        type: "profile_reactivation_request",
        title: "Profile Reactivation Request",
        message:
          "Your previous match partner has requested profile reactivation. Please respond within 7 days.",
        data: {
          request_id: insertedRequest.id,
          requester_id: user.id,
          response_url: responseUrl,
          expires_at: expiresAt.toISOString(),
        },
      },
      {
        user_id: user.id,
        type: "profile_reactivation_request_received",
        title: "Reactivation Request Submitted",
        message:
          "Your request was submitted and your previous match partner has been notified.",
        data: {
          request_id: insertedRequest.id,
          partner_id: partnerId,
          expires_at: expiresAt.toISOString(),
        },
      },
    ]);

    const [{ data: accountRows }, { data: profileRows }] = await Promise.all([
      supabaseService
        .from("accounts")
        .select("id, email, display_name")
        .in("id", [user.id, partnerId]),
      supabaseService
        .from("user_profiles")
        .select("user_id, first_name")
        .in("user_id", [user.id, partnerId]),
    ]);

    const accountMap = new Map(
      ((accountRows || []) as AccountRow[]).map((row) => [row.id, row])
    );
    const profileMap = new Map(
      ((profileRows || []) as ProfileNameRow[]).map((row) => [row.user_id, row])
    );

    const requester = accountMap.get(user.id);
    const partner = accountMap.get(partnerId);

    const requesterName = getPreferredEmailRecipientName({
      profileFirstName: profileMap.get(user.id)?.first_name,
      accountDisplayName: requester?.display_name,
      email: requester?.email,
      defaultValue: "User",
    });
    const partnerName = getPreferredEmailRecipientName({
      profileFirstName: profileMap.get(partnerId)?.first_name,
      accountDisplayName: partner?.display_name,
      email: partner?.email,
      defaultValue: "Your Match",
    });

    if (requester?.email) {
      const requesterEmailHtml = reactivationRequestReceivedTemplate(
        requesterName,
        partnerName,
        reasonText
      );
      await sendRawHtmlEmail(
        requester.email,
        "Reactivation Request Received",
        requesterEmailHtml
      );
    }

    if (partner?.email) {
      const partnerEmailHtml = reactivationPartnerNotificationTemplate(
        partnerName,
        requesterName,
        reasonText,
        responseUrl,
        expiresAt.toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      );
      await sendRawHtmlEmail(
        partner.email,
        "Your Match Requested Reactivation",
        partnerEmailHtml
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Reactivation request submitted. Your partner has been notified and auto-approval runs after 7 days if no objection.",
      request_id: insertedRequest.id,
      status: insertedRequest.status,
      expires_at: insertedRequest.expires_at || expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Error in POST /api/profile/reactivate:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/profile/reactivate
 *
 * Get the latest reactivation request status for the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: latestRequest, error } = await supabaseService
      .from("profile_reactivation_requests")
      .select("id, user_id, matched_with_user_id, reason_code, reason_text, status, created_at, expires_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching reactivation status:", error);
      return NextResponse.json(
        { error: "Failed to fetch reactivation status" },
        { status: 500 }
      );
    }

    if (!latestRequest) {
      return NextResponse.json({
        has_pending_request: false,
        status: null,
        reactivation_reason: null,
      });
    }

    const requestRow = latestRequest as ReactivationRequestRow;
    const hasPendingRequest = [
      "pending",
      "partner_notified",
      "partner_responded",
    ].includes(requestRow.status);

    return NextResponse.json({
      has_pending_request: hasPendingRequest,
      status: requestRow.status,
      created_at: requestRow.created_at,
      expires_at: requestRow.expires_at || null,
      reason_code: requestRow.reason_code,
      reactivation_reason: requestRow.reason_text,
      custom_reason: requestRow.reason_code === 26 ? requestRow.reason_text : null,
      request_id: requestRow.id,
    });
  } catch (error) {
    console.error("Error in GET /api/profile/reactivate:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
