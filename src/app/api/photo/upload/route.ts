import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MAX_PHOTOS, validatePhotoBatch } from "@/lib/photo/validation";
import {
  evaluateAutomatedPhotoModeration,
  evaluateRemotePhotoUrlModeration,
} from "@/lib/photo/moderation";
import { getSafeDisplayName, normalizeFirstName } from "@/lib/name";
import {
  getAccountState,
  resolveOwnInteractionBlockMessage,
} from "@/lib/account-interactions";
import { ensureBaselineUserRecords } from "@/lib/account-provisioning";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ExistingProfileRow = {
  photos?: unknown;
  profile_photo_url?: string | null;
};

function extractFileExt(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext) return ext;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";
  return "jpg";
}

function extractStoragePathFromPublicUrl(photoUrl: string): string | null {
  const marker = "/storage/v1/object/public/profile-images/";
  const markerIndex = photoUrl.indexOf(marker);
  if (markerIndex === -1) return null;

  const pathPart = photoUrl
    .slice(markerIndex + marker.length)
    .split("?")[0]
    .trim();

  if (!pathPart) return null;
  return decodeURIComponent(pathPart);
}

function isOwnedStoragePhotoUrl(photoUrl: string, userId: string): boolean {
  const storagePath = extractStoragePathFromPublicUrl(photoUrl);
  return typeof storagePath === "string" && storagePath.startsWith(`${userId}/`);
}

function normalizeProfilePhotos(profile: ExistingProfileRow | null): string[] {
  const profilePhotos = Array.isArray(profile?.photos) ? profile.photos : [];
  return profilePhotos.filter((url): url is string => typeof url === "string");
}

function getGalleryPhotos(profile: ExistingProfileRow | null): string[] {
  const merged: string[] = [];
  const primaryPhoto =
    typeof profile?.profile_photo_url === "string"
      ? profile.profile_photo_url.trim()
      : "";

  if (primaryPhoto) {
    merged.push(primaryPhoto);
  }

  for (const photo of normalizeProfilePhotos(profile)) {
    if (!merged.includes(photo)) {
      merged.push(photo);
    }
  }

  return merged;
}

async function fetchExistingProfile(userId: string): Promise<ExistingProfileRow | null> {
  const { data } = await supabase
    .from("user_profiles")
    .select("photos, profile_photo_url")
    .eq("user_id", userId)
    .maybeSingle();

  return (data as ExistingProfileRow | null) || null;
}

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

