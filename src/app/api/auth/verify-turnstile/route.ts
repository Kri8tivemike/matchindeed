import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstileToken } from "@/lib/turnstile";

export async function POST(request: NextRequest) {
  // If no secret key configured, skip verification gracefully
  if (!process.env.TURNSTILE_SECRET_KEY) {
    return NextResponse.json({ success: true });
  }

  const body = await request.json().catch(() => ({}));
  const { token } = body as { token?: string };

  if (!token) {
    return NextResponse.json({ error: "Bot verification failed" }, { status: 403 });
  }

  const remoteIp =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined;

  const result = await verifyTurnstileToken(token, remoteIp);

  if (!result.success) {
    return NextResponse.json({ error: "Bot verification failed" }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
