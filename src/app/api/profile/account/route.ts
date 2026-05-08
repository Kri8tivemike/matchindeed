/**
 * Account Management API
 * ---------------------
 * PATCH  - Deactivate/reactivate account visibility and status
 * DELETE - Create deletion request (soft-delete workflow)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendAccountDeactivatedEmail,
  sendAccountDeletionRequestedEmail,
} from "@/lib/email";
import { getPreferredEmailRecipientName } from "@/lib/email-recipient-name";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const DELETE_REASON_MIN_CHARS = 50;
const DELETE_REASON_MAX_CHARS = 1000;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type ProfileNameRow = {
  first_name: string | null;
};

type AccountLifecycleUpdate = {
  account_status: string;
  profile_visible: boolean;
  calendar_enabled: boolean;
  profile_status: string;
  deleted_at?: string | null;
  deletion_reason?: string | null;
  deletion_requested_at?: string | null;
};

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message || "");
  }
  return "";
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String(error.code || "");
  }
  return "";
}

function isMissingColumnError(error: unknown, column: string) {
  const code = errorCode(error);
  const msg = errorMessage(error).toLowerCase();
  return (
    code === "42703" ||
    (code === "PGRST204" && msg.includes(column.toLowerCase())) ||
    msg.includes(column.toLowerCase())
  );
}

function isMissingTableError(error: unknown, table: string) {
  const code = errorCode(error);
  const msg = errorMessage(error).toLowerCase();
  return code === "42P01" || msg.includes(table.toLowerCase());
}

async function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null, error: "Missing or invalid authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return { user: null, error: "Invalid or expired session" };
  }

  return { user: data.user, error: null };
}

async function updateAccountLifecycle(userId: string, payload: AccountLifecycleUpdate) {
  const baseSelect = "id, account_status, profile_visible, calendar_enabled, profile_status";

  const { data, error } = await supabaseAdmin
    .from("accounts")
    .update(payload)
    .eq("id", userId)
    .select(baseSelect)
    .single();

  if (!error) {
    return { data, error: null as unknown, migrationPending: false };
  }

  if (
    isMissingColumnError(error, "deleted_at") ||
    isMissingColumnError(error, "deletion_reason") ||
    isMissingColumnError(error, "deletion_requested_at")
  ) {
    const fallbackPayload = {
      account_status: payload.account_status,
      profile_visible: payload.profile_visible,
      calendar_enabled: payload.calendar_enabled,
      profile_status: payload.profile_status,
    };

    const retry = await supabaseAdmin
      .from("accounts")
      .update(fallbackPayload)
      .eq("id", userId)
      .select(baseSelect)
      .single();

    return {
      data: retry.data || null,
      error: retry.error,
      migrationPending: !retry.error,
    };
  }

  return { data: null, error, migrationPending: false };
}

async function verifyPassword(email: string, password: string) {
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  // Sign out the stateless service client session after verification.
  await authClient.auth.signOut();

  return !error;
}

function normalizeAuthProvider(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function extractAuthProviders(user: {
  app_metadata?: Record<string, unknown> | null;
  identities?: Array<{ provider?: string | null }> | null;
  email?: string | null;
}) {
  const providerSet = new Set<string>();

  const appMetadata = user.app_metadata || {};
  const metaProviders = appMetadata.providers;
  if (Array.isArray(metaProviders)) {
    for (const provider of metaProviders) {
      const normalized = normalizeAuthProvider(provider);
      if (normalized) providerSet.add(normalized);
    }
  }

  const primaryProvider = normalizeAuthProvider(appMetadata.provider);
  if (primaryProvider) providerSet.add(primaryProvider);

  if (Array.isArray(user.identities)) {
    for (const identity of user.identities) {
      const normalized = normalizeAuthProvider(identity?.provider);
      if (normalized) providerSet.add(normalized);
    }
  }

  // Legacy fallback: if no provider metadata exists, email/password is likely enabled.
  if (providerSet.size === 0 && user.email) {
    providerSet.add("email");
  }

  return Array.from(providerSet);
}

function requiresPasswordConfirmation(user: {
  app_metadata?: Record<string, unknown> | null;
  identities?: Array<{ provider?: string | null }> | null;
  email?: string | null;
}) {
  return extractAuthProviders(user).includes("email");
}

function resolveAuthMetadataName(
  user: {
    user_metadata?: Record<string, unknown> | null;
    email?: string | null;
  },
  profile: ProfileNameRow | null | undefined
) {
  return getPreferredEmailRecipientName({
    profileFirstName: profile?.first_name,
    authGivenName:
      typeof user.user_metadata?.given_name === "string"
        ? user.user_metadata.given_name
        : null,
    authFirstName:
      typeof user.user_metadata?.first_name === "string"
        ? user.user_metadata.first_name
        : null,
    authDisplayName:
      typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : null,
    authFullName:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null,
    email: user.email,
  });
}

/**
 * PATCH — Deactivate (or reactivate) the user's account.
 * Body: { action: "deactivate" | "reactivate" }
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action !== "deactivate" && action !== "reactivate") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const updatePayload: AccountLifecycleUpdate =
      action === "deactivate"
        ? {
            account_status: "deactivated",
            profile_visible: false,
            calendar_enabled: false,
            profile_status: "hidden",
          }
        : {
            account_status: "active",
            profile_visible: true,
            calendar_enabled: true,
            profile_status: "online",
          };

    const updateResult = await updateAccountLifecycle(user.id, updatePayload);

    if (updateResult.error) {
      console.error(`Error ${action} account:`, updateResult.error);
      return NextResponse.json(
        { error: `Failed to ${action} account` },
        { status: 500 }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (action === "deactivate" && user.email) {
      await sendAccountDeactivatedEmail(user.email, {
        recipientName: resolveAuthMetadataName(user, profile),
        reactivateUrl: `${
          process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com"
        }/dashboard/profile/my-account`,
      });
    }

    return NextResponse.json({
      success: true,
      message:
        action === "deactivate"
          ? "Account deactivated successfully."
          : "Account reactivated successfully.",
      account: updateResult.data,
      migration_pending: updateResult.migrationPending,
    });
  } catch (err) {
    console.error("Account PATCH error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Create a deletion request (soft-delete flow).
 * Body:
 *   {
 *     confirm: true,
 *     reason: string (50..1000 chars),
 *     password?: string (required for email/password accounts)
 *   }
 */
