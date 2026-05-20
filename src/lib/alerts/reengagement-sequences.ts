import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleAlert, type ScheduledAlertType } from "./scheduled-alerts";

type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  created_at: string;
};

type MatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at?: string | null;
};

type AccountRow = {
  id: string;
  account_status: string | null;
  profile_visible: boolean | null;
  last_active_at: string | null;
};

type SequenceResult = {
  scanned: number;
  scheduled: number;
  skipped: number;
  failed: number;
};

type InactiveSequenceDay = 7 | 14 | 30;

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function dateKey(value: string | null | undefined) {
  if (!value) return "unknown";
  return value.slice(0, 10);
}

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function activeVisibleAccount(account: AccountRow | undefined) {
  if (!account) return false;
  return (
    String(account.account_status || "active").toLowerCase() === "active" &&
    account.profile_visible !== false
  );
}

function inactiveAlertType(day: InactiveSequenceDay): ScheduledAlertType {
  return `reengagement_inactive_day_${day}` as ScheduledAlertType;
}

async function scheduleUnreadMessageSequence(
  supabase: SupabaseClient,
  now: Date,
  limit: number
): Promise<SequenceResult> {
  const cutoff = daysAgo(now, 3).toISOString();
  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, match_id, sender_id, created_at")
    .is("read_at", null)
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[reengagement-sequences] Unable to scan unread messages:", error);
    return { scanned: 0, scheduled: 0, skipped: 0, failed: 1 };
  }

  const rows = (messages || []) as MessageRow[];
  if (!rows.length) {
    return { scanned: 0, scheduled: 0, skipped: 0, failed: 0 };
  }

  const matchIds = Array.from(new Set(rows.map((row) => row.match_id).filter(Boolean)));
  const { data: matches, error: matchError } = await supabase
    .from("user_matches")
    .select("id, user1_id, user2_id")
    .in("id", matchIds);

  if (matchError) {
    console.error("[reengagement-sequences] Unable to load unread message matches:", matchError);
    return { scanned: rows.length, scheduled: 0, skipped: rows.length, failed: 1 };
  }

  const matchMap = new Map((matches || []).map((row) => [row.id, row as MatchRow]));
  const oldestByRecipient = new Map<string, MessageRow & { recipientId: string }>();

  for (const row of rows) {
    const match = matchMap.get(row.match_id);
    if (!match) continue;

    const recipientId =
      row.sender_id === match.user1_id
        ? match.user2_id
        : row.sender_id === match.user2_id
          ? match.user1_id
          : null;
    if (!recipientId) continue;

    const key = `${row.match_id}:${recipientId}`;
    if (!oldestByRecipient.has(key)) {
      oldestByRecipient.set(key, { ...row, recipientId });
    }
  }

  let scheduled = 0;
  let failed = 0;

  for (const row of oldestByRecipient.values()) {
    try {
      const result = await scheduleAlert({
        supabase,
        userId: row.recipientId,
        alertType: "reengagement_unread_messages",
        channels: ["email"],
        sendAt: now,
        idempotencyKey: `reengagement:unread:${row.match_id}:${row.recipientId}`,
        payload: {
          matchId: row.match_id,
          messageId: row.id,
          senderId: row.sender_id,
          messageCreatedAt: row.created_at,
        },
      });
      scheduled += result.scheduled;
    } catch (error) {
      failed += 1;
      console.error("[reengagement-sequences] Unable to schedule unread message alert:", error);
    }
  }

  return {
    scanned: rows.length,
    scheduled,
    skipped: rows.length - oldestByRecipient.size,
    failed,
  };
}

async function loadCompletedProfileUserIds(
  supabase: SupabaseClient,
  userIds: string[]
) {
  if (!userIds.length) return new Set<string>();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id")
    .in("user_id", userIds)
    .eq("profile_completed", true);

  if (error) {
    console.error("[reengagement-sequences] Unable to load completed profiles:", error);
    return new Set<string>();
  }

  return new Set((data || []).map((row) => String(row.user_id)));
}

