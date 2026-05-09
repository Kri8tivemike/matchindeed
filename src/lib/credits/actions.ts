import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTier } from "@/lib/credits/config";
import { recordCreditTransaction } from "@/lib/credits/transactions";

type MeetingType = "group" | "one_on_one";

type CreditsRow = {
  total: number | null;
  used: number | null;
  rollover: number | null;
};

type ConsumeResult = {
  success: boolean;
  available: number;
  required: number;
};

type CreditMutationOptions = {
  actionType?: string;
  description?: string;
};

const ACTION_COSTS = {
  send_request: {
    basic: 6,
    standard: 6,
    premium: 10,
    vip: 0,
  },
  accept_request: {
    basic: 2,
    standard: 2,
    premium: 6,
    vip: 0,
  },
  join_group: {
    basic: 4,
    standard: 4,
    premium: 8,
    vip: 0,
  },
  join_one_on_one: {
    basic: 0,
    standard: 0,
    premium: 12,
    vip: 0,
  },
  boost: {
    basic: 0,
    standard: 0,
    premium: 15,
    vip: 0,
  },
  multibooking: {
    basic: 0,
    standard: 0,
    premium: 25,
    vip: 0,
  },
} as const;

function normalizeMeetingType(rawType?: string | null): MeetingType {
  return rawType === "group" ? "group" : "one_on_one";
}

export function getAvailableCredits(credits: CreditsRow | null | undefined) {
  const total = credits?.total || 0;
  const used = credits?.used || 0;
  const rollover = credits?.rollover || 0;
  return Math.max(0, total - used + rollover);
}

export function getSendRequestCreditCost(
  rawTier?: string | null,
  options?: { extraCharge?: boolean }
) {
  const tier = normalizeTier(rawTier);
  const base = ACTION_COSTS.send_request[tier];
  return base + (options?.extraCharge ? 2 : 0);
}

export function getAcceptRequestCreditCost(rawTier?: string | null) {
  const tier = normalizeTier(rawTier);
  return ACTION_COSTS.accept_request[tier];
}

export function getJoinMeetingCreditCost(rawTier?: string | null, rawType?: string | null) {
  const tier = normalizeTier(rawTier);
  const type = normalizeMeetingType(rawType);
  return type === "group"
    ? ACTION_COSTS.join_group[tier]
    : ACTION_COSTS.join_one_on_one[tier];
}

export async function consumeCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  options?: CreditMutationOptions
): Promise<ConsumeResult> {
  if (amount <= 0) {
    return { success: true, available: Number.POSITIVE_INFINITY, required: 0 };
  }

  // Use atomic RPC to avoid race conditions (FOR UPDATE row lock in PostgreSQL).
  // Falls back to the legacy read-modify-write path if the RPC is unavailable.
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "consume_credits_atomic",
    {
      p_user_id: userId,
      p_amount: amount,
      p_action_type: options?.actionType || "credit_deduction",
      p_description: options?.description || `Consumed ${amount} credit(s).`,
    }
  );

  if (!rpcError) {
    const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    if (!row) throw new Error("consume_credits_atomic returned no result");
    return {
      success: Boolean(row.success),
      available: Number(row.available_before),
      required: amount,
    };
  }

  // ── Legacy fallback (non-atomic) ──────────────────────────
  console.warn("[consumeCredits] RPC unavailable, using fallback:", rpcError.message);

  const { data: credits, error } = await supabase
    .from("credits")
    .select("total, used, rollover")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  const row = (credits || null) as CreditsRow | null;
  const available = getAvailableCredits(row);
  if (available < amount) {
    return { success: false, available, required: amount };
  }

  const used = row?.used || 0;
  const total = row?.total || 0;
  const rollover = row?.rollover || 0;

  const { error: updateError } = await supabase.from("credits").upsert(
    {
      user_id: userId,
      total,
      used: used + amount,
      rollover,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (updateError) {
    throw updateError;
  }

  await recordCreditTransaction(supabase, {
    userId,
    amount: -amount,
    actionType: options?.actionType || "credit_deduction",
    description: options?.description || `Consumed ${amount} credit(s).`,
  });

  return { success: true, available, required: amount };
}

export async function refundConsumedCredits(
  supabase: SupabaseClient,
  userId: string,
  amount: number,
  options?: CreditMutationOptions
) {
  if (amount <= 0) return;

  // Use atomic RPC to avoid race conditions (FOR UPDATE row lock in PostgreSQL).
  // Falls back to the legacy read-modify-write path if the RPC is unavailable.
  const { error: rpcError } = await supabase.rpc("refund_credits_atomic", {
    p_user_id: userId,
    p_amount: amount,
    p_action_type: options?.actionType || "credit_refund",
    p_description: options?.description || `Refunded ${amount} credit(s).`,
  });

  if (!rpcError) return;

  // ── Legacy fallback (non-atomic) ──────────────────────────
  console.warn("[refundConsumedCredits] RPC unavailable, using fallback:", rpcError.message);

  const { data: credits, error } = await supabase
    .from("credits")
    .select("total, used, rollover")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  const used = credits?.used || 0;
  const total = credits?.total || 0;
  const rollover = credits?.rollover || 0;

  const { error: updateError } = await supabase.from("credits").upsert(
    {
      user_id: userId,
      total,
      used: Math.max(0, used - amount),
      rollover,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (updateError) {
    throw updateError;
  }

  await recordCreditTransaction(supabase, {
    userId,
    amount,
    actionType: options?.actionType || "credit_refund",
    description: options?.description || `Refunded ${amount} credit(s).`,
  });
}
