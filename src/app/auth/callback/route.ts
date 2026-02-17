/**
 * OAuth Callback Route — MatchIndeed
 *
 * Handles the redirect from OAuth providers (Google, Facebook, Apple) after sign-in.
 * Exchanges the authorization code for a session and provisions account/wallet/credits
 * for new users. Redirects to dashboard or profile setup.
 *
 * Supabase redirect URLs must include this path in the allow list.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Validate next is a relative path to prevent open redirect
  const safeNext = next.startsWith("/") ? next : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_missing_code`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignore cookie errors in middleware
        }
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[Auth callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  const user = data.user;
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_no_user`);
  }

  // Provision account, wallet, credits for new OAuth users (same as email signup)
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const { data: existingAccount } = await supabaseAdmin
    .from("accounts")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingAccount) {
    const displayName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "User";

    const firstName = user.user_metadata?.given_name || user.user_metadata?.first_name || null;
    const lastName = user.user_metadata?.family_name || user.user_metadata?.last_name || null;

    await supabaseAdmin.from("accounts").insert({
      id: user.id,
      email: user.email,
      display_name: displayName,
      tier: "basic",
    });

    await supabaseAdmin.from("wallets").insert({
      user_id: user.id,
      balance_cents: 0,
    });

    await supabaseAdmin.from("credits").insert({
      user_id: user.id,
      total: 0,
      used: 0,
      rollover: 0,
    });

    // Create user_profile for OAuth users (matches email signup flow)
    await supabaseAdmin.from("user_profiles").upsert(
      {
        user_id: user.id,
        email: user.email,
        first_name: firstName,
        last_name: lastName,
      },
      { onConflict: "user_id" }
    );

    // Ensure user_progress exists for routing
    await supabaseAdmin.from("user_progress").upsert(
      { user_id: user.id, profile_completed: false, preferences_completed: false },
      { onConflict: "user_id" }
    );
  }

  // Determine redirect: profile setup if incomplete, else dashboard
  const { data: progress } = await supabaseAdmin
    .from("user_progress")
    .select("profile_completed, preferences_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  let redirectPath = safeNext;
  if (!progress?.profile_completed) {
    redirectPath = "/dashboard/profile/edit";
  } else if (!progress?.preferences_completed) {
    redirectPath = "/dashboard/profile/preferences";
  } else if (safeNext === "/dashboard") {
    redirectPath = "/dashboard/discover";
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";

  if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${redirectPath}`);
  }
  if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${redirectPath}`);
  }
  return NextResponse.redirect(`${origin}${redirectPath}`);
}
