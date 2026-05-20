import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendProfileViewEmail } from "@/lib/email";
import { sendPushNotificationIfAllowed } from "@/lib/onesignal";
import { sendNoActiveVideoSlotAlert } from "@/lib/alerts/scheduled-alerts";
import {
  getAccountState,
  isTargetInteractionUnavailable,
  resolveOwnInteractionBlockMessage,
  TARGET_ACCOUNT_INACTIVE_MESSAGE,
} from "@/lib/account-interactions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Identity = {
  userId: string;
  firstName: string;
  email: string | null;
};

const PROFILE_VIEW_ACTIVITY_TYPE = "profile_view";

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

async function getIdentity(userId: string): Promise<Identity | null> {
  const [{ data: account }, { data: profile }] = await Promise.all([
    supabase
      .from("accounts")
      .select("email, display_name")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const email = account?.email || null;
  const firstName = normalizeName(
    profile?.first_name || account?.display_name || email?.split("@")[0]
  );

  return { userId, firstName, email };
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

async function wasProfileViewRecentlyLogged(viewerId: string, targetUserId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("user_activities")
    .select("id")
    .eq("user_id", viewerId)
    .eq("target_user_id", targetUserId)
    .eq("activity_type", PROFILE_VIEW_ACTIVITY_TYPE)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error checking recent profile-view activity:", error);
    return false;
  }

  return (data || []).length > 0;
}

async function recordProfileViewActivity(viewerId: string, targetUserId: string) {
  const { error } = await supabase.from("user_activities").insert({
    user_id: viewerId,
    target_user_id: targetUserId,
    activity_type: PROFILE_VIEW_ACTIVITY_TYPE,
  });

  if (error) {
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const targetUserId =
      typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";

    if (!targetUserId) {
      return NextResponse.json(
        { error: "target_user_id is required" },
        { status: 400 }
      );
    }

    if (targetUserId === user.id) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const [viewerAccount, targetAccount] = await Promise.all([
      getAccountState(supabase, user.id),
      getAccountState(supabase, targetUserId),
    ]);

    const viewerBlockedMessage = resolveOwnInteractionBlockMessage(viewerAccount);
    if (viewerBlockedMessage) {
      return NextResponse.json(
        { error: viewerBlockedMessage, code: "account_deactivated" },
        { status: 403 }
      );
    }

    if (isTargetInteractionUnavailable(targetAccount)) {
      return NextResponse.json(
        { error: TARGET_ACCOUNT_INACTIVE_MESSAGE, code: "target_unavailable" },
        { status: 403 }
      );
    }

    if (await wasProfileViewRecentlyLogged(user.id, targetUserId)) {
      return NextResponse.json({ success: true, deduped: true });
    }

    const [viewerIdentity, targetIdentity] = await Promise.all([
      getIdentity(user.id),
      getIdentity(targetUserId),
    ]);

    if (!viewerIdentity || !targetIdentity) {
      return NextResponse.json(
        { error: "Unable to load viewer identities" },
        { status: 404 }
      );
    }

    await recordProfileViewActivity(user.id, targetUserId);

    await insertNotification(targetUserId, {
      type: "profile_view",
      title: "Profile viewed",
      message: `${viewerIdentity.firstName} viewed your profile.`,
      data: { from_user_id: user.id },
    });

    await sendPushNotificationIfAllowed({
      userId: targetUserId,
      type: "profile_view",
      title: `${viewerIdentity.firstName} viewed your profile`,
      message: "See who opened your full profile on MatchIndeed.",
      url: "/dashboard/likes?tab=views",
      data: { from_user_id: user.id },
    });

    if (targetIdentity.email) {
      await sendProfileViewEmail(
        targetIdentity.email,
        {
          recipientName: targetIdentity.firstName,
          partnerName: viewerIdentity.firstName,
        },
        targetUserId
      );
    }

    await sendNoActiveVideoSlotAlert({
      supabase,
      userId: targetUserId,
      actorUserId: user.id,
      actorName: viewerIdentity.firstName,
      triggerType: "profile_view",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/profile/view:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
