import type { SupabaseClient } from "@supabase/supabase-js";
import { getAvailableCredits } from "@/lib/credits/actions";

export const CREDIT_LOCKED_PROFILE_STATUS = "offline_credits_locked";

type AccountVisibilityRow = {
  account_status?: string | null;
  profile_visible?: boolean | null;
  calendar_enabled?: boolean | null;
  profile_status?: string | null;
};

export async function restoreCreditLockedProfileIfEligible(
  supabase: SupabaseClient,
  userId: string
) {
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("account_status, profile_visible, calendar_enabled, profile_status")
    .eq("id", userId)
    .maybeSingle<AccountVisibilityRow>();

  if (accountError) {
    throw accountError;
  }

  const status = String(account?.account_status || "active").toLowerCase();
  const profileStatus = String(account?.profile_status || "").toLowerCase();

  if (status !== "active") {
    return { restored: false, reason: "account_not_active" as const };
  }

  if (profileStatus !== CREDIT_LOCKED_PROFILE_STATUS) {
    return { restored: false, reason: "not_credit_locked" as const };
  }

  const { data: credits, error: creditsError } = await supabase
    .from("credits")
    .select("total, used, rollover")
    .eq("user_id", userId)
    .maybeSingle<{
      total: number | null;
      used: number | null;
      rollover: number | null;
    }>();

  if (creditsError && creditsError.code !== "PGRST116") {
    throw creditsError;
  }

  const availableCredits = getAvailableCredits(
    credits
      ? {
          total: credits.total ?? 0,
          used: credits.used ?? 0,
          rollover: credits.rollover ?? 0,
        }
      : null
  );
  if (availableCredits <= 0) {
    return { restored: false, reason: "no_available_credits" as const };
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("accounts")
    .update({
      profile_visible: true,
      calendar_enabled: true,
      profile_status: "online",
      updated_at: nowIso,
    })
    .eq("id", userId);

  if (!updateError) {
    return { restored: true, reason: "restored" as const };
  }

  if (updateError.code === "42703") {
    const { error: fallbackError } = await supabase
      .from("accounts")
      .update({
        profile_visible: true,
        calendar_enabled: true,
      })
      .eq("id", userId);

    if (!fallbackError) {
      return { restored: true, reason: "restored" as const };
    }

    throw fallbackError;
  }

  throw updateError;
}
