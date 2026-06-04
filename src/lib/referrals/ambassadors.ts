import type { SupabaseClient } from "@supabase/supabase-js";

export type ReferralAmbassadorStatus = "active" | "paused" | "ended";

export type ReferralAmbassadorRow = {
  id: string;
  user_id: string;
  status: ReferralAmbassadorStatus;
  contract_target_referrals: number | null;
  contract_target_subscriptions: number | null;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type AccountRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  tier: string | null;
};

type ReferralRow = {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  created_at: string;
};

type RewardRow = {
  id: string;
  referrer_id: string;
  milestone: string;
  credits_awarded: number | null;
  status: string;
};

type CodeRow = {
  user_id: string;
  code: string;
  status: string;
};

function percent(value: number, target: number) {
  if (target <= 0) return value > 0 ? 100 : 0;
  return Math.min(100, Math.round((value / target) * 100));
}

function countByReferrer<T extends { referrer_id: string }>(
  rows: T[],
  key: keyof T,
  value?: T[keyof T]
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (value !== undefined && row[key] !== value) continue;
    counts.set(row.referrer_id, (counts.get(row.referrer_id) || 0) + 1);
  }
  return counts;
}

export async function listReferralAmbassadors(supabase: SupabaseClient) {
  const { data: ambassadors, error } = await supabase
    .from("referral_ambassadors")
    .select(
      "id, user_id, status, contract_target_referrals, contract_target_subscriptions, starts_at, ends_at, notes, created_by, updated_by, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") {
      return {
        ambassadors: [],
        summary: {
          total: 0,
          active: 0,
          totalReferrals: 0,
          totalSubscriptionConversions: 0,
          totalCreditsAwarded: 0,
        },
      };
    }
    throw error;
  }

  const rows = (ambassadors || []) as ReferralAmbassadorRow[];
  const userIds = rows.map((row) => row.user_id);

  const [
    { data: accounts },
    { data: referralCodes },
    { data: referrals },
    { data: rewards },
  ] = await Promise.all([
    userIds.length
      ? supabase
          .from("accounts")
          .select("id, email, display_name, tier")
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase
          .from("referral_codes")
          .select("user_id, code, status")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase
          .from("referrals")
          .select("id, referrer_id, referred_user_id, created_at")
          .in("referrer_id", userIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase
          .from("referral_rewards")
          .select("id, referrer_id, milestone, credits_awarded, status")
          .in("referrer_id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const accountMap = new Map(
    ((accounts || []) as AccountRow[]).map((account) => [account.id, account])
  );
  const activeCodeMap = new Map(
    ((referralCodes || []) as CodeRow[])
      .filter((code) => code.status === "active")
      .map((code) => [code.user_id, code.code])
  );
  const referralRows = (referrals || []) as ReferralRow[];
  const rewardRows = (rewards || []) as RewardRow[];
  const approvedRewards = rewardRows.filter((reward) => reward.status === "approved");
  const referralCounts = countByReferrer(referralRows, "id");
  const profileRewardCounts = countByReferrer(
    approvedRewards,
    "milestone",
    "profile_preferences_completed"
  );
  const subscriptionRewardCounts = countByReferrer(
    approvedRewards,
    "milestone",
    "first_subscription_purchased"
  );
  const creditsByReferrer = new Map<string, number>();

  for (const reward of approvedRewards) {
    creditsByReferrer.set(
      reward.referrer_id,
      (creditsByReferrer.get(reward.referrer_id) || 0) +
        Number(reward.credits_awarded || 0)
    );
  }

  const ambassadorPayload = rows.map((ambassador) => {
    const referralsCount = referralCounts.get(ambassador.user_id) || 0;
    const subscriptionConversions =
      subscriptionRewardCounts.get(ambassador.user_id) || 0;
    const targetReferrals = Number(ambassador.contract_target_referrals || 0);
    const targetSubscriptions = Number(
      ambassador.contract_target_subscriptions || 0
    );

    return {
      ...ambassador,
      account: accountMap.get(ambassador.user_id) || null,
      referral_code: activeCodeMap.get(ambassador.user_id) || null,
      performance: {
        referrals: referralsCount,
        profile_rewards: profileRewardCounts.get(ambassador.user_id) || 0,
        subscription_conversions: subscriptionConversions,
        approved_credits: creditsByReferrer.get(ambassador.user_id) || 0,
        referral_target_progress: percent(referralsCount, targetReferrals),
        subscription_target_progress: percent(
          subscriptionConversions,
          targetSubscriptions
        ),
      },
    };
  });

  return {
    ambassadors: ambassadorPayload,
    summary: {
      total: ambassadorPayload.length,
      active: ambassadorPayload.filter((ambassador) => ambassador.status === "active")
        .length,
      totalReferrals: ambassadorPayload.reduce(
        (sum, ambassador) => sum + ambassador.performance.referrals,
        0
      ),
      totalSubscriptionConversions: ambassadorPayload.reduce(
        (sum, ambassador) =>
          sum + ambassador.performance.subscription_conversions,
        0
      ),
      totalCreditsAwarded: ambassadorPayload.reduce(
        (sum, ambassador) => sum + ambassador.performance.approved_credits,
        0
      ),
    },
  };
}

export function parseAmbassadorTarget(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function normalizeAmbassadorStatus(value: unknown): ReferralAmbassadorStatus {
  return value === "paused" || value === "ended" ? value : "active";
}
