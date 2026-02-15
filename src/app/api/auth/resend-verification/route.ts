import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * API endpoint to resend email verification.
 * Uses the anon key with supabase.auth.resend() which triggers Supabase's email service.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Resend verification email
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/verify-email`,
      },
    });

    if (resendError) {
      console.error("Resend error:", resendError);
      return NextResponse.json({ error: resendError.message }, { status: 400 });
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
