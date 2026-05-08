import type { SupabaseClient } from "@supabase/supabase-js";

export async function reactivateUserProfile(
  supabase: SupabaseClient,
  userId: string
) {
  const fullUpdate = await supabase
    .from("accounts")
    .update({
      account_status: "active",
      profile_visible: true,
      calendar_enabled: true,
      profile_status: "online",
    })
    .eq("id", userId);

  if (!fullUpdate.error) {
    return;
  }

  if (fullUpdate.error.code === "42703") {
    const fallbackUpdate = await supabase
      .from("accounts")
      .update({
        account_status: "active",
      })
      .eq("id", userId);

    if (!fallbackUpdate.error) {
      return;
    }

    throw fallbackUpdate.error;
  }

  throw fullUpdate.error;
}
