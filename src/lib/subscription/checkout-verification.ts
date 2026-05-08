type TierId = "basic" | "standard" | "premium" | "vip";

export type SubscriptionActivationSnapshot = {
  activeTier: string | null;
  hasActiveMembership: boolean;
};

export type VerifySubscriptionApiResult = {
  success: boolean;
  retryable?: boolean;
  message?: string;
  tier?: string;
};

export type ResolvedSubscriptionActivationResult = {
  success: boolean;
  retryable: boolean;
  message: string;
};

function normalizeTier(rawTier: string | null | undefined): TierId | null {
  switch ((rawTier || "").toLowerCase()) {
    case "basic":
    case "standard":
    case "premium":
    case "vip":
      return rawTier!.toLowerCase() as TierId;
    default:
      return null;
  }
}

export function resolveSubscriptionActivationResult(
  apiResult: VerifySubscriptionApiResult,
  snapshot: SubscriptionActivationSnapshot
): ResolvedSubscriptionActivationResult {
  const expectedTier = normalizeTier(apiResult.tier);
  const activeTier = normalizeTier(snapshot.activeTier);
  const hasExpectedActiveMembership =
    snapshot.hasActiveMembership &&
    (!expectedTier || (activeTier !== null && activeTier === expectedTier));

  if (apiResult.success && hasExpectedActiveMembership) {
    return {
      success: true,
      retryable: false,
      message: apiResult.message || "Subscription activated successfully.",
    };
  }

  if (apiResult.success) {
    return {
      success: false,
      retryable: true,
      message:
        "Payment confirmed. We're finalizing your subscription and updating your account now.",
    };
  }

  return {
    success: false,
    retryable: Boolean(apiResult.retryable),
    message:
      apiResult.message || "We couldn't verify your subscription right now.",
  };
}
