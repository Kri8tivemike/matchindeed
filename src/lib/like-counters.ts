import { supabase } from "@/lib/supabase";
import { getBlockedUserIds } from "@/lib/blocked-users";

type ActivityType = "like" | "wink" | "interested";

export type VisibleReceivedActivity = {
  id: string;
  user_id: string;
  activity_type: ActivityType;
  created_at: string;
};

type AccountRow = {
  id: string;
  account_status: string | null;
  profile_visible: boolean | null;
};

export async function getVisibleReceivedActivities(
  userId: string,
  limit?: number
): Promise<VisibleReceivedActivity[]> {
  let query = supabase
    .from("user_activities")
    .select("id, user_id, activity_type, created_at")
    .eq("target_user_id", userId)
    .in("activity_type", ["like", "wink", "interested"])
    .order("created_at", { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  const blockedIds = await getBlockedUserIds();
  const activityRows = data as VisibleReceivedActivity[];
  const candidateSenderIds = Array.from(
    new Set(
      activityRows
        .map((row) => row.user_id)
        .filter((senderId) => !blockedIds.has(senderId))
    )
  );

  if (candidateSenderIds.length === 0) {
    return [];
  }

  const { data: accountRows, error: accountsError } = await supabase
    .from("accounts")
    .select("id, account_status, profile_visible")
    .in("id", candidateSenderIds);

  if (accountsError || !accountRows) {
    return activityRows.filter((row) => !blockedIds.has(row.user_id));
  }

  const visibleUserIds = new Set(
    (accountRows as AccountRow[])
      .filter((row) => (row.account_status || "active") === "active" && row.profile_visible !== false)
      .map((row) => row.id)
  );

  return activityRows.filter(
    (row) => !blockedIds.has(row.user_id) && visibleUserIds.has(row.user_id)
  );
}

export async function getVisibleReceivedActivityCount(userId: string): Promise<number> {
  const rows = await getVisibleReceivedActivities(userId);
  return rows.length;
}
