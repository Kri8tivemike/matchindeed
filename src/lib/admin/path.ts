export const ADMIN_BASE_PATH = "/system1-console4";
export const ADMIN_LOGIN_PATH = `${ADMIN_BASE_PATH}/login`;
export const ADMIN_MFA_SETUP_PATH = `${ADMIN_BASE_PATH}/mfa-setup`;
export const INTERNAL_ADMIN_BASE_PATH = "/admin";
export const INTERNAL_ADMIN_LOGIN_PATH = `${INTERNAL_ADMIN_BASE_PATH}/login`;
export const INTERNAL_ADMIN_MFA_SETUP_PATH = `${INTERNAL_ADMIN_BASE_PATH}/mfa-setup`;

export function adminPath(path = "") {
  if (!path || path === "/") {
    return ADMIN_BASE_PATH;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ADMIN_BASE_PATH}${normalizedPath}`;
}

export function isAdminPathname(pathname: string | null | undefined) {
  if (!pathname) return false;
  return (
    pathname === ADMIN_BASE_PATH ||
    pathname.startsWith(`${ADMIN_BASE_PATH}/`) ||
    pathname === INTERNAL_ADMIN_BASE_PATH ||
    pathname.startsWith(`${INTERNAL_ADMIN_BASE_PATH}/`)
  );
}

export function matchesAdminPathname(
  pathname: string | null | undefined,
  publicPath: string,
  internalPath = `${INTERNAL_ADMIN_BASE_PATH}${publicPath.slice(ADMIN_BASE_PATH.length)}`
) {
  if (!pathname) return false;
  return pathname === publicPath || pathname === internalPath;
}

export function adminAbsoluteUrl(
  path = "",
  appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
) {
  const trimmedBase = appUrl.replace(/\/+$/, "");
  return `${trimmedBase}${adminPath(path)}`;
}
