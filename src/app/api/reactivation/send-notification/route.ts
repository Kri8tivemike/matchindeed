import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendRawHtmlEmail } from "@/lib/email";
import {
  reactivationApprovedPartnerNotificationTemplate,
  reactivationApprovedTemplate,
  reactivationDeniedTemplate,
} from "@/lib/email/reactivation-templates";
import { getPreferredEmailRecipientName } from "@/lib/email-recipient-name";
import { reactivateUserProfile } from "@/lib/profile/reactivation";

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AccountRoleRow = {
  role: string | null;
};

type ReactivationRequestRow = {
  id: string;
  user_id: string;
  matched_with_user_id: string;
  reason_text: string | null;
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

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: actingAccount } = await supabaseService
      .from("accounts")
      .select("role")
      .eq("id", authUser.id)
      .single();

    const actorRole = (actingAccount as AccountRoleRow | null)?.role;
    const isAdmin = actorRole && ["admin", "superadmin"].includes(actorRole);

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only admins can send reactivation decision notifications" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      requestId?: string;
      userId?: string;
      decision?: "approved" | "rejected";
      notes?: string;
    };

    if (!body.requestId || !body.decision) {
      return NextResponse.json(
        { error: "requestId and decision are required" },
        { status: 400 }
      );
    }

    if (!["approved", "rejected"].includes(body.decision)) {
      return NextResponse.json(
        { error: "decision must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    const { data: requestRow, error: requestError } = await supabaseService
      .from("profile_reactivation_requests")
      .select("id, user_id, matched_with_user_id, reason_text")
      .eq("id", body.requestId)
      .single();

    if (requestError || !requestRow) {
      return NextResponse.json({ error: "Reactivation request not found" }, { status: 404 });
    }

    const requestData = requestRow as ReactivationRequestRow;
    if (body.userId && body.userId !== requestData.user_id) {
      return NextResponse.json(
        { error: "requestId and userId do not match" },
        { status: 400 }
      );
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

    const accountMap = new Map(((accounts || []) as AccountRow[]).map((a) => [a.id, a]));
    const profileMap = new Map(
      ((profiles || []) as ProfileNameRow[]).map((profile) => [profile.user_id, profile])
    );

    const userAccount = accountMap.get(requestData.user_id);
    const partnerAccount = accountMap.get(requestData.matched_with_user_id);

    const userName = getPreferredEmailRecipientName({
      profileFirstName: profileMap.get(requestData.user_id)?.first_name,
      accountDisplayName: userAccount?.display_name,
      email: userAccount?.email,
      defaultValue: "User",
    });
    const partnerName = getPreferredEmailRecipientName({
      profileFirstName: profileMap.get(requestData.matched_with_user_id)?.first_name,
      accountDisplayName: partnerAccount?.display_name,
      email: partnerAccount?.email,
      defaultValue: "Your Match",
    });

    if (body.decision === "approved") {
      await reactivateUserProfile(supabaseService, requestData.user_id);

      if (userAccount?.email) {
        const html = reactivationApprovedTemplate(userName, partnerName, body.notes?.trim() || undefined);
        await sendRawHtmlEmail(userAccount.email, "Your Reactivation Request Was Approved", html);
      }

      if (partnerAccount?.email) {
        const partnerHtml = reactivationApprovedPartnerNotificationTemplate(partnerName, userName);
        await sendRawHtmlEmail(
          partnerAccount.email,
          "Match Reactivation Approved",
          partnerHtml
        );
      }

      await supabaseService.from("notifications").insert([
        {
          user_id: requestData.user_id,
          type: "profile_reactivation_approved",
          title: "Reactivation Approved",
          message: "Your profile reactivation request was approved.",
          data: { request_id: requestData.id, decision: "approved" },
        },
        {
          user_id: requestData.matched_with_user_id,
          type: "profile_reactivation_match_approved",
          title: "Match Reactivated",
          message: `${userName}'s reactivation request was approved.`,
          data: { request_id: requestData.id, decision: "approved" },
        },
      ]);
    } else {
      if (userAccount?.email) {
        const html = reactivationDeniedTemplate(userName, body.notes?.trim() || undefined);
        await sendRawHtmlEmail(userAccount.email, "Reactivation Request Decision", html);
      }

      await supabaseService.from("notifications").insert({
        user_id: requestData.user_id,
        type: "profile_reactivation_rejected",
        title: "Reactivation Not Approved",
        message: "Your profile reactivation request was not approved at this time.",
        data: { request_id: requestData.id, decision: "rejected" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/reactivation/send-notification:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
