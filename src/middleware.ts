import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MAINTENANCE_MODE_ENABLED = false;
const MAINTENANCE_PATH = "/maintenance";
const NOINDEX_EXACT_PATHS = new Set([
  "/forgot-password",
  "/login",
  "/maintenance",
  "/register",
  "/reset-password",
  "/verify-email",
]);
const NOINDEX_PREFIXES = [
  "/admin",
  "/api",
  "/auth",
  "/coordinator",
  "/dashboard",
  "/growth-manager",
  "/host",
  "/meetops1-console7",
];

/**
 * Next.js Middleware — Security Headers & Rate Limiting Prep
 *
 * Adds security headers to all responses. Works alongside Cloudflare WAF/CDN.
 *
 * Cloudflare setup (external, no code):
 * 1. Point domain DNS to Cloudflare (NS records)
 * 2. Enable "Full (strict)" SSL mode
 * 3. Enable WAF managed rules
 * 4. Add rate limiting rule: /api/* → 100 req/min per IP
 * 5. Enable bot fight mode
 * 6. Cache static assets (JS, CSS, images)
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Defensive: if a Supabase password-recovery PKCE redirect lands on the
  // site root (which happens when /reset-password is not in the auth
  // allowlist, causing Supabase to fall back to the Site URL), forward to
  // /reset-password with the original auth params intact. The implicit-hash
  // flow is handled client-side in app/page.tsx — the hash never reaches
  // the server.
  if (pathname === "/") {
    const type = request.nextUrl.searchParams.get("type");
    const code = request.nextUrl.searchParams.get("code");
    if (type === "recovery" && code) {
      const recoveryUrl = request.nextUrl.clone();
      recoveryUrl.pathname = "/reset-password";
      return NextResponse.redirect(recoveryUrl);
    }
  }

  if (MAINTENANCE_MODE_ENABLED && pathname !== MAINTENANCE_PATH) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "maintenance_mode",
          message:
            "MatchIndeed is temporarily unavailable while maintenance is in progress.",
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": "3600",
          },
        }
      );
    }

    const maintenanceUrl = request.nextUrl.clone();
    maintenanceUrl.pathname = MAINTENANCE_PATH;
    maintenanceUrl.search = "";

    const response = NextResponse.rewrite(maintenanceUrl);
    response.headers.set("Cache-Control", "no-store");
    return applySecurityHeaders(request, response);
  }

  const response = NextResponse.next();
  return applySecurityHeaders(request, response);
}

function applySecurityHeaders(request: NextRequest, response: NextResponse) {
  const pathname = request.nextUrl.pathname;

  // Security headers (complement Cloudflare's edge-level protections)
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=(), interest-cohort=()"
  );

  // Strict Transport Security (2 years, include subdomains)
  if (request.nextUrl.protocol === "https:") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  if (
    NOINDEX_EXACT_PATHS.has(pathname) ||
    NOINDEX_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static files and _next internals
    "/((?!_next/static|_next/image|favicon.ico|maintenance|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)",
  ],
};
