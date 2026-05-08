import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  hashEmailVerificationCode,
  verifyEmailVerificationToken,
} from "@/lib/auth/email-verification-links";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

function redirectToVerifyEmail(params: Record<string, string>) {
  const url = new URL("/verify-email", appUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return redirectToVerifyEmail({
      verified: "error",
      error: "Missing verification token.",
    });
  }

  try {
    const payload = verifyEmailVerificationToken(token);
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: verification, error: verificationError } = await supabase
      .from("email_verifications")
      .select("id, user_id, email, expires_at, used")
      .eq("user_id", payload.userId)
      .eq("email", payload.email)
      .eq("verification_code", hashEmailVerificationCode(payload.code))
      .eq("used", false)
      .maybeSingle();

    if (verificationError) {
      console.error("Email verification lookup error:", verificationError);
      return redirectToVerifyEmail({
        verified: "error",
        email: payload.email,
        error: "We could not verify this link. Please request a new one.",
      });
    }

    if (!verification) {
      return redirectToVerifyEmail({
        verified: "error",
        email: payload.email,
        error: "This verification link is invalid or has already been used.",
      });
    }

    if (new Date(verification.expires_at).getTime() <= Date.now()) {
      return redirectToVerifyEmail({
        verified: "expired",
        email: payload.email,
      });
    }

    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
      payload.userId,
      { email_confirm: true }
    );

    if (authUpdateError) {
      console.error("Email verification auth update error:", authUpdateError);
      return redirectToVerifyEmail({
        verified: "error",
        email: payload.email,
        error: "We could not confirm your email. Please request a new link.",
      });
    }

    const { error: accountUpdateError } = await supabase
      .from("accounts")
      .update({ email_verified: true })
      .eq("id", payload.userId);

    if (accountUpdateError) {
      console.error("Email verification account update error:", accountUpdateError);
    }

    const { error: tokenUpdateError } = await supabase
      .from("email_verifications")
      .update({ used: true })
      .eq("id", verification.id);

    if (tokenUpdateError) {
      console.error("Email verification token update error:", tokenUpdateError);
    }

    return redirectToVerifyEmail({
      verified: "true",
      email: payload.email,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid verification link.";
    const expired = message.toLowerCase().includes("expired");

    return redirectToVerifyEmail({
      verified: expired ? "expired" : "error",
      error: message,
    });
  }
}
