export type AccountModerationAction = "suspend" | "ban" | "active";

export type ModeratedAccount = {
  id: string;
  role: string | null;
  account_status: string | null;
  suspended_until: string | null;
  suspension_reason: string | null;
};

const PERMANENT_BAN_DURATION = "876000h";

export function normalizeModerationReason(
  reason: unknown,
  fallback: string
): string {
  if (typeof reason !== "string") return fallback;
  const normalized = reason.trim().slice(0, 500);
  return normalized || fallback;
}

export function normalizeSuspensionDays(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(365, Math.max(1, Math.trunc(parsed)));
}

export function getModerationTargetError(
  admin: { userId: string; role: string },
  target: ModeratedAccount
): string | null {
  if (admin.userId === target.id) {
    return "You cannot change the status of your own account.";
  }

  if (
    ["admin", "superadmin"].includes(String(target.role || "")) &&
    admin.role !== "superadmin"
  ) {
    return "Only a super admin can change another administrator's status.";
  }

  return null;
}

export function getAuthBanDurationForAccount(
  account: Pick<ModeratedAccount, "account_status" | "suspended_until">,
  now = new Date()
): string {
  const status = String(account.account_status || "active").toLowerCase();
  if (status === "banned") return PERMANENT_BAN_DURATION;
  if (status !== "suspended" || !account.suspended_until) return "none";

  const until = new Date(account.suspended_until);
  if (Number.isNaN(until.getTime()) || until <= now) return "none";

  const remainingHours = Math.max(
    1,
    Math.ceil((until.getTime() - now.getTime()) / (60 * 60 * 1000))
  );
  return `${remainingHours}h`;
}

export function isExpiredSuspension(
  account: Pick<ModeratedAccount, "account_status" | "suspended_until">,
  now = new Date()
): boolean {
  if (String(account.account_status || "").toLowerCase() !== "suspended") {
    return false;
  }
  if (!account.suspended_until) return false;

  const until = new Date(account.suspended_until);
  return !Number.isNaN(until.getTime()) && until <= now;
}

export function buildAccountModerationChange(
  action: AccountModerationAction,
  reason: unknown,
  days: unknown,
  now = new Date()
) {
  if (action === "active") {
    return {
      update: {
        account_status: "active",
        suspended_until: null,
        suspension_reason: null,
      },
      authBanDuration: "none",
      auditAction: "user_activated",
      notification: {
        title: "Account Activated",
        message: "Your account has been reactivated.",
      },
    } as const;
  }

  if (action === "ban") {
    const normalizedReason = normalizeModerationReason(
      reason,
      "Banned by admin"
    );
    return {
      update: {
        account_status: "banned",
        suspended_until: null,
        suspension_reason: normalizedReason,
      },
      authBanDuration: PERMANENT_BAN_DURATION,
      auditAction: "user_banned",
      notification: {
        title: "Account Banned",
        message: `Your account has been banned. Reason: ${normalizedReason}`,
      },
    } as const;
  }

  const suspensionDays = normalizeSuspensionDays(days);
  const suspendedUntil = new Date(now);
  suspendedUntil.setUTCDate(suspendedUntil.getUTCDate() + suspensionDays);
  const normalizedReason = normalizeModerationReason(
    reason,
    "Suspended by admin"
  );

  return {
    update: {
      account_status: "suspended",
      suspended_until: suspendedUntil.toISOString(),
      suspension_reason: normalizedReason,
    },
    authBanDuration: `${suspensionDays * 24}h`,
    auditAction: "user_suspended",
    notification: {
      title: "Account Suspended",
      message: `Your account has been suspended for ${suspensionDays} day${
        suspensionDays === 1 ? "" : "s"
      }. Reason: ${normalizedReason}`,
    },
    suspensionDays,
  } as const;
}

export function getInactiveAccountMessage(
  status: string | null | undefined,
  suspendedUntil?: string | null
): string | null {
  const normalizedStatus = String(status || "active").toLowerCase();
  if (normalizedStatus === "active") return null;

  if (normalizedStatus === "suspended") {
    const until = suspendedUntil ? new Date(suspendedUntil) : null;
    if (
      isExpiredSuspension({
        account_status: normalizedStatus,
        suspended_until: suspendedUntil || null,
      })
    ) {
      return null;
    }
    const dateLabel =
      until && !Number.isNaN(until.getTime())
        ? ` until ${until.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          })}`
        : "";
    return `Your MatchIndeed account is suspended${dateLabel}. Contact support if you need help.`;
  }

  if (normalizedStatus === "banned") {
    return "Your MatchIndeed account has been banned. Contact support if you believe this is an error.";
  }

  return "Your MatchIndeed account is not active. Contact support if you need help.";
}
