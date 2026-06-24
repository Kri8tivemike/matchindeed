import type { SupabaseClient } from "@supabase/supabase-js";

export const GENDER_CHANGE_COOLDOWN_DAYS = 90;
export const GENDER_VISIBILITY_PAUSE_HOURS = 24;

export type ProfileGender = "male" | "female" | "other" | "prefer_not_to_say";

export type GenderChangeEventRow = {
  id: string;
  user_id: string;
  old_gender: string | null;
  new_gender: string;
  changed_at: string;
  pause_until: string;
  previous_profile_visible: boolean | null;
  email_sent_at?: string | null;
  email_error?: string | null;
  restored_at?: string | null;
};

export type GenderChangeStatus = {
  canChange: boolean;
  latestChangedAt: string | null;
  nextEligibleAt: string | null;
  pauseUntil: string | null;
};

export type GenderRestoreResult = {
  checked: number;
  restored: number;
  skipped: number;
  errors: number;
};

export function normalizeProfileGender(value: unknown): ProfileGender | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();

  if (
    normalized === "male" ||
    normalized === "female" ||
    normalized === "other" ||
    normalized === "prefer_not_to_say"
  ) {
    return normalized;
  }

  return null;
}

export function resolvePartnerGenderAfterGenderChange(
  newGender: string | null | undefined
) {
  const normalized = normalizeProfileGender(newGender);
  if (normalized === "male") return "female";
  if (normalized === "female") return "male";
  return null;
}

export function getGenderChangeNextEligibleAt(
  changedAt: string | Date | null | undefined
) {
  if (!changedAt) return null;
  const changedTime = changedAt instanceof Date ? changedAt.getTime() : Date.parse(changedAt);
  if (!Number.isFinite(changedTime)) return null;

  return new Date(
    changedTime + GENDER_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  );
}

export function isGenderChangeInCooldown(
  changedAt: string | Date | null | undefined,
  now: Date = new Date()
) {
  const nextEligibleAt = getGenderChangeNextEligibleAt(changedAt);
  return Boolean(nextEligibleAt && nextEligibleAt.getTime() > now.getTime());
}

export async function getGenderChangeStatus(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<GenderChangeStatus> {
  const { data, error } = await supabase
    .from("gender_change_events")
    .select("changed_at, pause_until")
    .eq("user_id", userId)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const latestChangedAt =
    typeof data?.changed_at === "string" ? data.changed_at : null;
  const nextEligibleAt = getGenderChangeNextEligibleAt(latestChangedAt);

  return {
    canChange: !nextEligibleAt || nextEligibleAt.getTime() <= now.getTime(),
    latestChangedAt,
    nextEligibleAt: nextEligibleAt?.toISOString() || null,
    pauseUntil: typeof data?.pause_until === "string" ? data.pause_until : null,
  };
}

export async function processGenderVisibilityRestores(
  supabase: SupabaseClient,
  options: { now?: Date; limit?: number } = {}
): Promise<GenderRestoreResult> {
  const now = options.now || new Date();
  const limit = options.limit || 100;
  const result: GenderRestoreResult = {
    checked: 0,
    restored: 0,
    skipped: 0,
    errors: 0,
  };

  const { data: events, error } = await supabase
    .from("gender_change_events")
    .select("id, user_id, pause_until, previous_profile_visible, restored_at")
    .is("restored_at", null)
    .lte("pause_until", now.toISOString())
    .order("pause_until", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  for (const event of (events || []) as GenderChangeEventRow[]) {
    result.checked += 1;

    try {
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .select("account_status, profile_visible, profile_status")
        .eq("id", event.user_id)
        .maybeSingle();

      if (accountError) {
        throw accountError;
      }

      const accountRow = account as {
        account_status?: string | null;
        profile_visible?: boolean | null;
        profile_status?: string | null;
      } | null;

      const shouldRestore =
        event.previous_profile_visible === true &&
        accountRow?.account_status === "active" &&
        accountRow?.profile_visible === false &&
        accountRow?.profile_status === "hidden";

      if (shouldRestore) {
        const { error: updateError } = await supabase
          .from("accounts")
          .update({
            profile_visible: true,
            profile_status: "online",
          })
          .eq("id", event.user_id)
          .eq("account_status", "active")
          .eq("profile_visible", false)
          .eq("profile_status", "hidden");

        if (updateError) {
          throw updateError;
        }

        result.restored += 1;
      } else {
        result.skipped += 1;
      }

      const { error: eventError } = await supabase
        .from("gender_change_events")
        .update({ restored_at: now.toISOString() })
        .eq("id", event.id);

      if (eventError) {
        throw eventError;
      }
    } catch (restoreError) {
      result.errors += 1;
      console.error("[gender-change] restore failed:", restoreError);
    }
  }

  return result;
}
