import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_MFA_RECOVERY_ACTIONS = {
  generated: "admin_mfa_recovery_code_generated",
  used: "admin_mfa_recovery_code_used",
  deleted: "admin_mfa_recovery_code_deleted",
} as const;

export type AdminMfaRecoveryLogRow = {
  action: string;
  created_at: string;
  meta: Record<string, unknown> | null;
};

export function normalizeAdminRecoveryCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function generateAdminRecoveryCode() {
  const segments = Array.from({ length: 4 }, () =>
    randomBytes(2).toString("hex").toUpperCase()
  );
  return `MI-${segments.join("-")}`;
}

export function hashAdminRecoveryCode(code: string) {
  return createHash("sha256")
    .update(normalizeAdminRecoveryCode(code))
    .digest("hex");
}

export function matchesAdminRecoveryCode(input: string, storedHash: string) {
  const computed = Buffer.from(hashAdminRecoveryCode(input), "hex");
  const stored = Buffer.from(storedHash, "hex");

  if (computed.length !== stored.length) {
    return false;
  }

  return timingSafeEqual(computed, stored);
}

export function resolveAdminRecoveryStatus(
  row: AdminMfaRecoveryLogRow | null
) {
  if (!row) {
    return {
      hasRecoveryCode: false,
      active: false,
      createdAt: null as string | null,
      usedAt: null as string | null,
      codeHash: null as string | null,
    };
  }

  if (row.action === ADMIN_MFA_RECOVERY_ACTIONS.generated) {
    const codeHash =
      typeof row.meta?.code_hash === "string" ? row.meta.code_hash : null;

    return {
      hasRecoveryCode: !!codeHash,
      active: !!codeHash,
      createdAt: row.created_at,
      usedAt: null as string | null,
      codeHash,
    };
  }

  if (row.action === ADMIN_MFA_RECOVERY_ACTIONS.used) {
    return {
      hasRecoveryCode: false,
      active: false,
      createdAt: null as string | null,
      usedAt: row.created_at,
      codeHash: null as string | null,
    };
  }

  return {
    hasRecoveryCode: false,
    active: false,
    createdAt: null as string | null,
    usedAt: null as string | null,
    codeHash: null as string | null,
  };
}
