export type MeetingRequestAvailabilityAccount = {
  account_status?: string | null;
  profile_visible?: boolean | null;
  calendar_enabled?: boolean | null;
};

export const NO_ACTIVE_MEETING_AVAILABILITY_TEXT =
  "This member has no active availability right now.";

export const NO_ACTIVE_MEETING_AVAILABILITY_BUTTON_LABEL =
  "No active availability";

export const MEETING_REQUEST_LEAD_TIME_HOURS = 48;

export function getMinimumRequestableMeetingStartDate(from = new Date()) {
  return new Date(
    from.getTime() + MEETING_REQUEST_LEAD_TIME_HOURS * 60 * 60 * 1000
  );
}

export function getMinimumRequestableMeetingStartIso(from = new Date()) {
  return getMinimumRequestableMeetingStartDate(from).toISOString();
}

export function hasRequestableMeetingAvailability(
  account: MeetingRequestAvailabilityAccount | null | undefined,
  hasFutureSlots: boolean
) {
  if (!hasFutureSlots) {
    return false;
  }

  const accountStatus = String(account?.account_status || "active").toLowerCase();

  return (
    accountStatus === "active" &&
    account?.profile_visible !== false &&
    account?.calendar_enabled !== false
  );
}
