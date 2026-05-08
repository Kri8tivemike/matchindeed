import { createClient } from "@supabase/supabase-js";
import type { TierId } from "./config";
import {
  getAccountState,
  resolveOwnInteractionBlockMessage,
} from "@/lib/account-interactions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type MembershipRow = {
  tier: string | null;
  status: string;
  expires_at: string | null;
};

export type AccessResult = {
  allowed: boolean;
  message?: string;
  tier?: TierId;
};

const UNRESOLVED_TIER_MESSAGE =
  "Unable to resolve your subscription tier. Please contact support.";

function normalizeMembershipTier(rawTier: string | null): TierId | null {
  switch ((rawTier || "").toLowerCase()) {
    case "basic":
    case "standard":
    case "premium":
    case "vip":
      return rawTier!.toLowerCase() as TierId;
    default:
      return null;
  }
}

export function isMembershipActive(membership: MembershipRow | null): boolean {
  if (!membership) return false;
  if (membership.status !== "active") return false;
  if (!membership.expires_at) return true;
  return new Date(membership.expires_at).getTime() > Date.now();
}

async function getLatestMembership(userId: string): Promise<MembershipRow | null> {
  const { data } = await supabase
    .from("memberships")
    .select("tier, status, expires_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as MembershipRow | null) || null;
}

export async function hasUnlockedWalletAccess(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", userId)
    .gt("price_cents", 0)
    .limit(1)
    .maybeSingle();

  return Boolean(data?.id);
}

async function resolveActiveMembershipAccess(
  userId: string,
  noPlanMessage: string
): Promise<AccessResult> {
  const account = await getAccountState(supabase, userId);
  const accountBlockedMessage = resolveOwnInteractionBlockMessage(account);
  if (accountBlockedMessage) {
    return {
      allowed: false,
      message: accountBlockedMessage,
    };
  }

  const membership = await getLatestMembership(userId);
  if (!membership || !isMembershipActive(membership)) {
    return {
      allowed: false,
      message: noPlanMessage,
    };
  }

  if (!membership.tier) {
    return {
      allowed: false,
      message: UNRESOLVED_TIER_MESSAGE,
    };
  }

  const tier = normalizeMembershipTier(membership.tier);
  if (!tier) {
    return {
      allowed: false,
      message: UNRESOLVED_TIER_MESSAGE,
    };
  }

  return { allowed: true, tier };
}

export async function canAccessMeetings(userId: string): Promise<AccessResult> {
  return resolveActiveMembershipAccess(
    userId,
    "No active subscription plan found. Please subscribe to a plan to schedule meetings."
  );
}

export async function canAccessMatches(userId: string): Promise<AccessResult> {
  return resolveActiveMembershipAccess(
    userId,
    "No active subscription plan found. Please subscribe to a plan to access matches."
  );
}

export async function canAccessPaidFeatures(
  userId: string
): Promise<AccessResult> {
  return resolveActiveMembershipAccess(
    userId,
    "An active subscription plan is required to access paid features, including wallet top-ups and extra credits."
  );
}
