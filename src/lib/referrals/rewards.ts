import type { SupabaseClient } from "@supabase/supabase-js";
import { recordCreditTransaction } from "@/lib/credits/transactions";
import {
  PRODUCT_ANALYTICS_EVENTS,
  trackProductEventSafely,
} from "@/lib/product-analytics";
import { normalizeReferralCode } from "@/lib/referrals/codes";

export type ReferralMilestone =
  | "profile_preferences_completed"
  | "first_subscription_purchased";

type ReferralRow = {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  status: string;
};

type RewardRow = {
  id: string;
  referral_id: string;
  referrer_id: string;
  referred_user_id: string;
  milestone: ReferralMilestone;
  credits_awarded: number;
  status: string;
  credit_transaction_id: string | null;
};

type CreditsRow = {
  total: number | null;
  used: number | null;
  rollover: number | null;
};

type ProgressRow = {
  profile_completed?: boolean | null;
  preferences_completed?: boolean | null;
};

const DEFAULT_REWARD_CREDITS: Record<ReferralMilestone, number> = {
  profile_preferences_completed: 2,
  first_subscription_purchased: 2,
};

const REWARD_SETTING_KEYS: Record<ReferralMilestone, string> = {
  profile_preferences_completed: "profile_preferences_completed_credits",
  first_subscription_purchased: "first_subscription_purchased_credits",
};

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function getSettingValue(
  supabase: SupabaseClient,
  key: string,
  fallback: number | boolean
) {
  const { data, error } = await supabase
    .from("referral_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle<{ value: unknown }>();

  if (error) {
    if (error.code === "42P01") return fallback;
    throw error;
  }

  return data?.value ?? fallback;
}

export async function getReferralRewardCredits(
  supabase: SupabaseClient,
  milestone: ReferralMilestone
) {
  const value = await getSettingValue(
    supabase,
    REWARD_SETTING_KEYS[milestone],
    DEFAULT_REWARD_CREDITS[milestone]
  );
  return parsePositiveInteger(value, DEFAULT_REWARD_CREDITS[milestone]);
}

export async function getReferralSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("referral_settings")
    .select("key, value, description, updated_at")
    .in("key", [
      "profile_preferences_completed_credits",
      "first_subscription_purchased_credits",
      "auto_approve_low_risk_rewards",
    ]);

  if (error) throw error;

  const map = new Map((data || []).map((row) => [row.key, row]));
  return {
    profilePreferencesCompletedCredits: parsePositiveInteger(
      map.get("profile_preferences_completed_credits")?.value,
      DEFAULT_REWARD_CREDITS.profile_preferences_completed
    ),
    firstSubscriptionPurchasedCredits: parsePositiveInteger(
      map.get("first_subscription_purchased_credits")?.value,
      DEFAULT_REWARD_CREDITS.first_subscription_purchased
    ),
    autoApproveLowRiskRewards:
      map.get("auto_approve_low_risk_rewards")?.value !== false,
  };
}

