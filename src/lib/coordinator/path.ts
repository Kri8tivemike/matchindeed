export const COORDINATOR_DASHBOARD_PATH = "/coordinator/dashboard";
export const COORDINATOR_LOGIN_PATH = "/meetops1-console7";
export const COORDINATOR_MFA_SETUP_PATH = "/coordinator/mfa-setup";

export function coordinatorLoginUrl(next = COORDINATOR_DASHBOARD_PATH) {
  return `${COORDINATOR_LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
