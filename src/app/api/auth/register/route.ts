import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { checkSignupFraud } from "@/lib/ipqualityscore";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, lastName, turnstileToken } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    // Verify Cloudflare Turnstile token (bot protection)
    const turnstileResult = await verifyTurnstileToken(turnstileToken || "");
    if (!turnstileResult.success) {
      return NextResponse.json(
        { error: "Bot verification failed. Please refresh and try again." },
        { status: 403 }
      );
    }

    // IPQualityScore fraud check (disposable emails, VPNs, bots)
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const fraudResult = await checkSignupFraud(clientIp, email);
    if (!fraudResult.allowed) {
      return NextResponse.json(
        { error: fraudResult.reason || "Registration blocked due to suspicious activity." },
        { status: 403 }
      );
    }

    // Create Supabase admin client for user creation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create a regular client to trigger the verification email
    const supabaseClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Register user and automatically send verification email
    const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/verify-email`,
        data: {
          first_name: firstName || null,
          last_name: lastName || null,
        },
      },
    });

    if (signUpError) {
      const msg = signUpError.message;
      const isRateLimit =
        msg?.toLowerCase().includes("rate limit") ||
        msg?.toLowerCase().includes("email rate limit exceeded");
      const userMessage = isRateLimit
        ? "Verification email limit reached. Please try again in about an hour, or contact support."
        : msg;
      return NextResponse.json({ error: userMessage }, { status: 400 });
    }

    if (!signUpData.user) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    const userId = signUpData.user.id;

    // Create account record
    const { error: accountError } = await supabaseAdmin.from("accounts").upsert({
      id: userId,
      email: email,
      display_name: firstName || email.split("@")[0],
      tier: "basic",
      onboarding_complete: false,
    });

    if (accountError) {
      console.error("Account creation error:", accountError);
      // Continue anyway as account might already exist
    }

    // Initialize user profile
    const { error: profileError } = await supabaseAdmin.from("user_profiles").upsert({
      user_id: userId,
      email: email,
      first_name: firstName || null,
      last_name: lastName || null,
      profile_completed: false,
      onboarding_completed: false,
      preferences_completed: false,
    });

    if (profileError) {
      console.error("Profile creation error:", profileError);
    }

    // Initialize user progress
    const { error: progressError } = await supabaseAdmin.from("user_progress").upsert({
      user_id: userId,
      profile_completed: false,
      preferences_completed: false,
    });

    if (progressError) {
      console.error("Progress creation error:", progressError);
    }

    // Initialize wallet only if it doesn't exist
    const { data: existingWallet } = await supabaseAdmin
      .from("wallets")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (!existingWallet) {
      await supabaseAdmin.from("wallets").insert({
        user_id: userId,
        balance_cents: 0,
      });
    }

    // Initialize credits only if they don't exist
    const { data: existingCredits } = await supabaseAdmin
      .from("credits")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (!existingCredits) {
      await supabaseAdmin.from("credits").insert({
        user_id: userId,
        total: 0,
        used: 0,
        rollover: 0,
      });
    }

    // Return success with user data
    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: email,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred during registration" },
      { status: 500 }
    );
  }
}

