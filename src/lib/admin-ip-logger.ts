/**
 * Admin IP Logger
 *
 * Helper to extract and log client IP for admin actions.
 * Use in API routes that perform admin operations.
 */

import { NextRequest } from "next/server";

/**
 * Extract client IP from request headers.
 * Handles proxies (x-forwarded-for, x-real-ip, Cloudflare).
 */
export function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    null
  );
}
