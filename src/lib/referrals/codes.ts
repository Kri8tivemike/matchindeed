import type { SupabaseClient } from "@supabase/supabase-js";

export type ReferralCodeRow = {
  id: string;
  user_id: string;
  code: string;
  status: "active" | "disabled";
};

function normalizeBase(value?: string | null) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 10);

  return normalized.length >= 3 ? normalized : "MATCH";
}

function randomSuffix() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export function normalizeReferralCode(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
}

export async function getOrCreateReferralCode(
  supabase: SupabaseClient,
  userId: string,
  label?: string | null
): Promise<ReferralCodeRow> {
  const { data: existing, error: existingError } = await supabase
    .from("referral_codes")
    .select("id, user_id, code, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle<ReferralCodeRow>();

  if (existingError && existingError.code !== "42P01") {
    throw existingError;
  }

  if (existing) return existing;

  const base = normalizeBase(label);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `${base}-${randomSuffix()}`;
    const { data, error } = await supabase
      .from("referral_codes")
      .insert({ user_id: userId, code })
      .select("id, user_id, code, status")
      .maybeSingle<ReferralCodeRow>();

    if (!error && data) return data;
    if (error?.code !== "23505") throw error;
  }

  throw new Error("Unable to generate a unique referral code.");
}

