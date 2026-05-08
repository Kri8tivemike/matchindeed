import { normalizeTier } from "@/lib/credits/config";

export const TECHNICAL_GRACE_PERIOD_MINUTES = 4;
const CANCELLATION_FEE_CREDITS_BY_TIER = {
  basic: 4,
  standard: 6,
  premium: 8,
  vip: 10,
} as const;

type CancellationValidationInput = {
  meetingStatus: string;
  userTier?: string | null;
  isAdmin?: boolean;
  isHostCanceller?: boolean;
  cancellationFeeCents?: number | null;
  meetingFeeCents?: number | null;
  confirmed?: boolean;
};

export type CancellationValidationResult = {
  allowed: boolean;
  status: number;
  code?: string;
  message?: string;
  requiresConfirmation?: boolean;
  cancellationFeeCents: number;
  shouldRefundRequesterCredits: boolean;
};

type FinalizationValidationInput = {
  outcome: string;
  fault: string;
  chargeDecision: string;
  technicalFaultProven?: boolean;
  gracePeriodWaitedMinutes?: number | null;
  meetingMatched?: boolean | null;
};

export type FinalizationValidationResult = {
  allowed: boolean;
  status: number;
  code?: string;
  message?: string;
  normalizedChargeDecision: "capture" | "refund" | "pending_review";
  shouldRefundRequester: boolean;
};

function isCancellationAllowedByTier() {
  return true;
}

export function getCancellationFeeCredits(rawTier?: string | null) {
  const tier = normalizeTier(rawTier);
  return CANCELLATION_FEE_CREDITS_BY_TIER[tier];
}

export function evaluateCancellationPolicy(
  input: CancellationValidationInput
): CancellationValidationResult {
  const isConfirmed = input.meetingStatus === "confirmed";
  const normalizedFee = getCancellationFeeCredits(input.userTier);

  if (!["pending", "confirmed"].includes(input.meetingStatus)) {
    return {
      allowed: false,
      status: 400,
      code: "invalid_meeting_status",
      message: `Cannot cancel this meeting because it is already ${input.meetingStatus}.`,
      cancellationFeeCents: normalizedFee,
      shouldRefundRequesterCredits: false,
    };
  }

  if (!isCancellationAllowedByTier()) {
    return {
      allowed: false,
      status: 403,
      code: "tier_cancellation_forbidden",
      message:
        "Your current subscription tier does not allow meeting cancellations.",
      cancellationFeeCents: normalizedFee,
      shouldRefundRequesterCredits: false,
    };
  }

  const requiresConfirmation = isConfirmed || normalizedFee > 0;
  if (requiresConfirmation && !input.confirmed) {
    return {
      allowed: false,
      status: 422,
      code: "cancellation_requires_confirmation",
      message: isConfirmed
        ? "This confirmed meeting cancellation requires explicit confirmation and may incur penalties."
        : `Cancelling this meeting incurs a fee of ${(normalizedFee / 100).toFixed(2)}. Please confirm to proceed.`,
      requiresConfirmation: true,
      cancellationFeeCents: normalizedFee,
      shouldRefundRequesterCredits: false,
    };
  }

  return {
    allowed: true,
    status: 200,
    cancellationFeeCents: normalizedFee,
    shouldRefundRequesterCredits: !isConfirmed,
  };
}

function normalizeChargeDecision(
  value: string
): "capture" | "refund" | "pending_review" {
  if (value === "refund" || value === "pending_review") {
    return value;
  }
  return "capture";
}

export function evaluateFinalizationPolicy(
  input: FinalizationValidationInput
): FinalizationValidationResult {
  const normalizedChargeDecision = normalizeChargeDecision(input.chargeDecision);
  const graceMinutes = input.gracePeriodWaitedMinutes || 0;
  const technicalFaultProven = !!input.technicalFaultProven;
  const meetingMatched = !!input.meetingMatched;

  if (
    input.outcome === "network_disconnect" &&
    normalizedChargeDecision === "capture" &&
    graceMinutes < TECHNICAL_GRACE_PERIOD_MINUTES
  ) {
    return {
      allowed: false,
      status: 422,
      code: "grace_period_not_met",
      message: `A ${TECHNICAL_GRACE_PERIOD_MINUTES}-minute grace period is required before applying capture for network disconnect outcomes.`,
      normalizedChargeDecision,
      shouldRefundRequester: false,
    };
  }

  if (
    technicalFaultProven &&
    input.outcome === "network_disconnect" &&
    normalizedChargeDecision === "capture"
  ) {
    return {
      allowed: false,
      status: 422,
      code: "technical_fault_requires_refund",
      message:
        "Proven technical faults cannot be captured; use refund or pending_review.",
      normalizedChargeDecision,
      shouldRefundRequester: false,
    };
  }

  if (input.fault === "accepter_fault" && normalizedChargeDecision === "capture") {
    return {
      allowed: false,
      status: 422,
      code: "accepter_fault_requires_refund_or_review",
      message:
        "Accepter-fault outcomes must be resolved by refund or pending review.",
      normalizedChargeDecision,
      shouldRefundRequester: false,
    };
  }

  if (
    input.outcome === "early_leave" &&
    !meetingMatched &&
    normalizedChargeDecision === "refund"
  ) {
    return {
      allowed: false,
      status: 422,
      code: "early_leave_penalty_expected",
      message:
        "Early leave scenarios should not auto-refund unless both participants already confirmed a match.",
      normalizedChargeDecision,
      shouldRefundRequester: false,
    };
  }

  if (
    input.outcome === "early_leave" &&
    meetingMatched &&
    normalizedChargeDecision === "capture"
  ) {
    return {
      allowed: false,
      status: 422,
      code: "matched_early_leave_no_penalty",
      message:
        "Early leave penalties should not be captured when both participants already confirmed a match.",
      normalizedChargeDecision,
      shouldRefundRequester: false,
    };
  }

  const shouldRefundRequester =
    normalizedChargeDecision === "refund" || technicalFaultProven;

  return {
    allowed: true,
    status: 200,
    normalizedChargeDecision,
    shouldRefundRequester,
  };
}
