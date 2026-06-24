import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendGenderSettingUpdatedEmail } from "@/lib/email";
import { getPreferredEmailRecipientName } from "@/lib/email-recipient-name";
import {
  getGenderChangeStatus,
  normalizeProfileGender,
} from "@/lib/profile/gender-change";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type ProfileNameRow = {
  first_name: string | null;
};

function extractBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.replace("Bearer ", "");
}

function normalizeErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message || "");
  }
  return "";
}

function resolveRecipientName(
  user: {
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  },
  profile: ProfileNameRow | null | undefined
) {
  return getPreferredEmailRecipientName({
    profileFirstName: profile?.first_name,
    authGivenName:
      typeof user.user_metadata?.given_name === "string"
        ? user.user_metadata.given_name
        : null,
    authFirstName:
      typeof user.user_metadata?.first_name === "string"
        ? user.user_metadata.first_name
        : null,
    authDisplayName:
      typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : null,
    authFullName:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null,
    email: user.email,
  });
}

async function getAuthenticatedUser(req: NextRequest) {
  const token = extractBearerToken(req);
  if (!token) {
    return { user: null, error: "Missing or invalid authorization header" };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { user: null, error: "Invalid or expired session" };
  }

  return { user: data.user, error: null };
}

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const profileInput =
      body && typeof body === "object" && "profile" in body
        ? (body as { profile?: unknown }).profile
        : null;

    if (!profileInput || typeof profileInput !== "object" || Array.isArray(profileInput)) {
      return NextResponse.json({ error: "Invalid profile payload" }, { status: 400 });
    }

    const profileUpdate: Record<string, unknown> & { user_id: string } = {
      ...(profileInput as Record<string, unknown>),
      user_id: user.id,
    };

    const requestedGender = normalizeProfileGender(profileUpdate.gender);
    if (!requestedGender) {
      return NextResponse.json({ error: "Invalid gender value" }, { status: 400 });
    }
    profileUpdate.gender = requestedGender;

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from("user_profiles")
      .select("gender, first_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingProfileError) {
      console.error("[profile/update] failed to load current profile:", existingProfileError);
      return NextResponse.json({ error: "Failed to load current profile" }, { status: 500 });
    }

    const previousGender = normalizeProfileGender(existingProfile?.gender);
    const genderChanged = Boolean(previousGender && previousGender !== requestedGender);

    if (genderChanged) {
      const status = await getGenderChangeStatus(supabaseAdmin, user.id);
      if (!status.canChange) {
        return NextResponse.json(
          {
            error: "Gender can only be changed once every 90 days.",
            code: "GENDER_CHANGE_COOLDOWN",
            nextEligibleAt: status.nextEligibleAt,
          },
          { status: 429 }
        );
      }
    }

    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .upsert(profileUpdate, { onConflict: "user_id" });

    if (profileError) {
      const message = normalizeErrorMessage(profileError);
      if (/Gender can only be changed once every 90 days/i.test(message)) {
        return NextResponse.json(
          {
            error: "Gender can only be changed once every 90 days.",
            code: "GENDER_CHANGE_COOLDOWN",
            detail: message,
          },
          { status: 429 }
        );
      }

      console.error("[profile/update] failed to save profile:", profileError);
      return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
    }

    let genderChange:
      | {
          changed: boolean;
          pauseUntil: string | null;
          nextEligibleAt: string | null;
          emailSent: boolean;
          emailSkipped?: boolean;
          emailError?: string | null;
        }
      | undefined;

    if (genderChanged) {
      const status = await getGenderChangeStatus(supabaseAdmin, user.id);
      const { data: event } = await supabaseAdmin
        .from("gender_change_events")
        .select("id")
        .eq("user_id", user.id)
        .order("changed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let emailSent = false;
      let emailSkipped = false;
      let emailError: string | null = null;

      if (user.email) {
        const recipientName = resolveRecipientName(user, {
          first_name:
            typeof profileUpdate.first_name === "string"
              ? profileUpdate.first_name
              : existingProfile?.first_name || null,
        });

        const emailResult = await sendGenderSettingUpdatedEmail(user.email, {
          recipientName,
        });

        emailSent = emailResult.success && !emailResult.skipped;
        emailSkipped = Boolean(emailResult.skipped);
        emailError = emailResult.error || null;

        if (event?.id) {
          await supabaseAdmin
            .from("gender_change_events")
            .update({
              email_sent_at: emailSent ? new Date().toISOString() : null,
              email_error: emailError,
            })
            .eq("id", event.id);
        }
      }

      genderChange = {
        changed: true,
        pauseUntil: status.pauseUntil,
        nextEligibleAt: status.nextEligibleAt,
        emailSent,
        emailSkipped,
        emailError,
      };
    }

    return NextResponse.json({
      success: true,
      genderChange: genderChange || { changed: false },
    });
  } catch (error) {
    console.error("[profile/update] unexpected error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
