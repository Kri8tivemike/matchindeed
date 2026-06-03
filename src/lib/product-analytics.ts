export const PRODUCT_ANALYTICS_EVENTS = {
  SIGNUP_COMPLETED: "signup_completed",
  PROFILE_COMPLETED: "profile_completed",
  PREFERENCES_COMPLETED: "preferences_completed",
  SUBSCRIPTION_PURCHASED: "subscription_purchased",
  REFERRAL_REWARD_EARNED: "referral_reward_earned",
  MEETING_REQUESTED: "meeting_requested",
  MEETING_BOOKED: "meeting_booked",
} as const;

export type ProductAnalyticsEvent =
  (typeof PRODUCT_ANALYTICS_EVENTS)[keyof typeof PRODUCT_ANALYTICS_EVENTS];

type ProductAnalyticsProperties = Record<string, unknown>;

function getProductAnalyticsToken() {
  return (
    process.env.MIXPANEL_TOKEN ||
    process.env.NEXT_PUBLIC_MIXPANEL_TOKEN ||
    ""
  ).trim();
}

function cleanProperties(properties: ProductAnalyticsProperties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined)
  );
}

export async function trackProductEventSafely(
  distinctId: string,
  event: ProductAnalyticsEvent,
  properties: ProductAnalyticsProperties = {}
) {
  const token = getProductAnalyticsToken();
  if (!token || !distinctId) return false;

  try {
    const payload = {
      event,
      properties: {
        token,
        distinct_id: distinctId,
        time: Math.floor(Date.now() / 1000),
        source: "server",
        ...cleanProperties(properties),
      },
    };

    const data = Buffer.from(JSON.stringify(payload)).toString("base64");
    const response = await fetch(
      `https://api.mixpanel.com/track?data=${encodeURIComponent(data)}&verbose=1`,
      { method: "GET" }
    );

    if (!response.ok) {
      console.warn("[product-analytics] Mixpanel request failed", {
        event,
        status: response.status,
      });
      return false;
    }

    const result = (await response.json().catch(() => null)) as
      | { status?: number | string }
      | null;

    return result?.status === 1 || result?.status === "1";
  } catch (error) {
    console.warn("[product-analytics] Event tracking skipped", {
      event,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}
