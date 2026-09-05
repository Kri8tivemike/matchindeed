import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

const TYPE = "profile_completion_reminder";
const PAGE_SIZE = 200;

export function needsProfileReminder(
  account: { account_status: string | null; email: string | null },
  profile: { profile_completed?: boolean | null } | null,
) {
  return (account.account_status || "active") === "active" &&
    !!account.email && profile?.profile_completed !== true;
}

/** Runs after 09:00 UTC (10:00 Lagos). The existing cron retries every five minutes. */
export async function processProfileCompletionReminders(
  supabase: SupabaseClient,
  now = new Date(),
) {
  const result = { scanned: 0, sent: 0, skipped: 0, failed: 0, beforeSendHour: now.getUTCHours() < 9 };
  if (result.beforeSendHour) return result;
  if (!process.env.RESEND_API_KEY) throw new Error("Profile reminders require RESEND_API_KEY");
  const day = now.toISOString().slice(0, 10);
  const staleBefore = new Date(now.getTime() - 15 * 60_000).toISOString();
  let after = "";
  for (;;) {
    let query = supabase.from("accounts").select("id,email,display_name,account_status")
      .or("account_status.is.null,account_status.eq.active").order("id").limit(PAGE_SIZE);
    if (after) query = query.gt("id", after);
    const { data: accounts, error } = await query;
    if (error) throw error;
    if (!accounts?.length) break;
    for (const account of accounts) {
      result.scanned++;
      const { data: profile, error: profileError } = await supabase.from("user_profiles")
        .select("first_name,profile_completed").eq("user_id", account.id).maybeSingle();
      if (profileError) throw profileError;
      if (!needsProfileReminder(account, profile)) { result.skipped++; continue; }
      const { data: existing, error: lookupError } = await supabase.from("user_alert_digest_runs")
        .select("id,status,updated_at").eq("user_id", account.id).eq("digest_type", TYPE)
        .eq("digest_date", day).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing && (existing.status === "sent" || existing.status === "skipped" || existing.updated_at >= staleBefore)) {
        result.skipped++; continue;
      }
      const claim = existing
        ? await supabase.from("user_alert_digest_runs").update({ status: "processing", updated_at: now.toISOString() })
          .eq("id", existing.id).eq("updated_at", existing.updated_at).select("id").maybeSingle()
        : await supabase.from("user_alert_digest_runs").insert({ user_id: account.id, digest_type: TYPE, digest_date: day, status: "processing" }).select("id").single();
      if (claim.error?.code === "23505" || (!claim.error && !claim.data)) { result.skipped++; continue; }
      if (claim.error) throw claim.error;
      // Recheck after claiming so a completed or deactivated account is not mailed from a stale scan.
      const [freshAccount, freshProfile] = await Promise.all([
        supabase.from("accounts").select("email,account_status").eq("id", account.id).maybeSingle(),
        supabase.from("user_profiles").select("profile_completed").eq("user_id", account.id).maybeSingle(),
      ]);
      if (freshAccount.error || freshProfile.error) throw freshAccount.error || freshProfile.error;
      const eligible = freshAccount.data && needsProfileReminder(freshAccount.data, freshProfile.data);
      const sent = eligible ? await sendEmail({
        to: freshAccount.data!.email!, recipientUserId: account.id,
        template: TYPE, idempotencyKey: `${TYPE}:${account.id}:${day}`,
        data: { recipientName: profile?.first_name || account.display_name || "there" },
      }) : { success: true, skipped: true };
      const status = sent.skipped ? "skipped" : sent.success ? "sent" : "failed";
      const marked = await supabase.from("user_alert_digest_runs").update({
        status, count: sent.success && !sent.skipped ? 1 : 0,
        sent_at: status === "sent" ? now.toISOString() : null,
        last_error: sent.error || null,
      }).eq("id", claim.data!.id);
      if (marked.error) throw marked.error;
      result[status]++;
      // Stay below the provider's default request rate across a batch.
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    after = accounts[accounts.length - 1].id;
    if (accounts.length < PAGE_SIZE) break;
  }
  return result;
}
