import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, lastName } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    // Create Supabase admin client for user creation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for now
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    const userId = authData.user.id;

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

    // Initialize wallet
    await supabaseAdmin.from("wallets").upsert({
      user_id: userId,
      balance_cents: 0,
    });

    // Initialize credits
    await supabaseAdmin.from("credits").upsert({
      user_id: userId,
      total: 0,
      used: 0,
      rollover: 0,
    });

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