async function ensureUserAccount(user: Awaited<ReturnType<typeof getAuthUser>>) {
  if (!user) return { ok: false as const, error: "Unauthorized" };

  const existingAccount = await getAccountState(supabase, user.id);

  if (existingAccount) {
    const blockMessage = resolveOwnInteractionBlockMessage(existingAccount);
    if (blockMessage) {
      return {
        ok: false as const,
        status: 403,
        code: "account_deactivated",
        error:
          "Your MatchIndeed account is currently deactivated. Reactivate your account to upload photos and continue your profile.",
      };
    }
    return { ok: true as const };
  }

  const normalizedFirstName = normalizeFirstName(
    typeof user.user_metadata?.first_name === "string"
      ? user.user_metadata.first_name
      : ""
  );
  const fallbackName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : user.email?.split("@")[0] || null;

  const displayName = getSafeDisplayName(
    normalizedFirstName || null,
    fallbackName
  );

  const baselineResult = await ensureBaselineUserRecords(supabase, user, displayName);
  if (!baselineResult.ok) {
    return {
      ok: false as const,
      status: baselineResult.status,
      code: baselineResult.code,
      error:
        baselineResult.code === "account_email_conflict"
          ? baselineResult.error
          : "We couldn't prepare your account for photo upload. Please try again.",
    };
  }

  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accountReady = await ensureUserAccount(user);
    if (!accountReady.ok) {
      return NextResponse.json(
        { error: accountReady.error, code: accountReady.code },
        { status: accountReady.status || 500 }
      );
    }

    const formData = await request.formData();
    const modeValue = formData.get("mode");
    const standaloneMode =
      typeof modeValue === "string" &&
      modeValue.trim().toLowerCase() === "standalone";

    const photos = formData
      .getAll("photos")
      .filter((item): item is File => item instanceof File);

    if (photos.length === 0) {
      return NextResponse.json(
        { error: "At least one photo is required" },
        { status: 400 }
      );
    }

    const validation = validatePhotoBatch(photos);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.errors[0] || "Invalid photos" },
        { status: 400 }
      );
    }

    let existingProfile: ExistingProfileRow | null = null;
    let currentPhotos: string[] = [];

    if (!standaloneMode) {
      existingProfile = await fetchExistingProfile(user.id);
      currentPhotos = getGalleryPhotos(existingProfile);

      if (currentPhotos.length + photos.length > MAX_PHOTOS) {
        return NextResponse.json(
          { error: `You can only keep up to ${MAX_PHOTOS} photos.` },
          { status: 400 }
        );
      }
    }

    const uploadedUrls: string[] = [];
    const errors: string[] = [];
    let rejectedCount = 0;
    for (let index = 0; index < photos.length; index += 1) {
      const file = photos[index];
      const ext = extractFileExt(file);
      const filePath = `${user.id}/upload_${Date.now()}_${index}.${ext}`;
      const bytes = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("profile-images")
        .upload(filePath, bytes, {
          contentType: file.type || "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        console.error("[photo/upload] storage error:", uploadError);
        errors.push(`${file.name}: ${uploadError.message || "upload failed"}`);
        continue;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("profile-images").getPublicUrl(filePath);

      if (!publicUrl) {
        errors.push(`${file.name}: could not get uploaded photo URL`);
        continue;
      }

      const moderation = await evaluateAutomatedPhotoModeration(file, {
        publicUrl,
      });

      const { error: moderationInsertError } = await supabase
        .from("photo_moderation")
        .insert({
          user_id: user.id,
          photo_url: publicUrl,
          status: moderation.status,
          review_reason: moderation.reason,
        });

      if (moderationInsertError) {
        console.error(
          "[photo/upload] moderation insert error:",
          moderationInsertError
        );
        errors.push(
          `${file.name}: Photo was uploaded but could not be verified. Please try again.`
        );

        const cleanupPath = extractStoragePathFromPublicUrl(publicUrl);
        if (cleanupPath && cleanupPath.startsWith(`${user.id}/`)) {
          const { error: cleanupError } = await supabase.storage
            .from("profile-images")
            .remove([cleanupPath]);
          if (cleanupError) {
            console.error("[photo/upload] cleanup remove error:", cleanupError);
          }
        }
        continue;
      }

      if (moderation.status === "rejected") {
        rejectedCount += 1;
        errors.push(
          `${file.name}: ${moderation.reason || "Photo failed moderation checks."}`
        );
      } else {
        uploadedUrls.push(publicUrl);
      }
    }

    if (uploadedUrls.length === 0) {
      const message =
        rejectedCount > 0
          ? "Uploaded photos failed moderation checks. Please use clear, real photos of yourself."
          : "Failed to upload photos";
      if (rejectedCount > 0) {
        return NextResponse.json(
          {
            success: false,
            code: "MODERATION_REJECTED",
            error: message,
            errors,
            uploaded: 0,
            rejected: rejectedCount,
            uploaded_urls: [],
          },
          { status: 200 }
        );
      }

      return NextResponse.json({ success: false, error: message, errors }, { status: 400 });
    }

    if (standaloneMode) {
      return NextResponse.json({
        success: true,
        uploaded: uploadedUrls.length,
        rejected: rejectedCount,
        uploaded_urls: uploadedUrls,
        errors,
      });
    }

    const mergedPhotos = [...currentPhotos, ...uploadedUrls].slice(0, MAX_PHOTOS);
    const profilePhotoUrl =
      (existingProfile?.profile_photo_url as string | null) || mergedPhotos[0] || null;

    const { error: profileUpdateError } = await supabase
      .from("user_profiles")
      .update({
        photos: mergedPhotos,
        profile_photo_url: profilePhotoUrl,
      })
      .eq("user_id", user.id);

    if (profileUpdateError) {
      console.error("[photo/upload] profile update error:", profileUpdateError);
      return NextResponse.json(
        {
          success: false,
          error: "Photo was uploaded but could not be saved to profile. Please try again.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      uploaded: uploadedUrls.length,
      rejected: rejectedCount,
      uploaded_urls: uploadedUrls,
      errors,
      photos: mergedPhotos,
      profile_photo_url: profilePhotoUrl,
    });
  } catch (error) {
    console.error("[photo/upload] unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to upload photos" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accountReady = await ensureUserAccount(user);
    if (!accountReady.ok) {
      return NextResponse.json(
        { error: accountReady.error, code: accountReady.code },
        { status: accountReady.status || 500 }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { photo_urls?: string[] }
      | null;

    const photoUrls = Array.isArray(body?.photo_urls)
      ? Array.from(
          new Set(
            body.photo_urls
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter(Boolean)
          )
        )
      : [];

    if (photoUrls.length === 0) {
      return NextResponse.json(
        { error: "photo_urls is required" },
        { status: 400 }
      );
    }

    const invalidPhotoUrl = photoUrls.find(
      (photoUrl) => !isOwnedStoragePhotoUrl(photoUrl, user.id)
    );
    if (invalidPhotoUrl) {
      return NextResponse.json(
        { error: "One or more photos do not belong to your gallery." },
        { status: 403 }
      );
    }

    const approvedUrls: string[] = [];
    const errors: string[] = [];

    const { data: existingRows, error: lookupError } = await supabase
      .from("photo_moderation")
      .select("photo_url, status, review_reason")
      .eq("user_id", user.id)
      .in("photo_url", photoUrls);

    if (lookupError) {
      console.error("[photo/upload] verification lookup error:", lookupError);
    }

    const existingByUrl = new Map<
      string,
      { status?: string | null; review_reason?: string | null }
    >();
    for (const row of existingRows || []) {
      if (typeof row?.photo_url === "string" && !existingByUrl.has(row.photo_url)) {
        existingByUrl.set(row.photo_url, {
          status: typeof row?.status === "string" ? row.status : null,
          review_reason:
            typeof row?.review_reason === "string" ? row.review_reason : null,
        });
      }
    }

    for (const photoUrl of photoUrls) {
      const existing = existingByUrl.get(photoUrl);
      if (existing?.status === "approved") {
        approvedUrls.push(photoUrl);
        continue;
      }

      const moderation = await evaluateRemotePhotoUrlModeration(photoUrl);

      const { error: cleanupExistingError } = await supabase
        .from("photo_moderation")
        .delete()
        .eq("user_id", user.id)
        .eq("photo_url", photoUrl);

      if (cleanupExistingError) {
        console.error(
          "[photo/upload] verification cleanup error:",
          cleanupExistingError
        );
      }

      const { error: insertError } = await supabase
        .from("photo_moderation")
        .insert({
          user_id: user.id,
          photo_url: photoUrl,
          status: moderation.status,
          review_reason: moderation.reason,
        });

      if (insertError) {
        console.error("[photo/upload] verification insert error:", insertError);
        errors.push(
          "One of your uploaded photos could not be verified. Please remove it and upload it again."
        );
        continue;
      }

      if (moderation.status === "approved") {
        approvedUrls.push(photoUrl);
      } else {
        errors.push(
          moderation.reason ||
            "One of your uploaded photos could not be approved automatically."
        );
      }
    }

    return NextResponse.json({
      success: approvedUrls.length > 0,
      approved_urls: approvedUrls,
      errors,
    });
  } catch (error) {
    console.error("[photo/upload] PUT unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to verify uploaded photos" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { photo_url?: string }
      | null;

    const photoUrl = typeof body?.photo_url === "string" ? body.photo_url.trim() : "";
    if (!photoUrl) {
      return NextResponse.json(
        { error: "photo_url is required" },
        { status: 400 }
      );
    }

    const existingProfile = await fetchExistingProfile(user.id);
    const currentPhotos = getGalleryPhotos(existingProfile);

    if (!currentPhotos.includes(photoUrl)) {
      return NextResponse.json(
        { error: "Photo not found in your gallery" },
        { status: 404 }
      );
    }

    const reorderedPhotos = [
      photoUrl,
      ...currentPhotos.filter((url) => url !== photoUrl),
    ];

    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({
        photos: reorderedPhotos,
        profile_photo_url: photoUrl,
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[photo/upload] set primary update error:", updateError);
      return NextResponse.json(
        { error: "Failed to set primary photo" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      photos: reorderedPhotos,
      profile_photo_url: photoUrl,
    });
  } catch (error) {
    console.error("[photo/upload] PATCH unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to set primary photo" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { photo_url?: string }
      | null;

    const photoUrl = typeof body?.photo_url === "string" ? body.photo_url.trim() : "";
    if (!photoUrl) {
      return NextResponse.json(
        { error: "photo_url is required" },
        { status: 400 }
      );
    }

    const existingProfile = await fetchExistingProfile(user.id);
    const currentPhotos = getGalleryPhotos(existingProfile);

    const photoExistsInProfile = currentPhotos.includes(photoUrl);
    const storagePath = extractStoragePathFromPublicUrl(photoUrl);
    const belongsToUserStorage =
      typeof storagePath === "string" && storagePath.startsWith(`${user.id}/`);

    if (!photoExistsInProfile) {
      const { data: moderationRow, error: moderationLookupError } = await supabase
        .from("photo_moderation")
        .select("id")
        .eq("user_id", user.id)
        .eq("photo_url", photoUrl)
        .maybeSingle();

      if (moderationLookupError) {
        console.error(
          "[photo/upload] delete moderation lookup error:",
          moderationLookupError
        );
      }

      if (!moderationRow && !belongsToUserStorage) {
        return NextResponse.json(
          { error: "Photo not found in your gallery" },
          { status: 404 }
        );
      }
    }

    const remainingPhotos = photoExistsInProfile
      ? currentPhotos.filter((url) => url !== photoUrl)
      : currentPhotos;
    const nextProfilePhotoUrl = photoExistsInProfile
      ? remainingPhotos[0] || null
      : (existingProfile?.profile_photo_url as string | null) || null;

    if (photoExistsInProfile) {
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
          photos: remainingPhotos.length > 0 ? remainingPhotos : null,
          profile_photo_url: nextProfilePhotoUrl,
        })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("[photo/upload] delete update error:", updateError);
        return NextResponse.json(
          { error: "Failed to delete photo" },
          { status: 500 }
        );
      }
    }

    if (storagePath && storagePath.startsWith(`${user.id}/`)) {
      const { error: removeError } = await supabase.storage
        .from("profile-images")
        .remove([storagePath]);
      if (removeError) {
        console.error("[photo/upload] storage remove error:", removeError);
      }
    }

    await supabase
      .from("photo_moderation")
      .delete()
      .eq("user_id", user.id)
      .eq("photo_url", photoUrl);

    return NextResponse.json({
      success: true,
      photos: remainingPhotos,
      profile_photo_url: nextProfilePhotoUrl,
    });
  } catch (error) {
    console.error("[photo/upload] DELETE unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to delete photo" },
      { status: 500 }
    );
  }
}
