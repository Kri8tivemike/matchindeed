/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function parseEnvFile(filePath, target) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in target)) target[key] = value;
  }
}

function fail(message, extra) {
  console.error(message);
  if (extra) console.error(extra);
  process.exit(1);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function run() {
  const env = { ...process.env };
  parseEnvFile(path.join(process.cwd(), ".env"), env);
  parseEnvFile(path.join(process.cwd(), ".env.local"), env);

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    fail("Missing Supabase environment variables.");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = Date.now().toString(36);
  const email = `phase5-admin-perm-${suffix}@example.com`;
  const password = `TmpP@ss-${Math.random().toString(36).slice(2)}A1!`;

  let authUserId = null;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      fail("Failed to create temp superadmin user.", created.error);
    }
    authUserId = created.data.user.id;

    await admin.from("accounts").upsert(
      {
        id: authUserId,
        email,
        display_name: "Phase5 Admin Permissions Test",
        role: "superadmin",
        tier: "vip",
        account_status: "active",
      },
      { onConflict: "id" }
    );

    const signIn = await anon.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.session?.access_token) {
      fail("Failed to sign in temp superadmin.", signIn.error);
    }
    const token = signIn.data.session.access_token;
    const headers = { Authorization: `Bearer ${token}` };

    const checks = [];

    const analyticsRes = await fetch("https://matchindeed.com/api/admin/analytics", {
      headers,
    });
    checks.push({
      endpoint: "/api/admin/analytics",
      status: analyticsRes.status,
      ok: analyticsRes.status === 200,
    });

    const limitsRes = await fetch(
      "https://matchindeed.com/api/admin/activity-limits",
      { headers }
    );
    checks.push({
      endpoint: "/api/admin/activity-limits",
      status: limitsRes.status,
      ok: limitsRes.status === 200,
    });

    const permsRes = await fetch("https://matchindeed.com/api/admin/permissions", {
      headers,
    });
    const permsBody = await readJson(permsRes);
    const hasRoles = !!permsBody?.by_role?.admin && !!permsBody?.by_role?.moderator;
    checks.push({
      endpoint: "/api/admin/permissions",
      status: permsRes.status,
      ok: permsRes.status === 200 && hasRoles,
    });

    const resolveRes = await fetch(
      "https://matchindeed.com/api/admin/meetings/resolve?status=pending_review",
      { headers }
    );
    checks.push({
      endpoint: "/api/admin/meetings/resolve",
      status: resolveRes.status,
      ok: resolveRes.status === 200,
    });

    const userProfileRes = await fetch(
      "https://matchindeed.com/api/admin/user-profile",
      { headers }
    );
    checks.push({
      endpoint: "/api/admin/user-profile (missing user_id)",
      status: userProfileRes.status,
      ok: userProfileRes.status === 400,
    });

    const userActionsRes = await fetch(
      "https://matchindeed.com/api/admin/user-actions",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suspend" }),
      }
    );
    checks.push({
      endpoint: "/api/admin/user-actions (invalid payload)",
      status: userActionsRes.status,
      ok: userActionsRes.status === 400,
    });

    const testIntegrationsRes = await fetch(
      "https://matchindeed.com/api/admin/test-integrations",
      { headers }
    );
    checks.push({
      endpoint: "/api/admin/test-integrations",
      status: testIntegrationsRes.status,
      ok: testIntegrationsRes.status === 200,
    });

    const failed = checks.filter((check) => !check.ok);
    if (failed.length > 0) {
      fail("Admin permission E2E checks failed.", { checks, failed });
    }

    console.log(JSON.stringify({ success: true, checks }, null, 2));
  } finally {
    if (authUserId) {
      await admin
        .from("admin_logs")
        .delete()
        .eq("admin_id", authUserId)
        .eq("action", "wallet_adjusted");
      await admin.from("accounts").delete().eq("id", authUserId);
      await admin.auth.admin.deleteUser(authUserId);
    }
  }
}

run().catch((err) => fail("Phase 5 admin permission E2E failed.", err));
