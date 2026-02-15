# Zoho One Setup — Refresh Token & Org ID

Your Zoho Client ID and Secret are already in `.env.local`. You need two more values:

1. **ZOHO_REFRESH_TOKEN** — one-time OAuth token (never expires)
2. **ZOHO_ORG_ID** — your Zoho organization ID (for Zoho Desk)

---

## Step 1: Get the Refresh Token

### 1.1 Generate an authorization code

1. Go to [https://api-console.zoho.com](https://api-console.zoho.com)
2. Sign in and open your **Self Client** (Client ID: `1000.G716NEF0QI...`)
3. Click the **"Generate Code"** tab
4. In **Scope**, enter (comma-separated, no spaces):
   ```
   ZohoDesk.tickets.CREATE,ZohoCRM.modules.contacts.CREATE,ZohoAnalytics.data.ALL
   ```
5. Click **Create**
6. If prompted, select the Zoho app and portal
7. Copy the **authorization code** that appears (it expires in ~3 minutes)

### 1.2 Exchange the code for a refresh token

From your project root (webfiles folder):

```bash
# Load env vars from .env.local, then run the script
export $(grep -v '^#' .env.local | grep -E '^ZOHO_' | xargs)
node scripts/zoho-get-refresh-token.mjs PASTE_YOUR_CODE_HERE
```

The script will print something like:

```
ZOHO_REFRESH_TOKEN=1000.abc123...
```

Add that line to your `.env.local`.

> **If you're in EU or India:** Use the correct accounts URL:
> ```bash
> ZOHO_ACCOUNTS_URL=https://accounts.zoho.eu node scripts/zoho-get-refresh-token.mjs YOUR_CODE
> ```
> (Options: `accounts.zoho.com`, `accounts.zoho.eu`, `accounts.zoho.in`, `accounts.zoho.com.au`)

---

## Step 2: Get the Organization ID (ZOHO_ORG_ID)

`ZOHO_ORG_ID` is only needed for **Zoho Desk** (support tickets). If you're not using Desk yet, you can skip this and leave it empty — the CRM and Analytics functions will still work.

### Option A: From Zoho Desk UI

1. Go to [https://desk.zoho.com](https://desk.zoho.com)
2. Click the **gear icon** (Settings)
3. Go to **Developer Space** → **API**
4. Copy the **Organization ID** shown there

### Option B: From the API (after you have a refresh token)

After adding `ZOHO_REFRESH_TOKEN` to `.env.local`, you can list your organizations:

```bash
# First get an access token (the script does this internally)
# Or hit this API with your refresh token:
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "grant_type=refresh_token" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "refresh_token=YOUR_REFRESH_TOKEN"
```

Then:

```bash
curl "https://desk.zoho.com/api/v1/organizations" \
  -H "Authorization: Zoho-oauthtoken YOUR_ACCESS_TOKEN"
```

The response will include `"id"` for each organization — use that as `ZOHO_ORG_ID`.

### Option C: Skip for now

If you don't use Zoho Desk yet, leave `ZOHO_ORG_ID` empty. The `createSupportTicket` function will skip, but CRM and Analytics will work.

---

## Step 3: Verify

Restart your dev server and ensure `.env.local` has:

```
ZOHO_CLIENT_ID=1000.G716NEF0QI17316WQUK3DAGC3SO1FZ
ZOHO_CLIENT_SECRET=91d47afbd3e7137d4ec57715453b077f2d9b43aa51
ZOHO_REFRESH_TOKEN=1000.xxxx...   # from Step 1
ZOHO_ORG_ID=123456789             # from Step 2, or leave empty
```
