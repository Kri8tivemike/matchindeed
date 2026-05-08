export type AccountStateRow = {
  id: string;
  account_status: string | null;
  profile_visible?: boolean | null;
  calendar_enabled?: boolean | null;
  profile_status?: string | null;
  email?: string | null;
  display_name?: string | null;
};

export const DEACTIVATED_ACCOUNT_MESSAGE =
  "Your MatchIndeed account is currently deactivated. Reactivate your account to book dates, send messages, and interact with other members.";

export const INACTIVE_ACCOUNT_MESSAGE =
  "Your MatchIndeed account is not active right now. Please contact support if you need help restoring access.";

export const TARGET_ACCOUNT_INACTIVE_MESSAGE =
  "This member is not available for interaction right now. Please choose another available member.";

export async function getAccountState(
  supabase: any,
  userId: string
): Promise<AccountStateRow | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, account_status, profile_visible, calendar_enabled, profile_status, email, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

export function resolveOwnInteractionBlockMessage(account: AccountStateRow | null) {
  const status = String(account?.account_status || "active").toLowerCase();

  if (status === "active") {
    return null;
  }

  if (status === "deactivated") {
    return DEACTIVATED_ACCOUNT_MESSAGE;
  }

  return INACTIVE_ACCOUNT_MESSAGE;
}

export function isTargetInteractionUnavailable(account: AccountStateRow | null) {
  const status = String(account?.account_status || "active").toLowerCase();
  return status !== "active";
}