async function scheduleInactiveNewPeopleSequence(
  supabase: SupabaseClient,
  now: Date,
  limit: number
): Promise<SequenceResult> {
  const cutoff = daysAgo(now, 6).toISOString();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, account_status, profile_visible, last_active_at")
    .eq("account_status", "active")
    .or("profile_visible.is.null,profile_visible.eq.true")
    .lte("last_active_at", cutoff)
    .order("last_active_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[reengagement-sequences] Unable to scan inactive accounts:", error);
    return { scanned: 0, scheduled: 0, skipped: 0, failed: 1 };
  }

  const accounts = (data || []) as AccountRow[];
  const completedProfiles = await loadCompletedProfileUserIds(
    supabase,
    accounts.map((account) => account.id)
  );

  let scheduled = 0;
  let skipped = 0;
  let failed = 0;

  for (const account of accounts) {
    if (!completedProfiles.has(account.id)) {
      skipped += 1;
      continue;
    }

    try {
      const result = await scheduleAlert({
        supabase,
        userId: account.id,
        alertType: "reengagement_new_people",
        channels: ["email"],
        sendAt: now,
        idempotencyKey: `reengagement:new-people:${account.id}:${dateKey(account.last_active_at)}`,
        payload: {
          inactiveSince: account.last_active_at,
          triggeredAt: now.toISOString(),
        },
      });
      scheduled += result.scheduled;
    } catch (error) {
      failed += 1;
      console.error("[reengagement-sequences] Unable to schedule inactive account alert:", error);
    }
  }

  return { scanned: accounts.length, scheduled, skipped, failed };
}

async function scheduleInactiveUserSequence(
  supabase: SupabaseClient,
  now: Date,
  day: InactiveSequenceDay,
  limit: number
): Promise<SequenceResult> {
  const cutoff = daysAgo(now, day).toISOString();
  const lowerBound = daysAgo(now, day + 1).toISOString();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, account_status, profile_visible, last_active_at")
    .eq("account_status", "active")
    .or("profile_visible.is.null,profile_visible.eq.true")
    .lte("last_active_at", cutoff)
    .gt("last_active_at", lowerBound)
    .order("last_active_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[reengagement-sequences] Unable to scan inactive day ${day} accounts:`, error);
    return { scanned: 0, scheduled: 0, skipped: 0, failed: 1 };
  }

  const accounts = (data || []) as AccountRow[];
  const completedProfiles = await loadCompletedProfileUserIds(
    supabase,
    accounts.map((account) => account.id)
  );

  let scheduled = 0;
  let skipped = 0;
  let failed = 0;

  for (const account of accounts) {
    if (!completedProfiles.has(account.id)) {
      skipped += 1;
      continue;
    }

    try {
      const result = await scheduleAlert({
        supabase,
        userId: account.id,
        alertType: inactiveAlertType(day),
        channels: ["email"],
        sendAt: now,
        idempotencyKey: `reengagement:inactive:${day}:${account.id}:${dateKey(account.last_active_at)}`,
        payload: {
          inactiveSince: account.last_active_at,
          day,
          triggeredAt: now.toISOString(),
        },
      });
      scheduled += result.scheduled;
    } catch (error) {
      failed += 1;
      console.error(`[reengagement-sequences] Unable to schedule inactive day ${day} alert:`, error);
    }
  }

  return { scanned: accounts.length, scheduled, skipped, failed };
}

async function scheduleNewMatchReminderSequence(
  supabase: SupabaseClient,
  now: Date,
  limit: number
): Promise<SequenceResult> {
  const cutoff = daysAgo(now, 2).toISOString();
  const lowerBound = daysAgo(now, 3).toISOString();
  const { data: matches, error } = await supabase
    .from("user_matches")
    .select("id, user1_id, user2_id, created_at")
    .lte("created_at", cutoff)
    .gt("created_at", lowerBound)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[reengagement-sequences] Unable to scan day-2 new matches:", error);
    return { scanned: 0, scheduled: 0, skipped: 0, failed: 1 };
  }

  const rows = (matches || []) as MatchRow[];
  const userIds = Array.from(
    new Set(rows.flatMap((match) => [match.user1_id, match.user2_id]).filter(Boolean))
  );
  if (!userIds.length) {
    return { scanned: rows.length, scheduled: 0, skipped: 0, failed: 0 };
  }

  const { data: accountsData, error: accountsError } = await supabase
    .from("accounts")
    .select("id, account_status, profile_visible, last_active_at")
    .in("id", userIds);

  if (accountsError) {
    console.error("[reengagement-sequences] Unable to load day-2 match participant accounts:", accountsError);
    return { scanned: rows.length, scheduled: 0, skipped: rows.length, failed: 1 };
  }

  const accounts = new Map(
    ((accountsData || []) as AccountRow[]).map((account) => [account.id, account])
  );
  let scheduled = 0;
  let skipped = 0;
  let failed = 0;

  for (const match of rows) {
    const createdAt = timestamp(match.created_at);
    if (!createdAt) {
      skipped += 2;
      continue;
    }

    for (const userId of [match.user1_id, match.user2_id]) {
      const account = accounts.get(userId);
      if (!activeVisibleAccount(account)) {
        skipped += 1;
        continue;
      }

      const lastActiveAt = timestamp(account?.last_active_at);
      if (lastActiveAt && lastActiveAt >= createdAt) {
        skipped += 1;
        continue;
      }

      try {
        const result = await scheduleAlert({
          supabase,
          userId,
          alertType: "reengagement_new_match_reminder",
          channels: ["email"],
          sendAt: now,
          idempotencyKey: `reengagement:new-match-day2:${match.id}:${userId}`,
          payload: {
            matchId: match.id,
            sinceIso: match.created_at,
            triggeredAt: now.toISOString(),
          },
        });
        scheduled += result.scheduled;
      } catch (error) {
        failed += 1;
        console.error("[reengagement-sequences] Unable to schedule day-2 match alert:", error);
      }
    }
  }

  return { scanned: rows.length, scheduled, skipped, failed };
}

