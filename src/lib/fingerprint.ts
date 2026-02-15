/**
 * FingerprintJS Server-Side Utilities
 *
 * Handles storing and querying device fingerprints for fraud detection.
 * Works with the `device_fingerprints` table in Supabase.
 *
 * Required database table (run migration):
 * ```sql
 * CREATE TABLE device_fingerprints (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *   visitor_id TEXT NOT NULL,
 *   ip_address TEXT,
 *   user_agent TEXT,
 *   event_type TEXT NOT NULL DEFAULT 'login',
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 *
 * CREATE INDEX idx_fingerprints_visitor ON device_fingerprints(visitor_id);
 * CREATE INDEX idx_fingerprints_user ON device_fingerprints(user_id);
 *
 * CREATE TABLE banned_fingerprints (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   visitor_id TEXT NOT NULL UNIQUE,
 *   reason TEXT,
 *   banned_by UUID REFERENCES auth.users(id),
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 * ```
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Store a device fingerprint event.
 * Call on signup, login, profile edit, payment, and messaging.
 */
export async function storeFingerprint(params: {
  userId: string;
  visitorId: string;
  ipAddress?: string;
  userAgent?: string;
  eventType: "signup" | "login" | "profile_edit" | "payment" | "message";
}) {
  const supabase = getAdminClient();

  const { error } = await supabase.from("device_fingerprints").insert({
    user_id: params.userId,
    visitor_id: params.visitorId,
    ip_address: params.ipAddress || null,
    user_agent: params.userAgent || null,
    event_type: params.eventType,
  });

  if (error) {
    console.error("[Fingerprint] Failed to store fingerprint:", error.message);
  }
}

/**
 * Check if a visitor ID is banned.
 * Returns true if the fingerprint has been flagged/banned.
 */
export async function isVisitorBanned(visitorId: string): Promise<boolean> {
  if (!visitorId) return false;

  const supabase = getAdminClient();

  const { data } = await supabase
    .from("banned_fingerprints")
    .select("id")
    .eq("visitor_id", visitorId)
    .limit(1)
    .maybeSingle();

  return !!data;
}

/**
 * Count how many unique user accounts are linked to a visitor ID.
 * Used to detect multi-account abuse (threshold: 3+ accounts = suspicious).
 */
export async function countAccountsForVisitor(visitorId: string): Promise<number> {
  if (!visitorId) return 0;

  const supabase = getAdminClient();

  const { data } = await supabase
    .from("device_fingerprints")
    .select("user_id")
    .eq("visitor_id", visitorId);

  if (!data) return 0;

  // Count distinct user IDs
  const uniqueUsers = new Set(data.map((row) => row.user_id));
  return uniqueUsers.size;
}

/**
 * Run fraud checks on a visitor ID before allowing signup/login.
 * Returns { allowed: boolean, reason?: string }
 */
export async function checkFingerprintFraud(visitorId: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  if (!visitorId) {
    // No fingerprint available — allow but flag for review
    return { allowed: true };
  }

  // Check 1: Is this fingerprint banned?
  const banned = await isVisitorBanned(visitorId);
  if (banned) {
    return { allowed: false, reason: "Device has been banned" };
  }

  // Check 2: Too many accounts from this device?
  const accountCount = await countAccountsForVisitor(visitorId);
  if (accountCount >= 3) {
    return {
      allowed: false,
      reason: `Device linked to ${accountCount} accounts (limit: 3)`,
    };
  }

  return { allowed: true };
}

/**
 * Ban a visitor ID (called by admin when banning a user).
 */
export async function banVisitorId(
  visitorId: string,
  reason: string,
  bannedBy: string
) {
  const supabase = getAdminClient();

  const { error } = await supabase.from("banned_fingerprints").upsert(
    {
      visitor_id: visitorId,
      reason,
      banned_by: bannedBy,
    },
    { onConflict: "visitor_id" }
  );

  if (error) {
    console.error("[Fingerprint] Failed to ban visitor:", error.message);
    return false;
  }
  return true;
}