export async function DELETE(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await req.json();
    const confirm = body.confirm === true;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!confirm) {
      return NextResponse.json(
        { error: "Deletion request must be confirmed with { confirm: true }" },
        { status: 400 }
      );
    }

    if (reason.length < DELETE_REASON_MIN_CHARS || reason.length > DELETE_REASON_MAX_CHARS) {
      return NextResponse.json(
        {
          error: `Reason must be between ${DELETE_REASON_MIN_CHARS} and ${DELETE_REASON_MAX_CHARS} characters.`,
        },
        { status: 400 }
      );
    }

    if (requiresPasswordConfirmation(user)) {
      if (!user.email) {
        return NextResponse.json(
          { error: "Cannot verify password for this account." },
          { status: 400 }
        );
      }

      if (!password.trim()) {
        return NextResponse.json(
          { error: "Password confirmation is required for this account type." },
          { status: 400 }
        );
      }

      const passwordOk = await verifyPassword(user.email, password);
      if (!passwordOk) {
        return NextResponse.json(
          { error: "Password confirmation failed." },
          { status: 401 }
        );
      }
    }

    let migrationPending = false;
    let deletionRequestId: string | null = null;

    const { data: existingRequest, error: existingRequestError } = await supabaseAdmin
      .from("account_deletion_requests")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingRequestError) {
      if (isMissingTableError(existingRequestError, "account_deletion_requests")) {
        migrationPending = true;
      } else {
        console.error("Error checking existing deletion request:", existingRequestError);
        return NextResponse.json(
          { error: "Failed to process deletion request" },
          { status: 500 }
        );
      }
    }

    if (existingRequest?.id) {
      deletionRequestId = existingRequest.id;
    } else if (!migrationPending) {
      const { data: insertedRequest, error: insertRequestError } = await supabaseAdmin
        .from("account_deletion_requests")
        .insert({
          user_id: user.id,
          reason,
          status: "pending",
          requested_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertRequestError) {
        if (isMissingTableError(insertRequestError, "account_deletion_requests")) {
          migrationPending = true;
        } else {
          console.error("Error inserting deletion request:", insertRequestError);
          return NextResponse.json(
            { error: "Failed to create deletion request" },
            { status: 500 }
          );
        }
      } else {
        deletionRequestId = insertedRequest.id;
      }
    }

    const nowIso = new Date().toISOString();
    const updateResult = await updateAccountLifecycle(user.id, {
      account_status: "deletion_requested",
      profile_visible: false,
      calendar_enabled: false,
      profile_status: "hidden",
      deleted_at: nowIso,
      deletion_requested_at: nowIso,
      deletion_reason: reason,
    });

    if (updateResult.error) {
      console.error("Error updating account lifecycle for deletion request:", updateResult.error);
      return NextResponse.json(
        { error: "Failed to submit deletion request" },
        { status: 500 }
      );
    }

    if (updateResult.migrationPending) {
      migrationPending = true;
    }

    let confirmationEmailSent = false;
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("first_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (user.email) {
      const emailResult = await sendAccountDeletionRequestedEmail(user.email, {
        recipientName: resolveAuthMetadataName(user, profile),
        requestedAt: new Date(nowIso).toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "UTC",
          timeZoneName: "short",
        }),
      });
      confirmationEmailSent = Boolean(emailResult.success && !emailResult.skipped);
    }

    return NextResponse.json({
      success: true,
      message: "Deletion request submitted. Your profile is now hidden while we process it.",
      request_id: deletionRequestId,
      migration_pending: migrationPending,
      confirmation_email_sent: confirmationEmailSent,
      account: updateResult.data,
    });
  } catch (err) {
    console.error("Account DELETE error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
