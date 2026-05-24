import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { checkSignupFraud } from "@/lib/ipqualityscore";
import { getPasswordValidationError } from "@/lib/auth/validation";
import { validatePhotoBatch } from "@/lib/photo/validation";
import { evaluateAutomatedPhotoModeration } from "@/lib/photo/moderation";
import { isValidFirstName, normalizeFirstName } from "@/lib/name";
import {
  isLikelyGoogleSuggestedLocation,
  normalizeLocation,
} from "@/lib/location";
import {
  CIO_EVENTS,
  identifyCustomerSafely,
  trackCustomerEventSafely,
} from "@/lib/customerio";
import {
  calculateAge,
  MINIMUM_PLATFORM_AGE,
} from "@/lib/age-restrictions";
import { relationshipStatusToDbValue } from "@/lib/relationship-status";
import {
  getTargetGenderFromLookingFor,
  normalizeLookingForOption,
} from "@/lib/matching/interest-preference";
import { sendSignupConfirmationEmail } from "@/lib/email";
import { ensureBaselineUserRecords } from "@/lib/account-provisioning";
import { createReferralFromCode } from "@/lib/referrals/rewards";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type RegistrationPayload = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  turnstileToken: string;
  dateOfBirth: string;
  gender: string;
  location: string;
  ethnicity: string;
  religion: string;
  languages: string[];
  relationshipStatus: string;
  relationshipType: string;
  haveChildren: string;
  wantChildren: string;
  careerStability: string;
  readyForMarriage: string;
  willingToRelocate: string;
  loveLanguages: string[];
  selectedTier: string;
  photos: File[];
  initialLookingFor: string;
  referralCode?: string;
};

const ALLOWED_GENDER = ["male", "female", "other", "prefer_not_to_say"];
const ALLOWED_CHILDREN_PREFERENCE = ["yes", "no", "maybe", "undecided"];
const ALLOWED_MARRIAGE_READINESS = ["yes", "no", "not_sure"];
const ALLOWED_RELOCATION = ["yes", "no", "maybe"];
const ALLOWED_TIERS = ["basic", "standard", "premium", "vip"];

