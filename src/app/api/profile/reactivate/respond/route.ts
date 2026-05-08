import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendRawHtmlEmail } from "@/lib/email";
import { getPreferredEmailRecipientName } from "@/lib/email-recipient-name";

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ReactivationRequestRow = {
  id: string;
  user_id: string;
  matched_with_user_id: string;
  reason_code: number | null;
  reason_text: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
};

type AccountRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

type ProfileNameRow = {
  user_id: string;
  first_name: string | null;
};

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

function resolveRequestExpiry(requestData: ReactivationRequestRow) {
  if (requestData.expires_at) {
    return new Date(requestData.expires_at);
  }
  return new Date(new Date(requestData.created_at).getTime() + 7 * 24 * 60 * 60 * 1000);
}

async function insertNotification(
  userId: string,
  payload: {
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }
) {
  const preferred = await supabaseService.from("notifications").insert({
    user_id: userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    data: payload.data || {},
  });

  if (!preferred.error) return;

  await supabaseService.from("notifications").insert({
    user_id: userId,
    notification_type: payload.type,
    site_enabled: true,
    push_enabled: true,
    email_enabled: true,
  });
}

async function getRequestById(requestId: string) {
  const { data, error } = await supabaseService
    .from("profile_reactivation_requests")
    .select(
      "id, user_id, matched_with_user_id, reason_code, reason_text, status, created_at, expires_at"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ReactivationRequestRow;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("request_id");

    if (!requestId) {
      return NextResponse.json(
        { error: "request_id is required" },
        { status: 400 }
      );
    }

    const requestData = await getRequestById(requestId);
    if (!requestData) {
      return NextResponse.json(
        { error: "Reactivation request not found" },
        { status: 404 }
      );
    }

    if (requestData.matched_with_user_id !== user.id) {
      return NextResponse.json(
        { error: "Only the matched partner can view this request" },
        { status: 403 }
      );
    }

    const expiresAt = resolveRequestExpiry(requestData);
    const expired = Date.now() > expiresAt.getTime();

    const { data: requesterAccount } = await supabaseService
      .from("accounts")
      .select("id, email, display_name")
      .eq("id", requestData.user_id)
      .maybeSingle();

    return NextResponse.json({
      request_id: requestData.id,
      status: requestData.status,
      reason_code: requestData.reason_code,
      reason_text: requestData.reason_text,
      created_at: requestData.created_at,
      expires_at: expiresAt.toISOString(),
      requester: requesterAccount || null,
      can_respond:
        !expired &&
        ["partner_notified", "pending"].includes(requestData.status),
      expired,
    });
  } catch (error) {
    console.error("Error in GET /api/profile/reactivate/respond:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/profile/reactivate/respond
 *
 * Partner response within 7 days:
 * - allow/object -> status becomes partner_responded for admin review.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      request_id?: string;
      response?: "allow" | "object";
      reason_text?: string;
      reason_code?: number;
    };

    if (!body.request_id || !body.response) {
      return NextResponse.json(
        { error: "request_id and response are required" },
        { status: 400 }
      );
    }

    if (!["allow", "object"].includes(body.response)) {
      return NextResponse.json(
        { error: "response must be 'allow' or 'object'" },
        { status: 400 }
      );
    }

    const requestData = await getRequestById(body.request_id);
    if (!requestData) {
      return NextResponse.json(
        { error: "Reactivation request not found" },
        { status: 404 }
      );
    }

    if (requestData.matched_with_user_id !== user.id) {
      return NextResponse.json(
        { error: "Only the matched partner can respond" },
        { status: 403 }
      );
    }

    if (requestData.status === "partner_responded") {
      return NextResponse.json(
        { error: "You already responded to this request" },
        { status: 409 }
      );
    }

    if (!["partner_notified", "pending"].includes(requestData.status)) {
      return NextResponse.json(
        { error: `Request cannot be responded to in status '${requestData.status}'` },
        { status: 400 }
      );
    }

    const expiresAt = resolveRequestExpiry(requestData);
    if (Date.now() > expiresAt.getTime()) {
      return NextResponse.json(
        { error: "Response window has expired" },
        { status: 410 }
      );
    }

    const isAllow = body.response === "allow";

    const { error: updateError } = await supabaseService
      .from("profile_reactivation_requests")
      .update({
        partner_response_code: body.reason_code || null,
        partner_response_text: body.reason_text?.trim() || body.response,
        status: "partner_responded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestData.id);

    if (updateError) {
      console.error("Error saving partner response:", updateError);
      return NextResponse.json(
        { error: "Failed to save response" },
        { status: 500 }
      );
    }

    await insertNotification(requestData.user_id, {
      type: "profile_reactivation_partner_response",
      title: "Partner Response Received",
      message: isAllow
        ? "Your previous match partner responded positively. Admin review is now in progress."
        : "Your previous match partner objected. Admin review is now in progress.",
      data: {
        request_id: requestData.id,
        partner_response: body.response,
      },
    });

    const { data: adminUsers } = await supabaseService
      .from("accounts")
      .select("id")
      .in("role", ["admin", "superadmin"]);

    for (const admin of adminUsers || []) {
      await insertNotification(admin.id as string, {
        type: "profile_reactivation_admin_review_required",
        title: "Reactivation Review Required",
        message:
          "A partner has responded to a reactivation request. Please review and decide.",
        data: {
          request_id: requestData.id,
          partner_response: body.response,
        },
      });
    }

    const [{ data: accounts }, { data: profiles }] = await Promise.all([
      supabaseService
        .from("accounts")
        .select("id, email, display_name")
        .in("id", [requestData.user_id, requestData.matched_with_user_id]),
      supabaseService
        .from("user_profiles")
        .select("user_id, first_name")
        .in("user_id", [requestData.user_id, requestData.matched_with_user_id]),
    ]);

    const accountMap = new Map(
      ((accounts || []) as AccountRow[]).map((account) => [account.id, account])
    );
    const profileMap = new Map(
      ((profiles || []) as ProfileNameRow[]).map((profile) => [profile.user_id, profile])
    );

    const requester = accountMap.get(requestData.user_id);
    const responder = accountMap.get(requestData.matched_with_user_id);
    if (requester?.email) {
      const requesterName = getPreferredEmailRecipientName({
        profileFirstName: profileMap.get(requestData.user_id)?.first_name,
        accountDisplayName: requester.display_name,
        email: requester.email,
        defaultValue: "User",
      });
      const responderName = getPreferredEmailRecipientName({
        profileFirstName: profileMap.get(requestData.matched_with_user_id)?.first_name,
        accountDisplayName: responder?.display_name,
        email: responder?.email,
        defaultValue: "Your previous match",
      });
      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Partner Response Received</h2>
          <p>Hello ${requesterName},</p>
          <p>${responderName} has submitted a response to your reactivation request.</p>
          <p><strong>Response:</strong> ${isAllow ? "Allow" : "Object"}</p>
          <p>Your request is now pending admin review.</p>
        </div>
      `.trim();
      await sendRawHtmlEmail(
        requester.email,
        "Partner response received for your reactivation request",
        html
      );
    }

    return NextResponse.json({
      success: true,
      status: "partner_responded",
      partner_response: body.response,
    });
  } catch (error) {
    console.error("Error in POST /api/profile/reactivate/respond:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
