import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSignupConfirmationEmail } from "@/lib/email";
import {
  createEmailVerificationCode,
  createEmailVerificationToken,
  hashEmailVerificationCode,
} from "@/lib/auth/email-verification-links";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

/**
 * API endpoint to resend email verification.
 * Uses the app's branded Resend template instead of Supabase's hosted
 * default Auth template.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = (await request.json()) as { email?: string };
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id, email, display_name")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (accountError) {
      console.error("Resend verification account lookup error:", accountError);
      return NextResponse.json(
        { error: "Failed to resend verification email" },
        { status: 500 }
      );
    }

    // Avoid account enumeration. The UI should show the same success message
    // even if the address is not registered.
    if (!account) {
      return NextResponse.json({
        success: true,
        message: "Verification email sent! Please check your inbox (and spam folder).",
      });
    }

    const code = createEmailVerificationCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase
      .from("email_verifications")
      .insert({
        user_id: account.id,
        email: account.email,
        verification_code: hashEmailVerificationCode(code),
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("Resend verification token insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create verification link" },
        { status: 500 }
      );
    }

    const token = createEmailVerificationToken({
      userId: account.id,
      email: account.email,
      code,
    });
    const confirmationUrl = `${appUrl}/api/auth/confirm-email?token=${encodeURIComponent(token)}`;
    const emailResult = await sendSignupConfirmationEmail(account.email, {
      recipientName:
        account.display_name?.trim() || account.email.split("@")[0] || "there",
      confirmationUrl,
    });

    if (!emailResult.success) {
      console.error("Resend verification email error:", emailResult.error);
      return NextResponse.json(
        { error: "Failed to send verification email" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Verification email sent! Please check your inbox (and spam folder).",
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resend verification email" },
      { status: 500 }
    );
  }
}
