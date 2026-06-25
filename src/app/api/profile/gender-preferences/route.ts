import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendGenderSettingUpdatedEmail } from "@/lib/email";
import { getPreferredEmailRecipientName } from "@/lib/email-recipient-name";
import {
  getGenderChangeStatus,
  normalizePartnerGenderPreference,
  normalizeProfileGender,
} from "@/lib/profile/gender-change";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const VERIFICATION_MIN_LENGTH = 20;

function extractBearerToken(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.replace("Bearer ", "");
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

function resolveRecipientName(
  user: {
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  },
  firstName: string | null | undefined
) {
  return getPreferredEmailRecipientName({
    profileFirstName: firstName,
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

async function loadGenderPreferences(userId: string) {
  const [{ data: profile, error: profileError }, { data: preferences, error: preferencesError }] =
    await Promise.all([
      supabaseAdmin
        .from("user_profiles")
        .select("user_id, first_name, gender")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_preferences")
        .select("partner_gender_preference")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  if (profileError) throw profileError;
  if (preferencesError && preferencesError.code !== "PGRST116") {
    throw preferencesError;
  }

  const status = await getGenderChangeStatus(supabaseAdmin, userId);
  return {
    profile: {
      gender: typeof profile?.gender === "string" ? profile.gender : null,
      firstName: typeof profile?.first_name === "string" ? profile.first_name : null,
    },
    preferences: {
      partnerGenderPreference:
        typeof preferences?.partner_gender_preference === "string"
          ? preferences.partner_gender_preference
          : null,
    },
    genderChangeStatus: status,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const payload = await loadGenderPreferences(user.id);
    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error("[profile/gender-preferences] GET failed:", error);
    return NextResponse.json(
      { error: "Failed to load gender preferences" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const partnerGenderPreference = normalizePartnerGenderPreference(
      body && typeof body === "object"
        ? (body as { partnerGenderPreference?: unknown }).partnerGenderPreference
        : null
    );

    if (!partnerGenderPreference) {
      return NextResponse.json(
        { error: "partnerGenderPreference must be male or female" },
        { status: 400 }
      );
    }

    const { error: upsertError } = await supabaseAdmin
      .from("user_preferences")
      .upsert(
        {
          user_id: user.id,
          partner_gender_preference: partnerGenderPreference,
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      throw upsertError;
    }

    return NextResponse.json({
      success: true,
      partnerGenderPreference,
    });
  } catch (error) {
    console.error("[profile/gender-preferences] PATCH failed:", error);
    return NextResponse.json(
      { error: "Failed to update Show Me preference" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const requestedGender = normalizeProfileGender(
      body && typeof body === "object"
        ? (body as { gender?: unknown }).gender
        : null
    );
    const verificationStatement =
      body && typeof body === "object" && typeof (body as { verificationStatement?: unknown }).verificationStatement === "string"
        ? (body as { verificationStatement: string }).verificationStatement.trim()
        : "";

    if (!requestedGender) {
      return NextResponse.json({ error: "Invalid gender value" }, { status: 400 });
    }

    if (verificationStatement.length < VERIFICATION_MIN_LENGTH) {
      return NextResponse.json(
        {
          error:
            "Please add a verification statement explaining why this gender setting should be changed.",
          code: "GENDER_CHANGE_VERIFICATION_REQUIRED",
        },
        { status: 400 }
      );
    }

    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("gender, first_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    const previousGender = normalizeProfileGender(existingProfile?.gender);
    if (!previousGender || previousGender === requestedGender) {
      return NextResponse.json({
        success: true,
        genderChange: { changed: false },
        ...(await loadGenderPreferences(user.id)),
      });
    }

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

    const { error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update({ gender: requestedGender })
      .eq("user_id", user.id);

    if (updateError) {
      throw updateError;
    }

    const { data: event } = await supabaseAdmin
      .from("gender_change_events")
      .select("id, metadata, pause_until")
      .eq("user_id", user.id)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let emailSent = false;
    let emailSkipped = false;
    let emailError: string | null = null;

    if (user.email) {
      const emailResult = await sendGenderSettingUpdatedEmail(user.email, {
        recipientName: resolveRecipientName(user, existingProfile?.first_name),
      });
      emailSent = emailResult.success && !emailResult.skipped;
      emailSkipped = Boolean(emailResult.skipped);
      emailError = emailResult.error || null;
    }

    if (event?.id) {
      const previousMetadata =
        event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
          ? (event.metadata as Record<string, unknown>)
          : {};
      await supabaseAdmin
        .from("gender_change_events")
        .update({
          status: "pending_approval",
          verification_completed_at: new Date().toISOString(),
          email_sent_at: emailSent ? new Date().toISOString() : null,
          email_error: emailError,
          metadata: {
            ...previousMetadata,
            verification_statement: verificationStatement,
            submitted_from: "gender_preferences_settings",
          },
        })
        .eq("id", event.id);
    }

    const nextStatus = await getGenderChangeStatus(supabaseAdmin, user.id);
    return NextResponse.json({
      success: true,
      genderChange: {
        changed: true,
        pauseUntil: nextStatus.pauseUntil,
        nextEligibleAt: nextStatus.nextEligibleAt,
        status: nextStatus.status,
        emailSent,
        emailSkipped,
        emailError,
      },
      ...(await loadGenderPreferences(user.id)),
    });
  } catch (error) {
    console.error("[profile/gender-preferences] POST failed:", error);
    return NextResponse.json(
      { error: "Failed to submit gender change for review" },
      { status: 500 }
    );
  }
}
