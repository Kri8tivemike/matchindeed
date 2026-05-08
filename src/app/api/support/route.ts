import { NextRequest, NextResponse } from "next/server";
import { sendRawHtmlEmail } from "@/lib/email";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "help@matchindeed.com";

const ALLOWED_REASONS = new Set([
  "Account Login Issue",
  "Profile Verification",
  "Payment / Subscription",
  "Report a User",
  "Technical Problem",
  "Delete My Account",
  "General Question",
  "Other",
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!fullName || !email || !reason || !message) {
      return NextResponse.json(
        { error: "Full name, email address, reason, and issue details are required." },
        { status: 400 }
      );
    }

    if (!ALLOWED_REASONS.has(reason)) {
      return NextResponse.json(
        { error: "Please choose a valid support reason." },
        { status: 400 }
      );
    }

    const subject = `MatchIndeed Support: ${reason}`;
    const html = `
      <div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;color:#1f2937;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;padding:32px;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
          <div style="margin-bottom:24px;">
            <img src="${process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com"}/matchindeed-logo-black-font.png" alt="MatchIndeed" style="width:170px;height:auto;display:block;" />
          </div>
          <h1 style="margin:0 0 12px;font-size:24px;color:#111827;">New support request</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
            A new support request was submitted from MatchIndeed.
          </p>

          <div style="background:#eef4ff;border:1px solid #d7e4ff;border-radius:14px;padding:18px 20px;margin-bottom:20px;">
            <p style="margin:0 0 8px;"><strong>Full name:</strong> ${escapeHtml(fullName)}</p>
            <p style="margin:0 0 8px;"><strong>Email address:</strong> ${escapeHtml(email)}</p>
            <p style="margin:0;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>
          </div>

          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 20px;">
            <p style="margin:0 0 10px;font-weight:700;color:#111827;">Issue details</p>
            <p style="margin:0;font-size:15px;line-height:1.7;color:#374151;white-space:pre-wrap;">${escapeHtml(message)}</p>
          </div>
        </div>
      </div>
    `.trim();

    const result = await sendRawHtmlEmail(SUPPORT_EMAIL, subject, html);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "We couldn't send your support request right now." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/support:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