export async function updateReferralSettings(
  supabase: SupabaseClient,
  actorId: string,
  input: {
    profilePreferencesCompletedCredits: number;
    firstSubscriptionPurchasedCredits: number;
    autoApproveLowRiskRewards?: boolean;
  }
) {
  const before = await getReferralSettings(supabase);
  const profileCredits = parsePositiveInteger(
    input.profilePreferencesCompletedCredits,
    DEFAULT_REWARD_CREDITS.profile_preferences_completed
  );
  const subscriptionCredits = parsePositiveInteger(
    input.firstSubscriptionPurchasedCredits,
    DEFAULT_REWARD_CREDITS.first_subscription_purchased
  );
  const autoApprove = input.autoApproveLowRiskRewards ?? before.autoApproveLowRiskRewards;

  const rows = [
    {
      key: "profile_preferences_completed_credits",
      value: profileCredits,
      description:
        "Credits awarded when a referred user completes profile and preferences.",
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    },
    {
      key: "first_subscription_purchased_credits",
      value: subscriptionCredits,
      description:
        "Credits awarded when a referred user purchases their first subscription.",
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    },
    {
      key: "auto_approve_low_risk_rewards",
      value: autoApprove,
      description: "Automatically approve low-risk referral rewards.",
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    },
  ];

  const { error } = await supabase
    .from("referral_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) throw error;

  const after = await getReferralSettings(supabase);
  await supabase.from("referral_audit_logs").insert({
    actor_id: actorId,
    action: "referral_settings_updated",
    meta: { before, after },
  });

  return after;
}

export async function createReferralFromCode(
  supabase: SupabaseClient,
  params: {
    referredUserId: string;
    referralCode?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const code = normalizeReferralCode(params.referralCode);
  if (!code) return { created: false, reason: "missing_code" };

  const { data: codeRow, error: codeError } = await supabase
    .from("referral_codes")
    .select("id, user_id, code, status")
    .eq("code", code)
    .eq("status", "active")
    .maybeSingle<{ id: string; user_id: string; code: string; status: string }>();

  if (codeError) {
    if (codeError.code === "42P01") return { created: false, reason: "schema_missing" };
    throw codeError;
  }

  if (!codeRow) return { created: false, reason: "invalid_code" };
  if (codeRow.user_id === params.referredUserId) {
    await supabase.from("referral_fraud_checks").insert({
      check_type: "self_referral",
      risk_level: "blocked",
      reason: "Referral code owner cannot refer their own account.",
      metadata: { referred_user_id: params.referredUserId, referral_code: code },
    });
    return { created: false, reason: "self_referral" };
  }

  const { data, error } = await supabase
    .from("referrals")
    .insert({
      referrer_id: codeRow.user_id,
      referred_user_id: params.referredUserId,
      referral_code_id: codeRow.id,
      referral_code: codeRow.code,
      metadata: params.metadata || {},
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    if (error.code === "23505") return { created: false, reason: "already_referred" };
    throw error;
  }

  await supabase.from("referral_audit_logs").insert({
    referral_id: data?.id || null,
    action: "referral_created",
    meta: { referral_code: codeRow.code },
  });

  return { created: true, referralId: data?.id || null };
}

async function addReferralCredits(
  supabase: SupabaseClient,
  reward: RewardRow,
  actorId?: string | null
) {
  if (reward.credit_transaction_id) return reward.credit_transaction_id;

  const { data: currentCredits, error: creditsError } = await supabase
    .from("credits")
    .select("total, used, rollover")
    .eq("user_id", reward.referrer_id)
    .maybeSingle<CreditsRow>();

  if (creditsError && creditsError.code !== "PGRST116") throw creditsError;

  const totalBefore = currentCredits?.total || 0;
  const { error: updateError } = await supabase.from("credits").upsert(
    {
      user_id: reward.referrer_id,
      total: totalBefore + reward.credits_awarded,
      used: currentCredits?.used || 0,
      rollover: currentCredits?.rollover || 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (updateError) throw updateError;

  const transactionId = await recordCreditTransaction(supabase, {
    userId: reward.referrer_id,
    amount: reward.credits_awarded,
    actionType: "referral_reward",
    description: `Referral reward: ${reward.credits_awarded} credit(s) for ${reward.milestone.replace(/_/g, " ")}.`,
  });

  const { error: rewardUpdateError } = await supabase
    .from("referral_rewards")
    .update({
      status: "approved",
      approved_by: actorId || null,
      approved_at: new Date().toISOString(),
      credit_transaction_id: transactionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reward.id);

  if (rewardUpdateError) throw rewardUpdateError;

  await supabase.from("referral_audit_logs").insert({
    actor_id: actorId || null,
    referral_id: reward.referral_id,
    reward_id: reward.id,
    action: "referral_reward_approved",
    meta: {
      milestone: reward.milestone,
      credits_awarded: reward.credits_awarded,
      credit_transaction_id: transactionId,
    },
  });

  await trackProductEventSafely(
    reward.referrer_id,
    PRODUCT_ANALYTICS_EVENTS.REFERRAL_REWARD_EARNED,
    {
      referral_id: reward.referral_id,
      reward_id: reward.id,
      referred_user_id: reward.referred_user_id,
      milestone: reward.milestone,
      credits_awarded: reward.credits_awarded,
      credit_transaction_id: transactionId,
    }
  );

  return transactionId;
}

async function createRewardForMilestone(
  supabase: SupabaseClient,
  userId: string,
  milestone: ReferralMilestone,
  metadata?: Record<string, unknown>
) {
  const { data: referral, error: referralError } = await supabase
    .from("referrals")
    .select("id, referrer_id, referred_user_id, status")
    .eq("referred_user_id", userId)
    .eq("status", "active")
    .maybeSingle<ReferralRow>();

  if (referralError) {
    if (referralError.code === "42P01") return { created: false, reason: "schema_missing" };
    throw referralError;
  }
  if (!referral) return { created: false, reason: "no_referral" };

  const credits = await getReferralRewardCredits(supabase, milestone);
  const autoApprove = Boolean(
    await getSettingValue(supabase, "auto_approve_low_risk_rewards", true)
  );

  const { data: reward, error: insertError } = await supabase
    .from("referral_rewards")
    .insert({
      referral_id: referral.id,
      referrer_id: referral.referrer_id,
      referred_user_id: referral.referred_user_id,
      milestone,
      credits_awarded: credits,
      status: autoApprove ? "pending_review" : "pending_review",
      risk_level: "low",
      risk_reasons: [],
      metadata: metadata || {},
    })
    .select(
      "id, referral_id, referrer_id, referred_user_id, milestone, credits_awarded, status, credit_transaction_id"
    )
    .maybeSingle<RewardRow>();

  if (insertError) {
    if (insertError.code === "23505") return { created: false, reason: "already_rewarded" };
    throw insertError;
  }
  if (!reward) return { created: false, reason: "insert_failed" };

  if (autoApprove) {
    await addReferralCredits(supabase, reward, null);
  }

  return { created: true, rewardId: reward.id, autoApproved: autoApprove };
}

export async function evaluateProfilePreferencesReferralReward(
  supabase: SupabaseClient,
  userId: string
) {
  const [{ data: progress }, { data: profile }, { data: preferences }] =
    await Promise.all([
      supabase
        .from("user_progress")
        .select("profile_completed, preferences_completed")
        .eq("user_id", userId)
        .maybeSingle<ProgressRow>(),
      supabase
        .from("user_profiles")
        .select("profile_completed, preferences_completed")
        .eq("user_id", userId)
        .maybeSingle<ProgressRow>(),
      supabase
        .from("user_preferences")
        .select("preferences_completed")
        .eq("user_id", userId)
        .maybeSingle<ProgressRow>(),
    ]);

  const profileCompleted = Boolean(
    progress?.profile_completed || profile?.profile_completed
  );
  const preferencesCompleted = Boolean(
    progress?.preferences_completed ||
      preferences?.preferences_completed ||
      profile?.preferences_completed
  );

  if (!profileCompleted || !preferencesCompleted) {
    return { created: false, reason: "progress_incomplete" };
  }

  return createRewardForMilestone(
    supabase,
    userId,
    "profile_preferences_completed",
    { trigger: "profile_progress" }
  );
}

export async function evaluateFirstSubscriptionReferralReward(
  supabase: SupabaseClient,
  userId: string,
  metadata?: Record<string, unknown>
) {
  return createRewardForMilestone(
    supabase,
    userId,
    "first_subscription_purchased",
    { trigger: "subscription_checkout", ...metadata }
  );
}

export async function approveReferralReward(
  supabase: SupabaseClient,
  rewardId: string,
  actorId: string
) {
  const { data: reward, error } = await supabase
    .from("referral_rewards")
    .select(
      "id, referral_id, referrer_id, referred_user_id, milestone, credits_awarded, status, credit_transaction_id"
    )
    .eq("id", rewardId)
    .maybeSingle<RewardRow>();

  if (error) throw error;
  if (!reward) throw new Error("Referral reward not found.");
  if (reward.status === "rejected" || reward.status === "reversed") {
    throw new Error("Rejected or reversed rewards cannot be approved.");
  }

  await addReferralCredits(supabase, reward, actorId);
  return { success: true };
}

export async function updateReferralRewardStatus(
  supabase: SupabaseClient,
  rewardId: string,
  actorId: string,
  status: "held" | "rejected"
) {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "rejected") {
    update.rejected_by = actorId;
    update.rejected_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("referral_rewards")
    .update(update)
    .eq("id", rewardId)
    .is("credit_transaction_id", null)
    .select("id, referral_id, milestone, credits_awarded")
    .maybeSingle<{
      id: string;
      referral_id: string;
      milestone: string;
      credits_awarded: number;
    }>();

  if (error) throw error;
  if (!data) {
    throw new Error("Reward not found or already credited.");
  }

  await supabase.from("referral_audit_logs").insert({
    actor_id: actorId,
    referral_id: data.referral_id,
    reward_id: data.id,
    action: `referral_reward_${status}`,
    meta: {
      milestone: data.milestone,
      credits_awarded: data.credits_awarded,
    },
  });

  return { success: true };
}
