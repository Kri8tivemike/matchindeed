#!/usr/bin/env node
/**
 * Zoho One — One-time setup to get your refresh token
 *
 * Run this ONCE to exchange an authorization code for a refresh token.
 * The refresh token never expires and is used by the app to get access tokens.
 *
 * USAGE:
 *   1. Go to https://api-console.zoho.com
 *   2. Open your Self Client (the one with Client ID 1000.G716NEF0QI...)
 *   3. Click the "Generate Code" tab
 *   4. In "Scope" enter (comma-separated, no spaces):
 *      ZohoDesk.tickets.CREATE,ZohoCRM.modules.contacts.CREATE,ZohoAnalytics.data.ALL
 *   5. Click "Create" → authorize if prompted → copy the authorization code
 *   6. Run: node scripts/zoho-get-refresh-token.mjs YOUR_CODE_HERE
 *
 * The script will output your refresh token. Add it to .env.local as:
 *   ZOHO_REFRESH_TOKEN=1000.xxxx...
 *
 * DATACENTER: If you're in EU or India, set ZOHO_ACCOUNTS_URL before running:
 *   ZOHO_ACCOUNTS_URL=https://accounts.zoho.eu node scripts/zoho-get-refresh-token.mjs CODE
 *   (Options: accounts.zoho.com, accounts.zoho.eu, accounts.zoho.in, accounts.zoho.com.au)
 */

const ACCOUNTS_URL =
  process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.com";
const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;

const code = process.argv[2];

if (!code) {
  console.error(`
Usage: node scripts/zoho-get-refresh-token.mjs <AUTHORIZATION_CODE>

First get the code from: https://api-console.zoho.com
→ Your Self Client → Generate Code tab → enter scopes → Create → copy the code

Required env vars (load from .env.local or export):
  ZOHO_CLIENT_ID
  ZOHO_CLIENT_SECRET

Optional (if not using US datacenter):
  ZOHO_ACCOUNTS_URL=https://accounts.zoho.eu  # or .in, .com.au
`);
  process.exit(1);
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Error: ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET must be set.\n" +
      "Run: export $(grep -v '^#' .env.local | xargs) && node scripts/zoho-get-refresh-token.mjs YOUR_CODE"
  );
  process.exit(1);
}

async function main() {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: code.trim(),
  });

  const url = `${ACCOUNTS_URL}/oauth/v2/token?${params}`;
  const res = await fetch(url, { method: "POST" });
  const data = await res.json();

  if (data.refresh_token) {
    console.log("\n✅ Success! Add this to your .env.local:\n");
    console.log(`ZOHO_REFRESH_TOKEN=${data.refresh_token}`);
    console.log("\n");
    return;
  }

  console.error("❌ Token exchange failed:", data);
  if (data.error === "invalid_code") {
    console.error("\nThe authorization code expires in ~3 minutes. Generate a new one and try again.");
  }
  if (data.error === "invalid_client") {
    console.error("\nCheck that ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET are correct.");
  }
  process.exit(1);
}

main();
