import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPeopleNearYouEmail } from "@/lib/email";
import { normalizeLocation, toCityCountryLabel } from "@/lib/location";
import { sendPushNotificationIfAllowed } from "@/lib/onesignal";

const ALERT_TYPE = "people_near_you";
const RETURN_COOLDOWN_MS = 60 * 60 * 1000;
const RECIPIENT_ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const MAX_LOCATION_CANDIDATES = 500;
const MAX_ALERT_RECIPIENTS = 10;

type ActiveProfile = {
  user_id: string;
  first_name: string | null;
  location: string | null;
  profile_completed: boolean | null;
};

type RecipientProfile = ActiveProfile;

type AccountRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  account_status: string | null;
  profile_visible: boolean | null;
  last_active_at: string | null;
};

type AlertResult = {
  processed: number;
  emailed: number;
  pushed: number;
  skipped: number;
  failed: number;
  missingTable: boolean;
};

function emptyResult(): AlertResult {
  return {
    processed: 0,
    emailed: 0,
    pushed: 0,
    skipped: 0,
    failed: 0,
    missingTable: false,
  };
}

function isMissingDigestRunsTable(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  const code = String(value?.code || "");
  const message = String(value?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code.startsWith("PGRST20") ||
    message.includes("user_alert_digest_runs")
  );
}

function isRecentlyActive(lastActiveAt: string | null | undefined, windowMs: number) {
  if (!lastActiveAt) return false;

  const lastActiveMs = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(lastActiveMs)) return false;

  return Date.now() - lastActiveMs < windowMs;
}

function locationKey(value: string | null | undefined) {
  const label = toCityCountryLabel(value);
  if (!label) return null;

  return normalizeLocation(label).toLowerCase();
}

function locationSearchTerm(value: string | null | undefined) {
  const label = toCityCountryLabel(value);
  if (!label) return null;

  const [city] = label.split(",").map((part) => part.trim());
  return city && city.length >= 3 ? city : null;
}

function recipientName(profile: RecipientProfile | undefined, account: AccountRow) {
  return (
    profile?.first_name ||
    account.display_name ||
    account.email?.split("@")[0] ||
    "there"
  );
}

async function claimAlertRun(params: {
  supabase: SupabaseClient;
  userId: string;
  alertDate: string;
}) {
  const existing = await params.supabase
    .from("user_alert_digest_runs")
    .select("id, status")
    .eq("user_id", params.userId)
    .eq("digest_type", ALERT_TYPE)
    .eq("digest_date", params.alertDate)
    .maybeSingle();

  if (existing.error) {
    if (isMissingDigestRunsTable(existing.error)) {
      return { claimed: false, missingTable: true, runId: null };
    }
    throw existing.error;
  }

  if (existing.data) {
    return { claimed: false, missingTable: false, runId: String(existing.data.id) };
  }

  const inserted = await params.supabase
    .from("user_alert_digest_runs")
    .insert({
      user_id: params.userId,
      digest_type: ALERT_TYPE,
      digest_date: params.alertDate,
      status: "processing",
    })
    .select("id")
    .single();

  if (inserted.error) {
    if (isMissingDigestRunsTable(inserted.error)) {
      return { claimed: false, missingTable: true, runId: null };
    }
    throw inserted.error;
  }

  return {
    claimed: true,
    missingTable: false,
    runId: String(inserted.data.id),
  };
}

