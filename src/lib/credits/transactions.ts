import type { SupabaseClient } from "@supabase/supabase-js";

type CreditTransactionInput = {
  userId: string;
  amount: number;
  actionType: string;
  description?: string | null;
};

const SCHEMA_MISSING_ERROR_CODES = new Set(["42P01", "42703"]);

export async function recordCreditTransaction(
  supabase: SupabaseClient,
  input: CreditTransactionInput
) {
  const { data, error } = await supabase
    .from("credit_transactions")
    .insert({
      user_id: input.userId,
      amount: input.amount,
      action_type: input.actionType,
      description: input.description || null,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!error) {
    return data?.id || null;
  }

  if (SCHEMA_MISSING_ERROR_CODES.has(error.code || "")) {
    console.warn(
      "[credits] credit_transactions table/columns missing; skipping audit log insert."
    );
    return null;
  }

  console.error("[credits] Failed to write credit transaction audit log:", error);
  return null;
}
