import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { storeFingerprint, checkFingerprintFraud } from "@/lib/fingerprint";

/**
 * POST /api/fingerprint
 *
 * Receives a FingerprintJS visitorId from the client and:
 * 1. Stores the fingerprint event
 * 2. Runs fraud checks (banned device, multi-account abuse)
 *
 * Body: { visitorId: string, eventType: "signup" | "login" | "profile_edit" | "payment" | "message" }
 */
export async function POST(request: NextRequest) {
  try {
    const { visitorId, eventType } = await request.json();

    if (!visitorId || !eventType) {
      return NextResponse.json(
        { error: "visitorId and eventType are required" },
        { status: 400 }
      );
    }

    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // Read-only in route handlers
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Run fraud checks
    const fraudCheck = await checkFingerprintFraud(visitorId);
    if (!fraudCheck.allowed) {
      return NextResponse.json(
        { error: "Access denied", reason: fraudCheck.reason },
        { status: 403 }
      );
    }

    // Store the fingerprint event
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
               request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    await storeFingerprint({
      userId: user.id,
      visitorId,
      ipAddress: ip,
      userAgent,
      eventType,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Fingerprint API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
