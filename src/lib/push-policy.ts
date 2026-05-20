const MINUTE = 60 * 1000;

const QUIET_WINDOW_BY_TYPE: Record<string, number> = {
  like: 2 * MINUTE,
  wink: 2 * MINUTE,
  interested: 2 * MINUTE,
  mutual_match: 2 * MINUTE,
  profile_view: 3 * MINUTE,
  people_near_you: 30 * MINUTE,
};

export function getPushQuietWindowMs(type: string): number {
  return QUIET_WINDOW_BY_TYPE[type] ?? 0;
}

export function shouldQuietPushForRecentActivity(
  type: string,
  lastActiveAt: string | null | undefined,
  now = Date.now()
): boolean {
  const quietWindowMs = getPushQuietWindowMs(type);
  if (quietWindowMs <= 0 || !lastActiveAt) {
    return false;
  }

  const lastActiveMs = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(lastActiveMs)) {
    return false;
  }

  return Math.abs(now - lastActiveMs) < quietWindowMs;
}
