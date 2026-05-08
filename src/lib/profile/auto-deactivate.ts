import type { SupabaseClient } from "@supabase/supabase-js";

export type AutoDeactivateResult = {
  success: boolean;
  deactivatedUserIds: string[];
  migrationPending: boolean;
  error?: string;
};

function uniqueUserIds(userIds: string[]) {
  return Array.from(new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean)));
}

export async function autoDeactivateMatchedProfiles(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<AutoDeactivateResult> {
  const ids = uniqueUserIds(userIds);
  if (ids.length === 0) {
    return { success: true, deactivatedUserIds: [], migrationPending: false };
  }

  let migrationPending = false;

  const fullUpdate = await supabase
    .from("accounts")
    .update({
      profile_visible: false,
      calendar_enabled: false,
      profile_status: "offline_matched",
    })
    .in("id", ids);

  if (fullUpdate.error) {
    if (fullUpdate.error.code === "42703") {
      migrationPending = true;
      const fallbackUpdate = await supabase
        .from("accounts")
        .update({
          profile_visible: false,
          calendar_enabled: false,
        })
        .in("id", ids);

      if (fallbackUpdate.error && fallbackUpdate.error.code !== "42703") {
        return {
          success: false,
          deactivatedUserIds: [],
          migrationPending,
          error: fallbackUpdate.error.message,
        };
      }
    } else {
      return {
        success: false,
        deactivatedUserIds: [],
        migrationPending,
        error: fullUpdate.error.message,
      };
    }
  }

  for (const userId of ids) {
    const notificationPayloads = [
      {
        user_id: userId,
        type: "profile_auto_deactivated",
        title: "Profile Offline - Matched",
        message:
          "Your profile is now offline because your relationship agreement is fully signed.",
        data: { reason: "relationship_agreement_signed" },
      },
      {
        user_id: userId,
        notification_type: "system",
        site_enabled: true,
        push_enabled: true,
        email_enabled: true,
      },
    ];

    let inserted = false;
    for (const payload of notificationPayloads) {
      const { error } = await supabase.from("notifications").insert(payload);
      if (!error) {
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      // notification table schema differs across environments; continue silently
    }
  }

  return {
    success: true,
    deactivatedUserIds: ids,
    migrationPending,
  };
}
