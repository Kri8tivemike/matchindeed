import { NextRequest, NextResponse } from "next/server";

/** Derive currency from 2-letter country code */
function countryToCurrency(cc: string): "ngn" | "usd" | "gbp" {
  const upper = (cc || "").toUpperCase();
  if (upper === "NG") return "ngn";
  if (upper === "GB" || upper === "UK") return "gbp";
  return "usd";
}

/** Extract client IP from request headers (set by proxies: Vercel, Cloudflare, Tailscale, etc.) */
function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && !isLocalhost(first)) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real && !isLocalhost(real)) return real;
  const cf = request.headers.get("cf-connecting-ip");
  if (cf && !isLocalhost(cf)) return cf;
  return null;
}

function isLocalhost(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower === "127.0.0.1" || lower === "::1" || lower.startsWith("localhost");
}

/**
 * GET /api/geo
 *
 * Returns user's country and currency based on IP.
 * Uses: (1) Vercel/Cloudflare geo headers when available, (2) ipapi.co with client IP.
 *
 * Returns: { country_code, currency }
 * - Nigeria (NG) → currency: "ngn"
 * - UK (GB) → currency: "gbp"
 * - Else → currency: "usd"
 */
export async function GET(request: NextRequest) {
  try {
    // Prefer platform geo headers (Vercel, Cloudflare) — no external API call
    const vercelCountry = request.headers.get("x-vercel-ip-country");
    const cfCountry = request.headers.get("cf-ipcountry");
    const ccHeader = vercelCountry || cfCountry;
    if (ccHeader && ccHeader !== "XX" && ccHeader.length === 2) {
      const currency = countryToCurrency(ccHeader);
      return NextResponse.json({ country_code: ccHeader.toUpperCase(), currency });
    }

    // Fallback: ipapi.co using client IP (from x-forwarded-for, x-real-ip, etc.)
    const clientIp = getClientIp(request);
    const url = clientIp
      ? `https://ipapi.co/${encodeURIComponent(clientIp)}/json/`
      : "https://ipapi.co/json/";
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await res.json();

    if (data.error) {
      return NextResponse.json({ country_code: null, currency: "usd" }, { status: 200 });
    }

    const cc = (data.country_code || "").toUpperCase();
    const currency = countryToCurrency(cc || "");
    return NextResponse.json({ country_code: cc || null, currency });
  } catch (err) {
    console.error("Geo API error:", err);
    return NextResponse.json(
      { country_code: null, currency: "usd" },
      { status: 200 }
    );
  }
}
