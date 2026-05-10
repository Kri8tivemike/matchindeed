import type { SupabaseClient } from "@supabase/supabase-js";
import { seedStarterTrialRecord } from "@/lib/starter-trial";

type SupabaseLike = Pick<SupabaseClient, "from" | "auth">;

type ProvisionableUser = {
  id: string;
  email?: string | null;
};

type LegacyAccountRow = {
  id: string;
  email?: string | null;
  account_status?: string | null;
};

const REUSABLE_LEGACY_STATUSES = new Set(["deactivated", "deletion_requested"]);

export function buildDeletedAccountEmailTombstone(userId: string) {
  return `deleted+${userId}@deleted.matchindeed.local`;
}

function normalizeEmail(email: string | null | undefined) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function isDuplicateAccountEmailError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const message =
    "message" in error ? String((error as { message?: unknown }).message || "") : "";
  const details =
    "details" in error ? String((error as { details?: unknown }).details || "") : "";

  return (
    code === "23505" &&
    (message.includes("accounts_email_key") ||
      details.includes("accounts_email_key") ||
      details.includes("(email)=") ||
      message.toLowerCase().includes("duplicate key"))
  );
}

export async function releaseLegacyDeletedAccountEmail(
  supabase: SupabaseLike,
  email: string | null | undefined,
  currentUserId: string
): Promise<{
  released: boolean;
  tombstoneEmail?: string;
  blockingAccount?: LegacyAccountRow | null;
  error?: unknown;
}> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { released: false };
  }

  const { data: legacyAccount, error: legacyLookupError } = await supabase
    .from("accounts")
    .select("id, email, account_status")
    .ilike("email", normalizedEmail)
    .neq("id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacyLookupError) {
    return { released: false, error: legacyLookupError };
  }

  if (!legacyAccount) {
    return { released: false };
  }

  const legacyStatus = String(legacyAccount.account_status || "active").toLowerCase();
  if (!REUSABLE_LEGACY_STATUSES.has(legacyStatus)) {
    return { released: false, blockingAccount: legacyAccount };
  }

  const { data: authLookup, error: authLookupError } = await supabase.auth.admin.getUserById(
    legacyAccount.id
  );

  if (authLookupError && !/user not found|not found/i.test(String(authLookupError.message || ""))) {
    return { released: false, blockingAccount: legacyAccount, error: authLookupError };
  }

  if (authLookup?.user && !authLookup.user.deleted_at) {
    return { released: false, blockingAccount: legacyAccount };
  }

  const tombstoneEmail = buildDeletedAccountEmailTombstone(legacyAccount.id);
  const { error: updateError } = await supabase
    .from("accounts")
    .update({ email: tombstoneEmail })
    .eq("id", legacyAccount.id);

  if (updateError) {
    return { released: false, blockingAccount: legacyAccount, error: updateError };
  }

  return {
    released: true,
    tombstoneEmail,
    blockingAccount: legacyAccount,
  };
}

export async function ensureBaselineUserRecords(
  supabase: SupabaseLike,
  user: ProvisionableUser,
  displayName: string | null
): Promise<{
  ok: boolean;
  status?: number;
  code?: string;
  error?: string;
}> {
  const normalizedEmail = normalizeEmail(user.email);

  const { data: existingAccount, error: accountLookupError } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (accountLookupError) {
    console.error("[account-provisioning] account lookup error:", accountLookupError);
    return {
      ok: false,
      status: 500,
      code: "account_lookup_failed",
      error: "We couldn't prepare your account right now. Please try again.",
    };
  }

  if (!existingAccount) {
    const releaseResult = await releaseLegacyDeletedAccountEmail(
      supabase,
      normalizedEmail,
      user.id
    );

    if (releaseResult.error) {
      console.error("[account-provisioning] legacy email release error:", releaseResult.error);
    }

    if (releaseResult.blockingAccount && !releaseResult.released) {
      return {
        ok: false,
        status: 409,
        code: "account_email_conflict",
        error:
          "This email is already linked to another MatchIndeed account. Please log in to your existing account or contact support for help.",
      };
    }

    const { error: insertError } = await supabase.from("accounts").insert({
      id: user.id,
      email: normalizedEmail || null,
      display_name: displayName,
      role: "user",
    });

    if (insertError) {
      if (isDuplicateAccountEmailError(insertError)) {
        return {
          ok: false,
          status: 409,
          code: "account_email_conflict",
          error:
            "This email is already linked to another MatchIndeed account. Please log in to your existing account or contact support for help.",
        };
      }

      console.error("[account-provisioning] account insert error:", insertError);
      return {
        ok: false,
        status: 500,
        code: "account_setup_failed",
        error: "We couldn't prepare your account right now. Please try again.",
      };
    }

    const { error: starterTrialError } = await seedStarterTrialRecord(
      supabase,
      user.id
    );

    if (starterTrialError) {
      console.error(
        "[account-provisioning] starter trial seed error:",
        starterTrialError
      );
      return {
        ok: false,
        status: 500,
        code: "account_setup_failed",
        error: "We couldn't prepare your account right now. Please try again.",
      };
    }
  }

  const baselineWrites = await Promise.all([
    // ignoreDuplicates: true → ON CONFLICT DO NOTHING, so existing wallet
    // balances and credit totals are never overwritten on re-login.
    supabase
      .from("wallets")
      .upsert({ user_id: user.id, balance_cents: 0 }, { onConflict: "user_id", ignoreDuplicates: true }),
    supabase
      .from("credits")
      .upsert({ user_id: user.id, total: 0, used: 0, rollover: 0 }, { onConflict: "user_id", ignoreDuplicates: true }),
    supabase
      .from("user_progress")
      .upsert(
        { user_id: user.id, profile_completed: false, preferences_completed: false },
        { onConflict: "user_id", ignoreDuplicates: true }
      ),
  ]);

  const baselineError = baselineWrites.find((result) => result.error)?.error;
  if (baselineError) {
    console.error("[account-provisioning] baseline record error:", baselineError);
    return {
      ok: false,
      status: 500,
      code: "account_setup_failed",
      error: "We couldn't prepare your account right now. Please try again.",
    };
  }

  return { ok: true };
}