function toStringOrEmpty(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function parseStringArray(raw: string): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
    }
  } catch {
    // Fallback to CSV parsing.
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEnum(value: string, allowed: string[]) {
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : "";
}

function normalizeDate(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function extractFileExt(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function uploadPhotos(
  supabaseAdmin: SupabaseClient,
  userId: string,
  photos: File[]
): Promise<{ visibleUrls: string[]; rejectedCount: number }> {
  if (photos.length === 0) {
    return { visibleUrls: [], rejectedCount: 0 };
  }

  const visibleUrls: string[] = [];
  let rejectedCount = 0;

  for (let index = 0; index < photos.length; index += 1) {
    const file = photos[index];
    const ext = extractFileExt(file);
    const filePath = `${userId}/registration_${Date.now()}_${index}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from("profile-images")
      .upload(filePath, bytes, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[register] photo upload error:", uploadError);
      continue;
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("profile-images").getPublicUrl(filePath);

    if (!publicUrl) continue;

    const moderation = await evaluateAutomatedPhotoModeration(file, {
      publicUrl,
    });
    if (moderation.status === "rejected") {
      rejectedCount += 1;
    } else {
      visibleUrls.push(publicUrl);
    }

    await supabaseAdmin.from("photo_moderation").insert({
      user_id: userId,
      photo_url: publicUrl,
      status: moderation.status,
      review_reason: moderation.reason,
    });
  }

  return { visibleUrls, rejectedCount };
}

async function parsePayload(request: NextRequest): Promise<RegistrationPayload> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const photos = formData
      .getAll("photos")
      .filter((item): item is File => item instanceof File);

    return {
      email: toStringOrEmpty(formData.get("email")),
      password: toStringOrEmpty(formData.get("password")),
      firstName: toStringOrEmpty(formData.get("firstName")),
      lastName: toStringOrEmpty(formData.get("lastName")),
      turnstileToken: toStringOrEmpty(formData.get("turnstileToken")),
      dateOfBirth: toStringOrEmpty(formData.get("dateOfBirth")),
      gender: toStringOrEmpty(formData.get("gender")),
      location: toStringOrEmpty(formData.get("location")),
      ethnicity: toStringOrEmpty(formData.get("ethnicity")),
      religion: toStringOrEmpty(formData.get("religion")),
      languages: parseStringArray(toStringOrEmpty(formData.get("languages"))),
      relationshipStatus: toStringOrEmpty(formData.get("relationshipStatus")),
      relationshipType: toStringOrEmpty(formData.get("relationshipType")),
      haveChildren: toStringOrEmpty(formData.get("haveChildren")),
      wantChildren: toStringOrEmpty(formData.get("wantChildren")),
      careerStability: toStringOrEmpty(formData.get("careerStability")),
      readyForMarriage: toStringOrEmpty(formData.get("readyForMarriage")),
      willingToRelocate: toStringOrEmpty(formData.get("willingToRelocate")),
      loveLanguages: parseStringArray(toStringOrEmpty(formData.get("loveLanguages"))),
      selectedTier: toStringOrEmpty(formData.get("selectedTier")),
      photos,
      initialLookingFor: toStringOrEmpty(formData.get("initialLookingFor")),
      referralCode: toStringOrEmpty(formData.get("referralCode")),
    };
  }

  const body = (await request.json()) as Partial<RegistrationPayload>;

  return {
    email: (body.email || "").trim(),
    password: body.password || "",
    firstName: (body.firstName || "").trim(),
    lastName: (body.lastName || "").trim(),
    turnstileToken: body.turnstileToken || "",
    dateOfBirth: (body.dateOfBirth || "").trim(),
    gender: (body.gender || "").trim(),
    location: (body.location || "").trim(),
    ethnicity: (body.ethnicity || "").trim(),
    religion: (body.religion || "").trim(),
    languages: Array.isArray(body.languages) ? body.languages : [],
    relationshipStatus: (body.relationshipStatus || "").trim(),
    relationshipType: (body.relationshipType || "").trim(),
    haveChildren: (body.haveChildren || "").trim(),
    wantChildren: (body.wantChildren || "").trim(),
    careerStability: (body.careerStability || "").trim(),
    readyForMarriage: (body.readyForMarriage || "").trim(),
    willingToRelocate: (body.willingToRelocate || "").trim(),
    loveLanguages: Array.isArray(body.loveLanguages) ? body.loveLanguages : [],
    selectedTier: (body.selectedTier || "").trim(),
    photos: [],
    initialLookingFor: (body.initialLookingFor || "").trim(),
    referralCode: (body.referralCode || "").trim(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parsePayload(request);
    const normalizedFirstName = normalizeFirstName(payload.firstName || "");
    const normalizedLastName = normalizeFirstName(payload.lastName || "");
    const normalizedLocation = normalizeLocation(payload.location || "");

    if (!payload.email || !payload.password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (normalizedFirstName && !isValidFirstName(normalizedFirstName)) {
      return NextResponse.json(
        { error: "First name must contain only letters (2-50 characters)." },
        { status: 400 }
      );
    }

    if (
      normalizedLocation &&
      !isLikelyGoogleSuggestedLocation(normalizedLocation)
    ) {
      return NextResponse.json(
        { error: "Please select location from Google suggestions." },
        { status: 400 }
      );
    }

    const passwordError = getPasswordValidationError(payload.password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const photoValidation = validatePhotoBatch(payload.photos);
    if (!photoValidation.valid) {
      return NextResponse.json(
        { error: photoValidation.errors[0] || "Invalid photo upload" },
        { status: 400 }
      );
    }

    const turnstileResult = await verifyTurnstileToken(payload.turnstileToken || "");
    if (!turnstileResult.success) {
      return NextResponse.json(
        { error: "Bot verification failed. Please refresh and try again." },
        { status: 403 }
      );
    }

    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const fraudResult = await checkSignupFraud(clientIp, payload.email);
    if (!fraudResult.allowed) {
      return NextResponse.json(
        {
          error:
            fraudResult.reason ||
            "Registration blocked due to suspicious activity.",
        },
        { status: 403 }
      );
    }

    const normalizedGender = normalizeEnum(payload.gender, ALLOWED_GENDER);
    const normalizedRelationshipStatus = relationshipStatusToDbValue(payload.relationshipStatus);
    const normalizedLookingFor = normalizeLookingForOption(payload.initialLookingFor);
    const normalizedPartnerGender = getTargetGenderFromLookingFor(normalizedLookingFor);
    const normalizedWantChildren = normalizeEnum(
      payload.wantChildren,
      ALLOWED_CHILDREN_PREFERENCE
    );
    const normalizedMarriageReadiness = normalizeEnum(
      payload.readyForMarriage,
      ALLOWED_MARRIAGE_READINESS
    );
    const normalizedRelocation = normalizeEnum(
      payload.willingToRelocate,
      ALLOWED_RELOCATION
    );
    const normalizedTier = normalizeEnum(payload.selectedTier, ALLOWED_TIERS) || "basic";

    const normalizedHaveChildren = payload.haveChildren === "yes"
      ? true
      : payload.haveChildren === "no"
      ? false
      : null;

    const normalizedDateOfBirth = normalizeDate(payload.dateOfBirth);
    if (payload.dateOfBirth && !normalizedDateOfBirth) {
      return NextResponse.json(
        { error: "Please provide a valid date of birth." },
        { status: 400 }
      );
    }
    if (normalizedDateOfBirth) {
      const age = calculateAge(normalizedDateOfBirth);
      if (age === null || age < MINIMUM_PLATFORM_AGE) {
        return NextResponse.json(
          {
            error: `You must be at least ${MINIMUM_PLATFORM_AGE} years old to use MatchIndeed.`,
          },
          { status: 400 }
        );
      }
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: signUpData, error: signUpError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email: payload.email,
        password: payload.password,
        options: {
          redirectTo: `${
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"
          }/verify-email`,
          data: {
            first_name: normalizedFirstName || null,
            last_name: normalizedLastName || null,
            selected_tier_preference: normalizedTier,
          },
        },
      });

    if (signUpError || !signUpData?.properties?.action_link || !signUpData.user) {
      const msg = signUpError?.message || "Failed to create verification link";
      const isRateLimit =
        msg?.toLowerCase().includes("rate limit") ||
        msg?.toLowerCase().includes("email rate limit exceeded");
      const userMessage = isRateLimit
        ? "Verification email limit reached. Please try again in about an hour, or contact support."
        : msg;
      return NextResponse.json({ error: userMessage }, { status: 400 });
    }

    const userId = signUpData.user.id;
    const confirmationUrl = signUpData.properties.action_link;

    const emailResult = await sendSignupConfirmationEmail(payload.email, {
      recipientName: normalizedFirstName || payload.email.split("@")[0],
      confirmationUrl,
    });

    if (!emailResult.success) {
      console.error("Signup confirmation email error:", emailResult.error);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch((deleteError) => {
        console.error("Failed to rollback auth user after email error:", deleteError);
      });
      return NextResponse.json(
        {
          error:
            "We created your account, but could not send the confirmation email. Please try again.",
        },
        { status: 500 }
      );
    }

    const uploadResult = await uploadPhotos(supabaseAdmin, userId, payload.photos);
    const uploadedPhotoUrls = uploadResult.visibleUrls;

    const accountProvisioningResult = await ensureBaselineUserRecords(
      supabaseAdmin,
      { id: userId, email: payload.email },
      normalizedFirstName || payload.email.split("@")[0]
    );

    if (!accountProvisioningResult.ok) {
      console.error("Account creation error:", accountProvisioningResult);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch((deleteError) => {
        console.error(
          "Failed to rollback auth user after provisioning error:",
          deleteError
        );
      });
      return NextResponse.json(
        {
          error:
            accountProvisioningResult.error ||
            "We couldn't finish creating your account right now. Please try again.",
        },
        { status: accountProvisioningResult.status || 500 }
      );
    } else {
      const { error: onboardingFlagError } = await supabaseAdmin
        .from("accounts")
        .update({ onboarding_complete: false })
        .eq("id", userId);

      if (onboardingFlagError) {
        console.error("Account onboarding flag error:", onboardingFlagError);
      }
    }

    const { error: profileError } = await supabaseAdmin.from("user_profiles").upsert({
      user_id: userId,
      email: payload.email,
      first_name: normalizedFirstName || null,
      last_name: normalizedLastName || null,
      date_of_birth: normalizedDateOfBirth || null,
      gender: normalizedGender || null,
      location: normalizedLocation || null,
      ethnicity: payload.ethnicity || null,
      religion: payload.religion || null,
      languages: payload.languages.length > 0 ? payload.languages : null,
      relationship_status: normalizedRelationshipStatus || null,
      relationship_type: payload.relationshipType || null,
      have_children: normalizedHaveChildren,
      want_children: normalizedWantChildren || null,
      career_stability: payload.careerStability || null,
      ready_for_marriage: normalizedMarriageReadiness || null,
      willing_to_relocate: normalizedRelocation || null,
      love_languages: payload.loveLanguages.length > 0 ? payload.loveLanguages : null,
      profile_photo_url: uploadedPhotoUrls[0] || null,
      photos: uploadedPhotoUrls.length > 0 ? uploadedPhotoUrls : null,
      profile_completed: false,
      onboarding_completed: false,
      preferences_completed: false,
    });

    if (profileError) {
      console.error("Profile creation error:", profileError);
    }

    const preferencesSeed: Record<string, unknown> = {
      user_id: userId,
    };
    if (normalizedPartnerGender) {
      preferencesSeed.partner_gender_preference = normalizedPartnerGender;
    }

    const { error: preferenceSeedError } = await supabaseAdmin
      .from("user_preferences")
      .upsert(preferencesSeed, { onConflict: "user_id" });

    if (preferenceSeedError?.code === "42703" && normalizedPartnerGender) {
      const legacySeed: Record<string, unknown> = {
        user_id: userId,
        // Backward-compatible fallback when the new column migration has not run yet.
        partner_experience: normalizedPartnerGender,
      };
      const { error: legacySeedError } = await supabaseAdmin
        .from("user_preferences")
        .upsert(legacySeed, { onConflict: "user_id" });
      if (legacySeedError) {
        console.error("Legacy preference seed error:", legacySeedError);
      }
    } else if (preferenceSeedError) {
      console.error("Preference seed error:", preferenceSeedError);
    }

    const { error: progressError } = await supabaseAdmin.from("user_progress").upsert({
      user_id: userId,
      profile_completed: false,
      preferences_completed: false,
    });

    if (progressError) {
      console.error("Progress creation error:", progressError);
    }

    if (payload.referralCode) {
      await createReferralFromCode(supabaseAdmin, {
        referredUserId: userId,
        referralCode: payload.referralCode,
        metadata: {
          source: "register_api",
          client_ip: clientIp,
        },
      }).catch((referralError) => {
        console.warn("[register] referral capture skipped:", referralError);
      });
    }

    await Promise.allSettled([
      identifyCustomerSafely(userId, {
        email: payload.email,
        first_name: normalizedFirstName || undefined,
        last_name: normalizedLastName || undefined,
        profile_completed: false,
        city: normalizedLocation || undefined,
        gender: normalizedGender || undefined,
        created_at: Math.floor(Date.now() / 1000),
      }),
      trackCustomerEventSafely(userId, CIO_EVENTS.SIGNED_UP, {
        selected_tier: normalizedTier,
        looking_for: normalizedLookingFor || null,
        partner_gender_preference: normalizedPartnerGender || null,
        uploaded_photos: uploadedPhotoUrls.length,
        rejected_photos: uploadResult.rejectedCount,
      }),
    ]);

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: payload.email,
      },
      onboarding: {
        preferred_tier: normalizedTier,
        looking_for: normalizedLookingFor || null,
        partner_gender_preference: normalizedPartnerGender || null,
        uploaded_photos: uploadedPhotoUrls.length,
        rejected_photos: uploadResult.rejectedCount,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An error occurred during registration",
      },
      { status: 500 }
    );
  }
}