async function scheduleNewMatchesSequence(
  supabase: SupabaseClient,
  now: Date,
  limit: number
): Promise<SequenceResult> {
  const cutoff = daysAgo(now, 7).toISOString();
  const { data: matches, error } = await supabase
    .from("user_matches")
    .select("id, user1_id, user2_id, created_at")
    .lte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[reengagement-sequences] Unable to scan new matches:", error);
    return { scanned: 0, scheduled: 0, skipped: 0, failed: 1 };
  }

  const rows = (matches || []) as MatchRow[];
  const userIds = Array.from(
    new Set(rows.flatMap((match) => [match.user1_id, match.user2_id]).filter(Boolean))
  );

  const { data: accountsData, error: accountsError } = await supabase
    .from("accounts")
    .select("id, account_status, profile_visible, last_active_at")
    .in("id", userIds);

  if (accountsError) {
    console.error("[reengagement-sequences] Unable to load match participant accounts:", accountsError);
    return { scanned: rows.length, scheduled: 0, skipped: rows.length, failed: 1 };
  }

  const accounts = new Map(
    ((accountsData || []) as AccountRow[]).map((account) => [account.id, account])
  );
  let scheduled = 0;
  let skipped = 0;
  let failed = 0;

  for (const match of rows) {
    const createdAt = timestamp(match.created_at);
    if (!createdAt) {
      skipped += 2;
      continue;
    }

    for (const userId of [match.user1_id, match.user2_id]) {
      const account = accounts.get(userId);
      if (!activeVisibleAccount(account)) {
        skipped += 1;
        continue;
      }

      const lastActiveAt = timestamp(account?.last_active_at);
      if (lastActiveAt && lastActiveAt >= createdAt) {
        skipped += 1;
        continue;
      }

      try {
        const result = await scheduleAlert({
          supabase,
          userId,
          alertType: "reengagement_new_matches",
          channels: ["email"],
          sendAt: now,
          idempotencyKey: `reengagement:new-matches:${match.id}:${userId}`,
          payload: {
            matchId: match.id,
            sinceIso: match.created_at,
            triggeredAt: now.toISOString(),
          },
        });
        scheduled += result.scheduled;
      } catch (error) {
        failed += 1;
        console.error("[reengagement-sequences] Unable to schedule new matches alert:", error);
      }
    }
  }

  return { scanned: rows.length, scheduled, skipped, failed };
}

export async function processReengagementSequenceSchedules(
  supabase: SupabaseClient,
  options: { now?: Date; limit?: number } = {}
) {
  const now = options.now || new Date();
  const limit = options.limit || 200;
  const [
    unreadMessages,
    inactiveNewPeople,
    newMatchReminder,
    newMatches,
    inactiveDay7,
    inactiveDay14,
    inactiveDay30,
  ] = await Promise.all([
    scheduleUnreadMessageSequence(supabase, now, limit),
    scheduleInactiveNewPeopleSequence(supabase, now, Math.min(limit, 100)),
    scheduleNewMatchReminderSequence(supabase, now, limit),
    scheduleNewMatchesSequence(supabase, now, limit),
    scheduleInactiveUserSequence(supabase, now, 7, Math.min(limit, 100)),
    scheduleInactiveUserSequence(supabase, now, 14, Math.min(limit, 100)),
    scheduleInactiveUserSequence(supabase, now, 30, Math.min(limit, 100)),
  ]);

  return {
    unreadMessages,
    inactiveNewPeople,
    newMatchReminder,
    newMatches,
    inactiveDay7,
    inactiveDay14,
    inactiveDay30,
    scheduled:
      unreadMessages.scheduled +
      inactiveNewPeople.scheduled +
      newMatchReminder.scheduled +
      newMatches.scheduled +
      inactiveDay7.scheduled +
      inactiveDay14.scheduled +
      inactiveDay30.scheduled,
    failed:
      unreadMessages.failed +
      inactiveNewPeople.failed +
      newMatchReminder.failed +
      newMatches.failed +
      inactiveDay7.failed +
      inactiveDay14.failed +
      inactiveDay30.failed,
  };
}
