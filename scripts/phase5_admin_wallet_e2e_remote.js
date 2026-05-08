/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function parseEnvFile(filePath, target) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
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

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function run() {
  const cwd = process.cwd();
  const env = { ...process.env };
  parseEnvFile(path.join(cwd, ".env"), env);
  parseEnvFile(path.join(cwd, ".env.local"), env);

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    fail("Missing Supabase env vars (url/service/anon).");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const suffix = Date.now().toString(36);
  const adminEmail = `phase5-admin-${suffix}@example.com`;
  const targetEmail = `phase5-wallet-target-${suffix}@example.com`;
  const password = `TmpP@ss-${Math.random().toString(36).slice(2)}A1!`;

  let adminAuthUserId = null;
  let targetAuthUserId = null;

  try {
    const adminCreated = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
    });
    if (adminCreated.error || !adminCreated.data.user) {
      fail("Failed to create temp admin user.", adminCreated.error);
    }
    adminAuthUserId = adminCreated.data.user.id;

    const targetCreated = await adminClient.auth.admin.createUser({
      email: targetEmail,
      password,
      email_confirm: true,
    });
    if (targetCreated.error || !targetCreated.data.user) {
      fail("Failed to create temp target user.", targetCreated.error);
    }
    targetAuthUserId = targetCreated.data.user.id;

    await adminClient.from("accounts").upsert(
      [
        {
          id: adminAuthUserId,
          email: adminEmail,
          display_name: "Phase5 Admin Wallet Test",
          role: "superadmin",
          tier: "vip",
          account_status: "active",
        },
        {
          id: targetAuthUserId,
          email: targetEmail,
          display_name: "Phase5 Wallet Target",
          role: "user",
          tier: "basic",
          account_status: "active",
        },
      ],
      { onConflict: "id" }
    );

    await adminClient.from("wallets").upsert(
      {
        user_id: targetAuthUserId,
        balance_cents: 0,
      },
      { onConflict: "user_id" }
    );

    const signIn = await anon.auth.signInWithPassword({
      email: adminEmail,
      password,
    });
    if (signIn.error || !signIn.data.session?.access_token) {
      fail("Failed to sign in temp admin user.", signIn.error);
    }
    const token = signIn.data.session.access_token;

    const getRes = await fetch("https://matchindeed.com/api/admin/wallet?limit=25", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getBody = await safeJson(getRes);
    if (getRes.status !== 200 || !Array.isArray(getBody?.wallets)) {
      fail("GET /api/admin/wallet failed.", { status: getRes.status, body: getBody });
    }

    const postRes = await fetch("https://matchindeed.com/api/admin/wallet", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: targetAuthUserId,
        adjustment_cents: 1500,
        reason: "Phase 5 admin wallet API E2E",
      }),
    });
    const postBody = await safeJson(postRes);
    if (postRes.status !== 200 || !postBody?.success) {
      fail("POST /api/admin/wallet failed.", { status: postRes.status, body: postBody });
    }

    const { data: walletRow, error: walletError } = await adminClient
      .from("wallets")
      .select("balance_cents")
      .eq("user_id", targetAuthUserId)
      .single();

    if (walletError || !walletRow || walletRow.balance_cents !== 1500) {
      fail("Wallet balance verification failed.", { walletError, walletRow });
    }

    const { data: txRow, error: txError } = await adminClient
      .from("wallet_transactions")
      .select("id, type, amount_cents, balance_after_cents")
      .eq("user_id", targetAuthUserId)
      .eq("type", "admin_adjustment")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (txError || !txRow || txRow.amount_cents !== 1500) {
      fail("Wallet transaction verification failed.", { txError, txRow });
    }

    console.log(
      JSON.stringify(
        {
          success: true,
          get_status: getRes.status,
          post_status: postRes.status,
          target_balance_cents: walletRow.balance_cents,
          transaction_id: txRow.id,
        },
        null,
        2
      )
    );
  } finally {
    if (targetAuthUserId) {
      await adminClient.from("wallet_transactions").delete().eq("user_id", targetAuthUserId);
      await adminClient.from("wallets").delete().eq("user_id", targetAuthUserId);
    }

    if (adminAuthUserId || targetAuthUserId) {
      const ids = [adminAuthUserId, targetAuthUserId].filter(Boolean);
      if (ids.length > 0) {
        await adminClient
          .from("admin_logs")
          .delete()
          .in("admin_id", ids)
          .eq("action", "wallet_adjusted");
        await adminClient
          .from("admin_logs")
          .delete()
          .in("target_user_id", ids)
          .eq("action", "wallet_adjusted");
        await adminClient.from("accounts").delete().in("id", ids);
      }
    }

    if (adminAuthUserId) {
      await adminClient.auth.admin.deleteUser(adminAuthUserId);
    }
    if (targetAuthUserId) {
      await adminClient.auth.admin.deleteUser(targetAuthUserId);
    }
  }
}

run().catch((err) => fail("Admin wallet E2E script failed.", err));