async function markAlertRun(params: {
  supabase: SupabaseClient;
  runId: string;
  status: "sent" | "skipped" | "failed";
  error?: string | null;
}) {
  await params.supabase
    .from("user_alert_digest_runs")
    .update({
      status: params.status,
      count: params.status === "sent" ? 1 : 0,
      last_error: params.error || null,
      sent_at: params.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", params.runId);
}

async function insertNotification(
  supabase: SupabaseClient,
  userId: string,
  locationLabel: string | null,
  activeUserId: string
) {
  const preferredInsert = await supabase.from("notifications").insert({
    user_id: userId,
    type: ALERT_TYPE,
    title: "People near you are active",
    message: locationLabel
      ? `Singles in ${locationLabel} are active right now.`
      : "Singles near you are active right now.",
    data: {
      from_user_id: activeUserId,
      location: locationLabel,
    },
  });

  if (!preferredInsert.error) return;

  await supabase.from("notifications").insert({
    user_id: userId,
    notification_type: ALERT_TYPE,
    site_enabled: true,
    push_enabled: true,
    email_enabled: true,
  });
}

async function loadActiveProfile(
  supabase: SupabaseClient,
  activeUserId: string
): Promise<ActiveProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id, first_name, location, profile_completed")
    .eq("user_id", activeUserId)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as ActiveProfile | null;
}

async function loadRecipientProfiles(
  supabase: SupabaseClient,
  activeUserId: string,
  activeLocation: string
) {
  const searchTerm = locationSearchTerm(activeLocation);
  const activeLocationKey = locationKey(activeLocation);
  if (!searchTerm || !activeLocationKey) return [];

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id, first_name, location, profile_completed")
    .eq("profile_completed", true)
    .neq("user_id", activeUserId)
    .ilike("location", `%${searchTerm}%`)
    .limit(MAX_LOCATION_CANDIDATES);

  if (error) throw error;

  return ((data || []) as RecipientProfile[]).filter(
    (profile) => locationKey(profile.location) === activeLocationKey
  );
}

async function loadAccounts(supabase: SupabaseClient, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, AccountRow>();

  const { data, error } = await supabase
    .from("accounts")
    .select("id, email, display_name, account_status, profile_visible, last_active_at")
    .in("id", userIds)
    .eq("account_status", "active")
    .or("profile_visible.is.null,profile_visible.eq.true");

  if (error) throw error;

  return new Map(
    ((data || []) as AccountRow[]).map((account) => [account.id, account])
  );
}

export function shouldTriggerPeopleNearYouActiveAlert(previousLastActiveAt: string | null) {
  return !isRecentlyActive(previousLastActiveAt, RETURN_COOLDOWN_MS);
}

export async function sendPeopleNearYouActiveAlerts(params: {
  supabase: SupabaseClient;
  activeUserId: string;
}) {
  const result = emptyResult();
  const activeProfile = await loadActiveProfile(params.supabase, params.activeUserId);
  if (
    !activeProfile?.location ||
    activeProfile.profile_completed !== true ||
    !locationKey(activeProfile.location)
  ) {
    return result;
  }

  const locationLabel = toCityCountryLabel(activeProfile.location);
  const recipientProfiles = await loadRecipientProfiles(
    params.supabase,
    params.activeUserId,
    activeProfile.location
  );
  const profileMap = new Map(
    recipientProfiles.map((profile) => [profile.user_id, profile])
  );
  const accounts = await loadAccounts(
    params.supabase,
    recipientProfiles.map((profile) => profile.user_id)
  );
  const today = new Date().toISOString().slice(0, 10);

  for (const [userId, account] of accounts) {
    if (result.processed >= MAX_ALERT_RECIPIENTS) break;

    if (isRecentlyActive(account.last_active_at, RECIPIENT_ACTIVE_WINDOW_MS)) {
      result.skipped += 1;
      continue;
    }

    const claim = await claimAlertRun({
      supabase: params.supabase,
      userId,
      alertDate: today,
    });

    if (claim.missingTable) {
      result.missingTable = true;
      return result;
    }

    if (!claim.claimed || !claim.runId) {
      result.skipped += 1;
      continue;
    }

    result.processed += 1;

    try {
      await insertNotification(
        params.supabase,
        userId,
        locationLabel,
        params.activeUserId
      );

      const pushSent = await sendPushNotificationIfAllowed({
        userId,
        type: ALERT_TYPE,
        title: "People near you are active right now",
        message: locationLabel
          ? `Singles in ${locationLabel} are online. Join the activity.`
          : "Singles near you are online. Join the activity.",
        url: "/dashboard/discover",
        data: {
          from_user_id: params.activeUserId,
          location: locationLabel,
        },
      });

      if (pushSent) {
        result.pushed += 1;
      }

      let emailed = false;
      if (account.email) {
        const email = await sendPeopleNearYouEmail(
          account.email,
          {
            recipientName: recipientName(profileMap.get(userId), account),
            location: locationLabel,
          },
          userId
        );
        emailed = email.success && !email.skipped;
      }

      if (emailed) {
        result.emailed += 1;
      }

      await markAlertRun({
        supabase: params.supabase,
        runId: claim.runId,
        status: "sent",
      });
    } catch (error) {
      result.failed += 1;
      await markAlertRun({
        supabase: params.supabase,
        runId: claim.runId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unexpected nearby alert error",
      });
    }
  }

  return result;
}
