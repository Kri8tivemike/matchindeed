import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
  const response = NextResponse.next();

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

  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except static files and _next internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)",
  ],
};
