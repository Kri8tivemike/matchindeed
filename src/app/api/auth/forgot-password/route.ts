import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { sendPasswordResetEmail } from "@/lib/email";
import { getPreferredEmailRecipientName } from "@/lib/email-recipient-name";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type ProfileNameRow = {
  first_name: string | null;
};

function isUserNotFoundError(message?: string) {
  const normalized = message?.toLowerCase() || "";
  return (
    normalized.includes("user not found") ||
    normalized.includes("email not found") ||
    normalized.includes("email address not found")
  );
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const redirectTo = new URL("/reset-password", request.nextUrl.origin).toString();
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: {
        redirectTo,
      },
    });

    if (error) {
      if (isUserNotFoundError(error.message)) {
        return NextResponse.json({
          success: true,
          message: "If an account exists for that email, a reset link has been sent.",
        });
      }

      console.error("Password recovery link generation failed:", error);
      return NextResponse.json(
        { error: "Unable to send a reset email right now. Please try again shortly." },
        { status: 500 }
      );
    }

    const resetUrl = data.properties?.action_link;
    if (!resetUrl) {
      console.error("Password recovery link missing action_link", { email: normalizedEmail });
      return NextResponse.json(
        { error: "Unable to send a reset email right now. Please try again shortly." },
        { status: 500 }
      );
    }

    const userMetadata = data.user?.user_metadata || {};

    let profile: ProfileNameRow | null = null;
    if (data.user?.id) {
      const { data: profileRow } = await supabaseAdmin
        .from("user_profiles")
        .select("first_name")
        .eq("user_id", data.user.id)
        .maybeSingle();

      profile = (profileRow || null) as ProfileNameRow | null;
    }

    const recipientName = getPreferredEmailRecipientName({
      profileFirstName: profile?.first_name,
      authGivenName:
        typeof userMetadata.given_name === "string" ? userMetadata.given_name : null,
      authFirstName:
        typeof userMetadata.first_name === "string" ? userMetadata.first_name : null,
      authDisplayName:
        typeof userMetadata.display_name === "string" ? userMetadata.display_name : null,
      authFullName:
        typeof userMetadata.full_name === "string"
          ? userMetadata.full_name
          : typeof userMetadata.name === "string"
            ? userMetadata.name
            : null,
      email: normalizedEmail,
    });

    const emailResult = await sendPasswordResetEmail(normalizedEmail, {
      recipientName,
      resetUrl,
    });

    if (!emailResult.success) {
      console.error("Password reset email send failed:", emailResult.error);
      return NextResponse.json(
        { error: "Unable to send a reset email right now. Please try again shortly." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password request failed:", error);
    return NextResponse.json(
      { error: "Unable to process your request right now. Please try again shortly." },
      { status: 500 }
    );
  }
}
