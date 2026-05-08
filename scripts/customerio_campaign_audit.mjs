#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const REQUIRED_EVENT_CAMPAIGNS = [
  "signed_up",
  "profile_completed",
  "preferences_set",
  "wallet_funded",
  "date_request_sent",
  "date_request_accepted",
  "meeting_completed",
  "chat_unlocked",
];

function getAppApiKey() {
  return process.env.CUSTOMERIO_APP_API_KEY || "";
}

function getBaseUrl() {
  return (
    process.env.CUSTOMERIO_APP_API_BASE_URL ||
    "https://api.customer.io/v1"
  ).replace(/\/+$/, "");
}

function buildResult(status, message, extra = {}) {
  return { status, message, ...extra };
}

async function fetchCampaigns() {
  const appApiKey = getAppApiKey();
  if (!appApiKey) {
    return buildResult("skip", "Missing CUSTOMERIO_APP_API_KEY");
  }

  const requestHeaders = {
    Authorization: `Bearer ${appApiKey}`,
  };

  // Follow datacenter redirects manually to preserve Authorization header.
  const primaryResponse = await fetch(`${getBaseUrl()}/campaigns`, {
    headers: requestHeaders,
    redirect: "manual",
  });

  const redirectLocation = primaryResponse.headers.get("location");
  const response =
    primaryResponse.status === 301 &&
    redirectLocation &&
    redirectLocation.startsWith("http")
      ? await fetch(redirectLocation, {
          headers: requestHeaders,
          redirect: "manual",
        })
      : primaryResponse;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error =
      payload?.errors?.[0]?.detail ||
      payload?.meta?.error ||
      payload?.error ||
      `HTTP ${response.status}`;
    return buildResult("fail", `Failed to list campaigns: ${error}`);
  }

  const campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];
  const finalUrl = response.url || redirectLocation || `${getBaseUrl()}/campaigns`;
  const resolvedBaseUrl = finalUrl.replace(/\/campaigns\/?$/, "");

  return buildResult("pass", "Fetched campaigns", {
    campaigns,
    resolvedBaseUrl,
  });
}

function auditCampaigns(campaigns) {
  const campaignsByEvent = new Map();
  for (const campaign of campaigns) {
    const eventName = campaign?.event_name || null;
    if (!eventName) continue;
    const existing = campaignsByEvent.get(eventName) || [];
    existing.push(campaign);
    campaignsByEvent.set(eventName, existing);
  }

  const results = REQUIRED_EVENT_CAMPAIGNS.map((eventName) => {
    const eventCampaigns = campaignsByEvent.get(eventName) || [];
    if (eventCampaigns.length === 0) {
      return {
        event: eventName,
        configured: false,
        active: false,
        actions: 0,
        message: "Missing campaign",
      };
    }

    const anyActive = eventCampaigns.some(
      (campaign) => campaign.active === true || campaign.state === "active"
    );
    const actionCount = eventCampaigns.reduce((sum, campaign) => {
      const actions = Array.isArray(campaign.actions) ? campaign.actions.length : 0;
      return sum + actions;
    }, 0);
    const hasEmailAction = eventCampaigns.some((campaign) =>
      Array.isArray(campaign.actions)
        ? campaign.actions.some((action) => action?.type === "email")
        : false
    );

    return {
      event: eventName,
      configured: true,
      active: anyActive,
      actions: actionCount,
      has_email_action: hasEmailAction,
      campaigns: eventCampaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        state: campaign.state,
        active: !!campaign.active,
        action_types: Array.isArray(campaign.actions)
          ? campaign.actions.map((action) => action.type)
          : [],
      })),
      message:
        !hasEmailAction
          ? "Configured but missing email action"
          : anyActive
          ? "Configured and active"
          : "Configured but not active",
    };
  });

  const summary = {
    required: REQUIRED_EVENT_CAMPAIGNS.length,
    configured: results.filter((result) => result.configured).length,
    active: results.filter((result) => result.active).length,
    with_email_action: results.filter((result) => result.has_email_action).length,
    missing: results.filter((result) => !result.configured).length,
  };

  return { summary, results };
}

async function run() {
  const fetched = await fetchCampaigns();
  if (fetched.status !== "pass") {
    console.log(
      JSON.stringify(
        {
          service: "Customer.io Campaign Audit",
          status: fetched.status,
          message: fetched.message,
        },
        null,
        2
      )
    );
    process.exit(fetched.status === "fail" ? 1 : 0);
  }

  const { summary, results } = auditCampaigns(fetched.campaigns);
  const output = {
    service: "Customer.io Campaign Audit",
    status: summary.missing === 0 ? "pass" : "warn",
    resolved_base_url: fetched.resolvedBaseUrl,
    summary,
    results,
    timestamp: new Date().toISOString(),
  };

  console.log(JSON.stringify(output, null, 2));

  if (summary.missing > 0) {
    process.exitCode = 1;
  }
}

run();
