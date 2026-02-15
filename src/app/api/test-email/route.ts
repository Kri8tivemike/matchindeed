/**
 * Test Email Endpoint (Development Only)
 *
 * Sends a test email using the Postmark integration to verify
 * the connection is working. Disabled in production.
 *
 * GET  /api/test-email              → sends a test "welcome" email to the admin
 * POST /api/test-email { to, template } → sends a specific template to a given address
 */

import { NextResponse } from "next/server";
import { sendEmail, isEmailServiceAvailable } from "@/lib/email";

const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Quick health check — GET request sends a welcome test email
 * to the address in the ADMIN_EMAILS env var.
 */
export async function GET() {
  if (!IS_DEV) {
    return NextResponse.json(
      { error: "Test endpoint is disabled in production" },
      { status: 403 }
    );
  }

  const adminEmail = (process.env.ADMIN_EMAILS || "").split(",")[0]?.trim();

  if (!adminEmail) {
    return NextResponse.json(
      { error: "No ADMIN_EMAILS configured — add at least one email to .env.local" },
      { status: 400 }
    );
  }

  const configured = isEmailServiceAvailable();

  const result = await sendEmail({
    to: adminEmail,
    template: "welcome",
    data: { recipientName: "Admin (Test)" },
    subject: "[TEST] Postmark Integration — Welcome Email",
  });

  return NextResponse.json({
    postmarkConfigured: configured,
    result,
    note: configured
      ? "Email sent via Postmark — check your inbox and Postmark Activity dashboard."
      : "POSTMARK_SERVER_TOKEN not set — email was logged to console instead (dev mode).",
  });
}

/**
 * POST request allows specifying recipient and template.
 *
 * Body: { to: string, template?: string, recipientName?: string }
 */
export async function POST(request: Request) {
  if (!IS_DEV) {
    return NextResponse.json(
      { error: "Test endpoint is disabled in production" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const to = body.to;
    const template = body.template || "welcome";
    const recipientName = body.recipientName || "Test User";

    if (!to) {
      return NextResponse.json(
        { error: "Missing 'to' email address in request body" },
        { status: 400 }
      );
    }

    const configured = isEmailServiceAvailable();

    const result = await sendEmail({
      to,
      template,
      data: {
        recipientName,
        // Provide common data fields so templates don't break
        partnerName: "Test Partner",
        meetingDate: new Date().toLocaleDateString(),
        meetingTime: "3:00 PM",
        requesterName: "Test Requester",
        meetingType: "Video Call",
        cancelledBy: "Test Admin",
        chargeAmount: "5 credits",
        meetingRef: "TEST-001",
        reason: "Testing cancellation charge template",
        creditAmount: "10",
        warningMessage: "This is a test warning message",
        timeUntil: "in 30 minutes",
      },
      subject: `[TEST] Postmark — ${template} template`,
    });

    return NextResponse.json({
      postmarkConfigured: configured,
      template,
      to,
      result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
