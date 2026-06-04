import type { SupabaseClient } from "@supabase/supabase-js";

const REFERRAL_OPERATOR_PERMISSIONS = [
  "view_referrals",
  "manage_referral_rewards",
  "review_referral_fraud",
  "manage_referral_settings",
];

type ReferralNotificationPayload = {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
};

export function referralMilestoneLabel(value: string) {
  if (value === "profile_preferences_completed") {
    return "profile and preferences completion";
  }
  if (value === "first_subscription_purchased") {
    return "first subscription purchase";
  }
  return value.replace(/_/g, " ");
}

export async function insertReferralNotification(
  supabase: SupabaseClient,
  payload: ReferralNotificationPayload
) {
  try {
    const modernInsert = await supabase.from("notifications").insert({
      user_id: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      data: payload.data || {},
    });

    if (!modernInsert.error) return;

    const fallbackInsert = await supabase.from("notifications").insert({
      user_id: payload.userId,
      notification_type: payload.type,
      site_enabled: true,
      push_enabled: true,
      email_enabled: true,
    });

    if (fallbackInsert.error) {
      console.error("[referrals/notifications] insert failed:", {
        modern: modernInsert.error.message,
        fallback: fallbackInsert.error.message,
      });
    }
  } catch (error) {
    console.error("[referrals/notifications] insert failed:", error);
  }
}

export async function getReferralOperatorIds(supabase: SupabaseClient) {
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, role")
    .in("role", ["admin", "superadmin"]);

  if (accountsError) {
    if (accountsError.code === "42P01") return [];
    throw accountsError;
  }

  const adminIds = (accounts || [])
    .filter((account) => account.role === "admin")
    .map((account) => account.id as string);
  const operatorIds = new Set(
    (accounts || [])
      .filter((account) => account.role === "superadmin")
      .map((account) => account.id as string)
  );

  if (adminIds.length === 0) return [...operatorIds];

  try {
    const [{ data: overrides }, { data: permissions }] = await Promise.all([
      supabase
        .from("account_permission_overrides")
        .select("user_id")
        .in("user_id", adminIds),
      supabase
        .from("account_permissions")
        .select("user_id, permission")
        .in("user_id", adminIds)
        .in("permission", REFERRAL_OPERATOR_PERMISSIONS),
    ]);

    const overriddenIds = new Set((overrides || []).map((row) => row.user_id as string));
    for (const adminId of adminIds) {
      if (!overriddenIds.has(adminId)) operatorIds.add(adminId);
    }
    for (const row of permissions || []) {
      operatorIds.add(row.user_id as string);
    }
  } catch (error) {
    console.error("[referrals/operators] permission lookup failed:", error);
    for (const adminId of adminIds) operatorIds.add(adminId);
  }

  return [...operatorIds];
}

export async function notifyReferralOperators(
  supabase: SupabaseClient,
  payload: Omit<ReferralNotificationPayload, "userId">
) {
  try {
    const operatorIds = await getReferralOperatorIds(supabase);
    await Promise.all(
      operatorIds.map((userId) =>
        insertReferralNotification(supabase, {
          ...payload,
          userId,
        })
      )
    );
  } catch (error) {
    console.error("[referrals/operators] notify failed:", error);
  }
}
