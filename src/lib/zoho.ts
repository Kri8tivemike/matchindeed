/**
 * Zoho One API Integration Utilities
 *
 * Provides API connectors for Zoho apps that MatchIndeed will integrate with.
 * Each function handles OAuth token management and API calls.
 *
 * Zoho One apps to activate:
 * - Zoho Desk    (support tickets, abuse reports)
 * - Zoho CRM     (admin-only user data, leads)
 * - Zoho Books   (financial reporting, linked to Stripe)
 * - Zoho Analytics (KPI dashboards)
 * - Zoho Flow    (workflow automation)
 *
 * Environment variables required:
 *   ZOHO_CLIENT_ID       — from Zoho API Console
 *   ZOHO_CLIENT_SECRET   — from Zoho API Console
 *   ZOHO_REFRESH_TOKEN   — OAuth refresh token (generated once)
 *   ZOHO_ORG_ID          — Zoho organization ID
 *
 * Setup instructions:
 * 1. Go to https://api-console.zoho.com
 * 2. Create a "Server-based Application"
 * 3. Set redirect URL to https://www.matchindeed.com/api/zoho/callback
 * 4. Generate a refresh token with required scopes
 *
 * This is a TIER 4 integration — defer until 5+ staff or 10,000+ users.
 */

const ZOHO_ACCOUNTS_URL = "https://accounts.zoho.com";

// ---------------------------------------------------------------
// Token Management
// ---------------------------------------------------------------
let cachedAccessToken: string | null = null;
let tokenExpiry = 0;

/**
 * Get a valid Zoho access token (auto-refreshes when expired).
 */
async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn("[Zoho] Missing credentials — skipping");
    return null;
  }

  // Return cached token if still valid
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }

  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    const response = await fetch(
      `${ZOHO_ACCOUNTS_URL}/oauth/v2/token?${params}`,
      { method: "POST" }
    );

    const data = await response.json();

    if (data.access_token) {
      cachedAccessToken = data.access_token;
      // Tokens typically expire in 1 hour; refresh 5 minutes early
      tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
      return cachedAccessToken;
    }

    console.error("[Zoho] Token refresh failed:", data);
    return null;
  } catch (error) {
    console.error("[Zoho] Token request failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------
// Zoho Desk (Support Tickets)
// ---------------------------------------------------------------

/**
 * Create a support ticket in Zoho Desk.
 * Used for: abuse reports, safety issues, account disputes.
 */
export async function createSupportTicket(params: {
  subject: string;
  description: string;
  contactEmail: string;
  contactName: string;
  priority?: "High" | "Medium" | "Low";
  category?: string;
}) {
  const token = await getAccessToken();
  if (!token) return null;

  const orgId = process.env.ZOHO_ORG_ID;
  if (!orgId) {
    console.warn("[Zoho Desk] ZOHO_ORG_ID not set — skipping ticket creation");
    return null;
  }

  try {
    const response = await fetch("https://desk.zoho.com/api/v1/tickets", {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        orgId: orgId || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: params.subject,
        description: params.description,
        priority: params.priority || "Medium",
        category: params.category || "General",
        contact: {
          email: params.contactEmail,
          firstName: params.contactName,
        },
        channel: "Web",
      }),
    });

    return await response.json();
  } catch (error) {
    console.error("[Zoho Desk] Create ticket failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------
// Zoho CRM (Admin User Data)
// ---------------------------------------------------------------

/**
 * Create or update a contact in Zoho CRM.
 * Used for: admin-only user data, lead tracking.
 */
export async function upsertCrmContact(params: {
  email: string;
  firstName: string;
  lastName?: string;
  subscriptionTier?: string;
  signupDate?: string;
  city?: string;
  country?: string;
}) {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(
      "https://www.zohoapis.com/crm/v5/Contacts/upsert",
      {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: [
            {
              Email: params.email,
              First_Name: params.firstName,
              Last_Name: params.lastName || "",
              Subscription_Tier: params.subscriptionTier,
              Signup_Date: params.signupDate,
              City: params.city,
              Country: params.country,
              Lead_Source: "MatchIndeed App",
            },
          ],
          duplicate_check_fields: ["Email"],
        }),
      }
    );

    return await response.json();
  } catch (error) {
    console.error("[Zoho CRM] Upsert contact failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------
// Zoho Analytics (KPI Reporting)
// ---------------------------------------------------------------

/**
 * Push data to a Zoho Analytics workspace.
 * Used for: daily KPI imports (users, matches, revenue).
 */
export async function pushAnalyticsData(params: {
  workspaceName: string;
  tableName: string;
  rows: Record<string, unknown>[];
}) {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(
      `https://analyticsapi.zoho.com/restapi/v2/workspaces/${params.workspaceName}/views/${params.tableName}/rows`,
      {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: params.rows,
        }),
      }
    );

    return await response.json();
  } catch (error) {
    console.error("[Zoho Analytics] Push data failed:", error);
    return null;
  }
}
