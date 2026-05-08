export const ONE_SIGNAL_ENABLE_TIMEOUT_MS = 15000;
const ONE_SIGNAL_READY_POLL_MS = 250;

export type PushEnablePhase =
  | "idle"
  | "starting"
  | "waiting_permission"
  | "finalizing";

export type EnableBrowserPushResult =
  | { status: "enabled"; message: string }
  | {
      status:
        | "not_configured"
        | "origin_mismatch"
        | "channel_disabled"
        | "not_supported"
        | "blocked"
        | "timed_out"
        | "subscription_pending"
        | "error";
      message: string;
    };

export function getPushEnableButtonLabel(
  pushBusy: boolean,
  phase: PushEnablePhase
) {
  if (!pushBusy) {
    return "Enable browser push";
  }

  if (phase === "waiting_permission") {
    return "Waiting for browser...";
  }

  return "Enabling...";
}

export function describePushEnableTimeout(options: {
  permission: NotificationPermission | "unsupported";
  promptShown: boolean;
  prePromptAccepted?: boolean;
}) {
  const {
    permission,
    promptShown,
    prePromptAccepted = false,
  } = options;

  if (permission === "denied") {
    return "Browser push is blocked for MatchIndeed. Allow notifications in your browser's site settings, then try again.";
  }

  if (prePromptAccepted && !promptShown) {
    return "Your browser did not open the notification popup after you selected Enable Notifications. Check the address bar or browser site settings, then try again.";
  }

  if (permission === "default" && promptShown) {
    return "The browser notification prompt is still waiting for a response. Check the prompt or your browser's site controls, then try again.";
  }

  if (permission === "default") {
    return "Your browser is suppressing the notification prompt. Make sure notifications are allowed for sites and that you are not in private or incognito mode, then try again.";
  }

  return "Browser push is taking longer than expected. Refresh the page and try again.";
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function findActiveOneSignalRegistration() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  return (
    registrations.find((registration) =>
      registration.active?.scriptURL?.includes("OneSignalSDK")
    ) ?? null
  );
}

export async function waitForOneSignalWorkerReady(timeoutMs: number) {
  return withTimeout(
    (async () => {
      while (true) {
        const registration = await findActiveOneSignalRegistration();
        if (registration?.active) {
          return registration;
        }

        await sleep(ONE_SIGNAL_READY_POLL_MS);
      }
    })(),
    timeoutMs,
    "onesignal-worker-timeout"
  );
}

export async function waitForOneSignalSubscriptionReady(options: {
  subscription: {
    id: string | null | undefined;
    token: string | null | undefined;
    optedIn: boolean | undefined;
    addEventListener: (
      event: "change",
      listener: (change: {
        current: {
          id: string | null | undefined;
          token: string | null | undefined;
          optedIn: boolean;
        };
      }) => void
    ) => void;
    removeEventListener: (
      event: "change",
      listener: (change: {
        current: {
          id: string | null | undefined;
          token: string | null | undefined;
          optedIn: boolean;
        };
      }) => void
    ) => void;
  };
  timeoutMs: number;
}) {
  const { subscription, timeoutMs } = options;

  if (subscription.optedIn && subscription.id && subscription.token) {
    return {
      id: subscription.id,
      token: subscription.token,
    };
  }

  let resolveReady:
    | ((value: { id: string; token: string }) => void)
    | null = null;

  const handleChange = (change: {
    current: {
      id: string | null | undefined;
      token: string | null | undefined;
      optedIn: boolean;
    };
  }) => {
    const current = change.current;
    if (current.optedIn && current.id && current.token) {
      subscription.removeEventListener("change", handleChange);
      resolveReady?.({
        id: current.id,
        token: current.token,
      });
    }
  };

  try {
    subscription.addEventListener("change", handleChange);
    return await withTimeout(
      new Promise<{ id: string; token: string }>((resolve) => {
        resolveReady = resolve;
      }),
      timeoutMs,
      "push-subscription-timeout"
    );
  } finally {
    subscription.removeEventListener("change", handleChange);
  }
}

