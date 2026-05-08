const ONESIGNAL_APP_INFO_URL = "https://api.onesignal.com/apps";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://matchindeed.com"
    : "http://localhost:3001");

type OneSignalAppResponse = {
  id?: string | null;
  name?: string | null;
  site_name?: string | null;
  chrome_web_key?: string | null;
  chrome_web_origin?: string | null;
  site_url?: string | null;
  safari_site_origin?: string | null;
  channels?: {
    push?: {
      enabled?: boolean;
      platforms?: string[] | null;
    } | null;
  } | null;
  errors?: unknown;
};

export interface OneSignalWebPushStatus {
  configured: boolean;
  appIdPresent: boolean;
  restKeyPresent: boolean;
  webPushConfigured: boolean;
  originMatches: boolean;
  pushChannelEnabled: boolean;
  appName: string | null;
  expectedOrigin: string | null;
  configuredOrigin: string | null;
  message: string;
}

function toOrigin(value?: string | null) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function hasChromeWebKey(value?: string | null) {
  return typeof value === "string" && value.trim().length > 0;
}

export function summarizeOneSignalWebPushStatus(
  appInfo: OneSignalAppResponse | null | undefined,
  appUrl: string = APP_URL
): OneSignalWebPushStatus {
  const expectedOrigin = toOrigin(appUrl);
  const configuredOrigin =
    toOrigin(appInfo?.chrome_web_origin) ??
    toOrigin(appInfo?.site_url) ??
    toOrigin(appInfo?.safari_site_origin);

  const pushChannelEnabled = Boolean(appInfo?.channels?.push?.enabled);
  const hasSiteName =
    typeof appInfo?.site_name === "string" && appInfo.site_name.trim().length > 0;
  const webPushConfigured = Boolean(
    configuredOrigin && hasChromeWebKey(appInfo?.chrome_web_key) && hasSiteName
  );
  const originMatches =
    !configuredOrigin || !expectedOrigin
      ? webPushConfigured
      : configuredOrigin === expectedOrigin;

  if (!appInfo?.id) {
    return {
      configured: false,
      appIdPresent: false,
      restKeyPresent: false,
      webPushConfigured: false,
      originMatches: false,
      pushChannelEnabled: false,
      appName: null,
      expectedOrigin,
      configuredOrigin: null,
      message: "OneSignal app details could not be loaded.",
    };
  }

  if (!webPushConfigured) {
    return {
      configured: true,
      appIdPresent: true,
      restKeyPresent: true,
      webPushConfigured: false,
      originMatches: false,
      pushChannelEnabled,
      appName: appInfo.name ?? null,
      expectedOrigin,
      configuredOrigin: null,
      message:
        "The OneSignal app exists, but website push has not been fully configured yet.",
    };
  }

  if (!originMatches) {
    return {
      configured: true,
      appIdPresent: true,
      restKeyPresent: true,
      webPushConfigured: true,
      originMatches: false,
      pushChannelEnabled,
      appName: appInfo.name ?? null,
      expectedOrigin,
      configuredOrigin,
      message: `The OneSignal web push origin is set to ${configuredOrigin}, but this site is running on ${expectedOrigin}.`,
    };
  }

  return {
    configured: true,
    appIdPresent: true,
    restKeyPresent: true,
    webPushConfigured: true,
    originMatches: true,
    pushChannelEnabled,
    appName: appInfo.name ?? null,
    expectedOrigin,
    configuredOrigin,
    message: "OneSignal web push is configured for this site.",
  };
}

export async function getOneSignalWebPushStatus(): Promise<OneSignalWebPushStatus> {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID?.trim();
  const restKey = process.env.ONESIGNAL_REST_KEY?.trim();

  if (!appId || !restKey) {
    return {
      configured: false,
      appIdPresent: Boolean(appId),
      restKeyPresent: Boolean(restKey),
      webPushConfigured: false,
      originMatches: false,
      pushChannelEnabled: false,
      appName: null,
      expectedOrigin: toOrigin(APP_URL),
      configuredOrigin: null,
      message: "Missing OneSignal app credentials.",
    };
  }

  try {
    const response = await fetch(`${ONESIGNAL_APP_INFO_URL}/${appId}`, {
      headers: { Authorization: `Key ${restKey}` },
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as
      | OneSignalAppResponse
      | null;

    if (!response.ok) {
      return {
        configured: false,
        appIdPresent: true,
        restKeyPresent: true,
        webPushConfigured: false,
        originMatches: false,
        pushChannelEnabled: false,
        appName: null,
        expectedOrigin: toOrigin(APP_URL),
        configuredOrigin: null,
        message:
          (typeof data?.errors === "string" && data.errors) ||
          "Unable to load the OneSignal app configuration.",
      };
    }

    return summarizeOneSignalWebPushStatus(data, APP_URL);
  } catch (error) {
    return {
      configured: false,
      appIdPresent: true,
      restKeyPresent: true,
      webPushConfigured: false,
      originMatches: false,
      pushChannelEnabled: false,
      appName: null,
      expectedOrigin: toOrigin(APP_URL),
      configuredOrigin: null,
      message:
        error instanceof Error
          ? error.message
          : "Unable to reach the OneSignal app API.",
    };
  }
}
