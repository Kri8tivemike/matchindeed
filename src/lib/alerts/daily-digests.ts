import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendDailyNewLikesEmail,
  sendDailyProfileViewsEmail,
  type SendEmailResult,
} from "@/lib/email";

type DigestType = "daily_profile_views" | "daily_new_likes";

type DigestRunStatus = "processing" | "sent" | "skipped" | "failed";

type ActivityRow = {
  user_id: string;
  target_user_id: string;
  activity_type: string;
};

type Identity = {
  userId: string;
  email: string | null;
  name: string;
};

type DigestCandidate = {
  userId: string;
  count: number;
};

type DigestResult = {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  missingTable: boolean;
};

const DIGEST_SEND_HOUR_UTC = 17;

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

function getDigestWindow(now = new Date()) {
  const digestDate = now.toISOString().slice(0, 10);
  const start = new Date(`${digestDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    digestDate,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function countByTarget(rows: ActivityRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!row.target_user_id) continue;
    counts.set(row.target_user_id, (counts.get(row.target_user_id) || 0) + 1);
  }

  return Array.from(counts.entries()).map(([userId, count]) => ({
    userId,
    count,
  }));
}

async function loadIdentities(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, Identity>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const [{ data: accounts }, { data: profiles }] = await Promise.all([
    supabase.from("accounts").select("id, email, display_name").in("id", userIds),
    supabase.from("user_profiles").select("user_id, first_name").in("user_id", userIds),
  ]);

  const profileMap = new Map(
    (profiles || []).map((profile) => [String(profile.user_id), profile])
  );

  return new Map(
    (accounts || []).map((account) => {
      const profile = profileMap.get(String(account.id));
      const email = account.email || null;
      const name =
        profile?.first_name ||
        account.display_name ||
        email?.split("@")[0] ||
        "there";

      return [
        String(account.id),
        {
          userId: String(account.id),
          email,
          name,
        },
      ];
    })
  );
}

async function claimDigestRun(params: {
  supabase: SupabaseClient;
  userId: string;
  digestType: DigestType;
  digestDate: string;
}) {
  const existing = await params.supabase
    .from("user_alert_digest_runs")
    .select("id, status")
    .eq("user_id", params.userId)
    .eq("digest_type", params.digestType)
    .eq("digest_date", params.digestDate)
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
      digest_type: params.digestType,
      digest_date: params.digestDate,
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

async function markDigestRun(params: {
  supabase: SupabaseClient;
  runId: string;
  status: DigestRunStatus;
  count: number;
  error?: string | null;
}) {
  await params.supabase
    .from("user_alert_digest_runs")
    .update({
      status: params.status,
      count: params.count,
      last_error: params.error || null,
      sent_at: params.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", params.runId);
}

async function sendDigestEmail(params: {
  digestType: DigestType;
  identity: Identity;
  count: number;
}): Promise<SendEmailResult> {
  if (!params.identity.email) {
    return { success: true, skipped: true };
  }

  if (params.digestType === "daily_profile_views") {
    return sendDailyProfileViewsEmail(
      params.identity.email,
      {
        recipientName: params.identity.name,
        count: params.count,
      },
      params.identity.userId
    );
  }

  return sendDailyNewLikesEmail(
    params.identity.email,
    {
      recipientName: params.identity.name,
      count: params.count,
    },
    params.identity.userId
  );
}

async function processCandidates(params: {
  supabase: SupabaseClient;
  digestType: DigestType;
  digestDate: string;
  candidates: DigestCandidate[];
}) {
  const result: DigestResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    missingTable: false,
  };

  const identities = await loadIdentities(
    params.supabase,
    params.candidates.map((candidate) => candidate.userId)
  );

  for (const candidate of params.candidates) {
    const claim = await claimDigestRun({
      supabase: params.supabase,
      userId: candidate.userId,
      digestType: params.digestType,
      digestDate: params.digestDate,
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

    const identity = identities.get(candidate.userId);
    if (!identity?.email) {
      result.skipped += 1;
      await markDigestRun({
        supabase: params.supabase,
        runId: claim.runId,
        status: "skipped",
        count: candidate.count,
        error: "missing_email",
      });
      continue;
    }

    try {
      const email = await sendDigestEmail({
        digestType: params.digestType,
        identity,
        count: candidate.count,
      });

      if (email.success && !email.skipped) {
        result.sent += 1;
        await markDigestRun({
          supabase: params.supabase,
          runId: claim.runId,
          status: "sent",
          count: candidate.count,
        });
      } else {
        result.skipped += 1;
        await markDigestRun({
          supabase: params.supabase,
          runId: claim.runId,
          status: "skipped",
          count: candidate.count,
          error: email.error || "skipped",
        });
      }
    } catch (error) {
      result.failed += 1;
      await markDigestRun({
        supabase: params.supabase,
        runId: claim.runId,
        status: "failed",
        count: candidate.count,
        error: error instanceof Error ? error.message : "Unexpected digest error",
      });
    }
  }

  return result;
}

export async function processDailyEngagementDigests(
  supabase: SupabaseClient,
  options: { now?: Date; force?: boolean } = {}
) {
  const now = options.now || new Date();
  if (!options.force && now.getUTCHours() < DIGEST_SEND_HOUR_UTC) {
    return {
      skipped: true,
      reason: "before_digest_send_hour",
      profileViews: { processed: 0, sent: 0, skipped: 0, failed: 0, missingTable: false },
      newLikes: { processed: 0, sent: 0, skipped: 0, failed: 0, missingTable: false },
    };
  }

  const window = getDigestWindow(now);

  const [{ data: profileViews, error: profileViewsError }, { data: likes, error: likesError }] =
    await Promise.all([
      supabase
        .from("user_activities")
        .select("user_id, target_user_id, activity_type")
        .eq("activity_type", "profile_view")
        .gte("created_at", window.startIso)
        .lt("created_at", window.endIso)
        .limit(5000),
      supabase
        .from("user_activities")
        .select("user_id, target_user_id, activity_type")
        .in("activity_type", ["like", "wink", "interested"])
        .gte("created_at", window.startIso)
        .lt("created_at", window.endIso)
        .limit(5000),
    ]);

  if (profileViewsError) {
    throw profileViewsError;
  }
  if (likesError) {
    throw likesError;
  }

  const profileViewResult = await processCandidates({
    supabase,
    digestType: "daily_profile_views",
    digestDate: window.digestDate,
    candidates: countByTarget((profileViews || []) as ActivityRow[]),
  });

  const newLikesResult = await processCandidates({
    supabase,
    digestType: "daily_new_likes",
    digestDate: window.digestDate,
    candidates: countByTarget((likes || []) as ActivityRow[]),
  });

  return {
    skipped: false,
    digestDate: window.digestDate,
    profileViews: profileViewResult,
    newLikes: newLikesResult,
  };
}