export async function enableBrowserPush(options: {
  webPushConfigured: boolean;
  originMatches: boolean;
  pushChannelEnabled: boolean;
  prePromptAccepted?: boolean;
  onPhaseChange?: (phase: PushEnablePhase) => void;
}): Promise<EnableBrowserPushResult> {
  const {
    webPushConfigured,
    originMatches,
    pushChannelEnabled,
    prePromptAccepted = false,
    onPhaseChange,
  } = options;

  onPhaseChange?.("starting");

  if (!webPushConfigured) {
    onPhaseChange?.("idle");
    return {
      status: "not_configured",
      message: "Browser push is not configured yet for MatchIndeed",
    };
  }

  if (!originMatches) {
    onPhaseChange?.("idle");
    return {
      status: "origin_mismatch",
      message: "The OneSignal web origin does not match this site",
    };
  }

  if (!pushChannelEnabled) {
    onPhaseChange?.("idle");
    return {
      status: "channel_disabled",
      message: "The OneSignal push channel is not enabled yet",
    };
  }

  const OneSignalModule = await import("react-onesignal");
  const OneSignal = OneSignalModule.default;
  let promptShown = false;

  const handlePromptDisplay = () => {
    promptShown = true;
    onPhaseChange?.("waiting_permission");
  };

  const handlePermissionChange = (granted: boolean) => {
    onPhaseChange?.(granted ? "finalizing" : "starting");
  };

  OneSignal.Notifications.addEventListener(
    "permissionPromptDisplay",
    handlePromptDisplay
  );
  OneSignal.Notifications.addEventListener(
    "permissionChange",
    handlePermissionChange
  );

  try {
    if (!OneSignal.Notifications.isPushSupported()) {
      return {
        status: "not_supported",
        message: "Push notifications are not supported in this browser",
      };
    }

    await waitForOneSignalWorkerReady(ONE_SIGNAL_ENABLE_TIMEOUT_MS);

    const permission = OneSignal.Notifications.permissionNative;

    if (permission === "default") {
      onPhaseChange?.("waiting_permission");
      await withTimeout(
        OneSignal.Notifications.requestPermission(),
        ONE_SIGNAL_ENABLE_TIMEOUT_MS,
        "push-enable-timeout"
      );
    }

    if (
      OneSignal.Notifications.permissionNative === "granted" &&
      !OneSignal.User.PushSubscription.optedIn
    ) {
      await withTimeout(
        OneSignal.User.PushSubscription.optIn(),
        ONE_SIGNAL_ENABLE_TIMEOUT_MS,
        "push-enable-timeout"
      );
    }

    onPhaseChange?.("finalizing");
    await waitForOneSignalSubscriptionReady({
      subscription: OneSignal.User.PushSubscription,
      timeoutMs: ONE_SIGNAL_ENABLE_TIMEOUT_MS,
    });

    const currentPermission = OneSignal.Notifications.permissionNative;
    const optedIn = Boolean(OneSignal.User.PushSubscription.optedIn);
    const token = OneSignal.User.PushSubscription.token;

    if (optedIn && token) {
      return {
        status: "enabled",
        message: "Browser push notifications enabled",
      };
    }

    if (currentPermission === "denied") {
      return {
        status: "blocked",
        message:
          "Browser push is blocked for MatchIndeed. Allow notifications in your browser's site settings, then try again.",
      };
    }

    if (currentPermission === "default") {
      return {
        status: "timed_out",
        message: describePushEnableTimeout({
          permission: currentPermission,
          promptShown,
          prePromptAccepted,
        }),
      };
    }

    return {
      status: "error",
      message: "Browser push could not be enabled on this device yet",
    };
  } catch (error) {
    const permission = OneSignal.Notifications.permissionNative;
    const optedIn = Boolean(OneSignal.User.PushSubscription.optedIn);

    if (optedIn) {
      return {
        status: "enabled",
        message: "Browser push notifications enabled",
      };
    }

    if (
      error instanceof Error &&
      (error.message === "push-enable-timeout" ||
        error.message === "onesignal-worker-timeout")
    ) {
      return {
        status: "timed_out",
        message: describePushEnableTimeout({
          permission,
          promptShown,
          prePromptAccepted,
        }),
      };
    }

    if (
      error instanceof Error &&
      error.message === "push-subscription-timeout"
    ) {
      return {
        status: "subscription_pending",
        message:
          "The browser granted permission, but this device subscription was not activated yet. Refresh the page and try again.",
      };
    }

    if (permission === "denied") {
      return {
        status: "blocked",
        message:
          "Browser push is blocked for MatchIndeed. Allow notifications in your browser's site settings, then try again.",
      };
    }

    return {
      status: "error",
      message: "Unable to enable browser push notifications",
    };
  } finally {
    OneSignal.Notifications.removeEventListener(
      "permissionPromptDisplay",
      handlePromptDisplay
    );
    OneSignal.Notifications.removeEventListener(
      "permissionChange",
      handlePermissionChange
    );
    onPhaseChange?.("idle");
  }
}
