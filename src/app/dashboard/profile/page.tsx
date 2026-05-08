"use client";

/**
 * ProfilePage — MatchIndeed
 *
 * Enhanced profile view page with:
 * - Standard dashboard layout (no overlay)
 * - Photo gallery with primary hero + thumbnail grid
 * - Rich detail sections (About, Identity, Languages, Relationship, Lifestyle)
 * - Quick action links (Edit, Preferences, Wallet)
 * - Brand-consistent colors (#1f419a)
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Compass,
  Heart,
  MessageCircle,
  User,
  Sliders,
  Edit3,
  Loader2,
  MapPin,
  Ruler,
  GraduationCap,
  Church,
  Globe,
  Baby,
  Cigarette,
  Sparkles,
  ArrowRight,
  Camera,
  BadgeCheck,
  Upload,
  Trash2,
  Star,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import ProfileCompletenessCard from "@/components/ProfileCompletenessCard";
import { useToast } from "@/components/ToastProvider";
import { toStateCountryLabel } from "@/lib/location";
import { formatRelationshipStatusLabel } from "@/lib/relationship-status";
import {
  getPersonalityDisplayText,
  parseStoredPersonalityPrompts,
} from "@/lib/profile/personality-prompts";
import { supabase } from "@/lib/supabase";
import { MAX_PHOTOS } from "@/lib/photo/validation";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type ProfileData = {
  first_name: string | null;
  date_of_birth: string | null;
  location: string | null;
  height_cm: number | null;
  ethnicity: string | null;
  religion: string | null;
  education_level: string | null;
  languages: string[] | null;
  relationship_status: string | null;
  have_children: boolean | null;
  want_children: string | null;
  smoking_habits: string | null;
  about_yourself: string | null;
  personality_type: string | null;
  photos: string[] | null;
  profile_photo_url: string | null;
  love_languages: string[] | null;
  relationship_type: string | null;
  relocation_plan: string | null;
  career_stability: string | null;
  long_term_goals: string | null;
  gender: string | null;
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function calcAge(dob: string): number {
  const b = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

function formatHeight(cm: number | null): string {
  if (!cm) return "";
  const feet = Math.floor(cm / 30.48);
  const inches = Math.round((cm % 30.48) / 2.54);
  return `${feet}'${inches}" (${cm} cm)`;
}

function titleCase(s: string | null): string {
  if (!s) return "";
  return s
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function normalizePhotoUrls(profile: Pick<ProfileData, "photos" | "profile_photo_url">): string[] {
  if (Array.isArray(profile.photos) && profile.photos.length > 0) {
    return profile.photos.filter((url): url is string => typeof url === "string");
  }
  if (typeof profile.profile_photo_url === "string" && profile.profile_photo_url.trim().length > 0) {
    return [profile.profile_photo_url];
  }
  return [];
}

type PhotoApiResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  errors?: string[];
  uploaded?: number;
  rejected?: number;
  photos?: string[] | null;
  uploaded_urls?: string[];
};

const HUMAN_PHOTO_ONLY_MESSAGE =
  "MatchIndeed accepts photos of real human beings only. Please upload a clear photo of yourself.";

function uploadSinglePhotoWithProgress(
  file: File,
  accessToken: string,
  onProgress?: (progress: number) => void
): Promise<{ status: number; result: PhotoApiResponse | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/photo/upload");
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onerror = () => {
      reject(new Error("Photo upload failed."));
    };

    xhr.onload = () => {
      onProgress?.(100);

      let result: PhotoApiResponse | null = null;
      if (typeof xhr.responseText === "string" && xhr.responseText.trim()) {
        try {
          result = JSON.parse(xhr.responseText) as PhotoApiResponse;
        } catch {
          result = null;
        }
      }

      resolve({ status: xhr.status, result });
    };

    const formData = new FormData();
    formData.append("photos", file);
    xhr.send(formData);
  });
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function ProfilePage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [age, setAge] = useState<number | null>(null);
  const [verified, setVerified] = useState(false);
  const [allPhotos, setAllPhotos] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);
  const [photoBusyUrl, setPhotoBusyUrl] = useState<string | null>(null);
  const [deleteTargetPhoto, setDeleteTargetPhoto] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showMobileAccountActions, setShowMobileAccountActions] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const mobileActionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          setLoading(false);
          return;
        }

        const [profileRes, accountRes] = await Promise.all([
          supabase.from("user_profiles").select("*").eq("user_id", user.id).single(),
          supabase.from("accounts").select("email_verified").eq("id", user.id).maybeSingle(),
        ]);

        if (profileRes.error) {
          if (profileRes.error.code !== "PGRST116") {
            console.error("Error fetching profile:", profileRes.error.message);
          }
          setLoading(false);
          return;
        }

        if (profileRes.data) {
          const nextProfile = profileRes.data as ProfileData;
          setProfile(nextProfile);
          setAllPhotos(normalizePhotoUrls(nextProfile));
          if (profileRes.data.date_of_birth) {
            setAge(calcAge(profileRes.data.date_of_birth));
          }
        }
        setVerified(accountRes.data?.email_verified || false);
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxIndex]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxIndex(null);
        return;
      }
      if (event.key === "ArrowLeft") {
        setLightboxIndex((prev) => {
          if (prev === null || allPhotos.length === 0) return prev;
          return (prev - 1 + allPhotos.length) % allPhotos.length;
        });
        return;
      }
      if (event.key === "ArrowRight") {
        setLightboxIndex((prev) => {
          if (prev === null || allPhotos.length === 0) return prev;
          return (prev + 1) % allPhotos.length;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [lightboxIndex, allPhotos.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    if (allPhotos.length === 0) {
      setLightboxIndex(null);
      return;
    }
    if (lightboxIndex >= allPhotos.length) {
      setLightboxIndex(allPhotos.length - 1);
    }
  }, [allPhotos, lightboxIndex]);

  useEffect(() => {
    if (!showMobileAccountActions) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!mobileActionsRef.current?.contains(event.target as Node)) {
        setShowMobileAccountActions(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMobileAccountActions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showMobileAccountActions]);

  // ---------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1f419a]" />
          <p className="mt-3 text-sm text-gray-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // No profile — onboarding prompt
  // ---------------------------------------------------------------
  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href="/dashboard">
              <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={110} height={28} style={{ width: "auto", height: "auto" }} />
            </Link>
            <NotificationBell />
          </div>
        </header>
        <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
          <aside className="hidden md:block w-56 flex-shrink-0">
            <Sidebar active="profile" />
          </aside>
          <main className="flex-1 min-w-0">
            <div className="mx-auto max-w-lg py-16 text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#eef2ff]">
                <User className="h-10 w-10 text-[#1f419a]" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Create Your Profile</h1>
              <p className="mt-2 text-sm text-gray-500">
                Complete your profile to start connecting with amazing people.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: Heart, label: "3x more matches" },
                  { icon: Sparkles, label: "Stand out" },
                  { icon: Globe, label: "Better discoveries" },
                ].map(({ icon: Ic, label }) => (
                  <div key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                    <Ic className="mx-auto mb-2 h-5 w-5 text-[#1f419a]" />
                    <p className="text-xs font-medium text-gray-600">{label}</p>
                  </div>
                ))}
              </div>
              <Link
                href="/dashboard/profile/edit"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg"
              >
                <Edit3 className="h-4 w-4" />
                Create My Profile
              </Link>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Photo helpers
  // ---------------------------------------------------------------
  const primaryPhoto = allPhotos[0] || null;
  const displayLocation = toStateCountryLabel(profile.location);
  const personalityPromptEntries = parseStoredPersonalityPrompts(
    profile.personality_type
  );
  const legacyPersonalityText =
    personalityPromptEntries.length === 0
      ? getPersonalityDisplayText(profile.personality_type)
      : null;
  const lightboxPhoto =
    lightboxIndex !== null && lightboxIndex >= 0 && lightboxIndex < allPhotos.length
      ? allPhotos[lightboxIndex]
      : null;

  const openLightbox = (index: number) => {
    if (index < 0 || index >= allPhotos.length) return;
    setLightboxIndex(index);
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
  };

  const showPreviousLightbox = () => {
    setLightboxIndex((prev) => {
      if (prev === null || allPhotos.length === 0) return prev;
      return (prev - 1 + allPhotos.length) % allPhotos.length;
    });
  };

  const showNextLightbox = () => {
    setLightboxIndex((prev) => {
      if (prev === null || allPhotos.length === 0) return prev;
      return (prev + 1) % allPhotos.length;
    });
  };

  const uploadProgressLabel =
    photoUploading && photoUploadProgress !== null
      ? `Uploading ${photoUploadProgress}%`
      : "Upload";

  const syncPhotoState = (nextPhotos: string[]) => {
    setAllPhotos(nextPhotos);
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        photos: nextPhotos.length > 0 ? nextPhotos : null,
        profile_photo_url: nextPhotos[0] || null,
      };
    });
  };

  const getAccessToken = async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  const uploadFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (files.length > 1) {
      toast.warning("Please upload one photo at a time.");
    }

    if (allPhotos.length >= MAX_PHOTOS) {
      toast.error(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.error("Your session expired. Please log in again.");
      return;
    }

    setPhotoUploading(true);
    setPhotoUploadProgress(0);
    try {
      const { status, result } = await uploadSinglePhotoWithProgress(
        file,
        accessToken,
        setPhotoUploadProgress
      );

      if (status === 401) {
        toast.error("Your session expired. Please log in again.");
        return;
      }

      if (status < 200 || status >= 300 || result?.success === false) {
        if (result?.code === "MODERATION_REJECTED") {
          toast.centerWarning(HUMAN_PHOTO_ONLY_MESSAGE);
        } else {
          const details = Array.isArray(result?.errors) && result.errors.length > 0
            ? ` ${result.errors[0]}`
            : "";
          const message = (result?.error || "Failed to upload photo.") + details;
          toast.error(message);
        }
        return;
      }

      const nextPhotos = Array.isArray(result?.photos)
        ? result.photos.filter((url): url is string => typeof url === "string")
        : allPhotos;
      syncPhotoState(nextPhotos);

      if ((result?.uploaded || 0) > 0) {
        toast.success(
          `${result?.uploaded} photo${result?.uploaded === 1 ? "" : "s"} uploaded successfully.`
        );
      }
      if ((result?.rejected || 0) > 0) {
        toast.centerWarning(HUMAN_PHOTO_ONLY_MESSAGE);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error("Failed to upload photo.");
    } finally {
      setPhotoUploading(false);
      setPhotoUploadProgress(null);
    }
  };

  const handleGallerySelection = async (list: FileList | null) => {
    const files = list?.[0] ? [list[0]] : [];
    await uploadFiles(files);
    if (galleryInputRef.current) {
      galleryInputRef.current.value = "";
    }
  };

  const handleCameraSelection = async (list: FileList | null) => {
    const files = list?.[0] ? [list[0]] : [];
    await uploadFiles(files);
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  };

  const setPrimaryPhoto = async (photoUrl: string) => {
    if (photoUrl === primaryPhoto) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.error("Your session expired. Please log in again.");
      return;
    }

    setPhotoBusyUrl(photoUrl);
    try {
      const response = await fetch("/api/photo/upload", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ photo_url: photoUrl }),
      });

      const result = (await response.json().catch(() => null)) as PhotoApiResponse | null;
      if (!response.ok) {
        toast.error(result?.error || "Failed to set primary photo.");
        return;
      }

      const nextPhotos = Array.isArray(result?.photos)
        ? result.photos.filter((url): url is string => typeof url === "string")
        : allPhotos;
      syncPhotoState(nextPhotos);
      toast.success("Primary photo updated.");
    } catch (error) {
      console.error("Set primary failed:", error);
      toast.error("Failed to set primary photo.");
    } finally {
      setPhotoBusyUrl(null);
    }
  };

  const deletePhoto = async (photoUrl: string) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      toast.error("Your session expired. Please log in again.");
      return;
    }

    setPhotoBusyUrl(photoUrl);
    try {
      const response = await fetch("/api/photo/upload", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ photo_url: photoUrl }),
      });

      const result = (await response.json().catch(() => null)) as PhotoApiResponse | null;
      if (!response.ok) {
        toast.error(result?.error || "Failed to delete photo.");
        return;
      }

      const nextPhotos = Array.isArray(result?.photos)
        ? result.photos.filter((url): url is string => typeof url === "string")
        : allPhotos.filter((url) => url !== photoUrl);
      syncPhotoState(nextPhotos);
      toast.success("Photo deleted.");
      setDeleteTargetPhoto(null);
    } catch (error) {
      console.error("Delete photo failed:", error);
      toast.error("Failed to delete photo.");
    } finally {
      setPhotoBusyUrl(null);
    }
  };

  // ---------------------------------------------------------------
  // Detail rows
  // ---------------------------------------------------------------
  type DetailRow = { icon: React.ReactNode; label: string; value: string };
  const details: DetailRow[] = [];

  if (profile.gender) details.push({ icon: <User className="h-4 w-4" />, label: "Gender", value: titleCase(profile.gender) });
  if (profile.height_cm) details.push({ icon: <Ruler className="h-4 w-4" />, label: "Height", value: formatHeight(profile.height_cm) });
  if (profile.ethnicity) details.push({ icon: <Globe className="h-4 w-4" />, label: "Ethnicity", value: titleCase(profile.ethnicity) });
  if (profile.religion) details.push({ icon: <Church className="h-4 w-4" />, label: "Religion", value: titleCase(profile.religion) });
  if (profile.education_level) details.push({ icon: <GraduationCap className="h-4 w-4" />, label: "Education", value: titleCase(profile.education_level) });
  if (profile.relationship_status) details.push({ icon: <Heart className="h-4 w-4" />, label: "Status", value: formatRelationshipStatusLabel(profile.relationship_status) });
  if (profile.have_children !== null) details.push({ icon: <Baby className="h-4 w-4" />, label: "Children", value: profile.have_children ? "Has children" : "No children" });
  if (profile.want_children) details.push({ icon: <Baby className="h-4 w-4" />, label: "Wants Children", value: titleCase(profile.want_children) });
  if (profile.smoking_habits) details.push({ icon: <Cigarette className="h-4 w-4" />, label: "Smoking", value: titleCase(profile.smoking_habits) });
  if (profile.relationship_type) details.push({ icon: <Heart className="h-4 w-4" />, label: "Looking For", value: titleCase(profile.relationship_type) });
  if (profile.career_stability) details.push({ icon: <Sparkles className="h-4 w-4" />, label: "Career", value: titleCase(profile.career_stability) });
  if (profile.long_term_goals) details.push({ icon: <Sparkles className="h-4 w-4" />, label: "Goals", value: titleCase(profile.long_term_goals) });
  if (profile.relocation_plan) details.push({ icon: <MapPin className="h-4 w-4" />, label: "Relocation", value: titleCase(profile.relocation_plan) });

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/dashboard">
            <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={110} height={28} style={{ width: "auto", height: "auto" }} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 flex-shrink-0">
          <Sidebar active="profile" />
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 space-y-5">
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              void handleGallerySelection(event.target.files);
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(event) => {
              void handleCameraSelection(event.target.files);
            }}
          />

          {/* Profile completeness */}
          <ProfileCompletenessCard variant="full" showWhenComplete />

          {/* ---- Hero card ---- */}
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="grid gap-0 lg:grid-cols-[340px_1fr]">
              {/* Photo column */}
              <div className="relative bg-gray-100">
                {primaryPhoto ? (
                  <>
                    <Image
                      src={primaryPhoto}
                      alt={profile.first_name || "Profile"}
                      width={340}
                      height={420}
                      className="h-[320px] w-full cursor-zoom-in object-cover lg:h-full"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => openLightbox(0)}
                      aria-label="View photo in larger size"
                      className="absolute inset-0 z-10"
                    >
                      <span className="sr-only">Open profile photo in full view</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      disabled={photoUploading}
                      aria-label="Edit profile photo"
                      className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {photoUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Edit3 className="h-4 w-4" />
                      )}
                    </button>
                  </>
                ) : (
                  <div className="flex h-[320px] items-center justify-center lg:h-full">
                    <div className="text-center">
                      <Camera className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                      <p className="text-xs text-gray-400">No photo</p>
                    </div>
                  </div>
                )}

                <div className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={photoUploading || allPhotos.length >= MAX_PHOTOS}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-black/45 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {photoUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {uploadProgressLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={photoUploading || allPhotos.length >= MAX_PHOTOS}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-black/45 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Camera
                  </button>
                </div>
              </div>

              {/* Info column */}
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                      {profile.first_name || "User"}
                      {verified && (
                        <BadgeCheck className="h-5 w-5 text-blue-500" />
                      )}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                      {age !== null && <span className="font-medium">{age} years</span>}
                      {displayLocation && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="flex min-w-0 max-w-full items-center gap-1 break-words [overflow-wrap:anywhere]">
                            <Compass className="h-3.5 w-3.5" />
                            {displayLocation}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div ref={mobileActionsRef} className="relative sm:hidden">
                      <button
                        type="button"
                        onClick={() => setShowMobileAccountActions((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#1f419a]/20 bg-white px-3 py-2 text-xs font-semibold text-[#1f419a] shadow-sm transition-colors hover:bg-[#eef2ff]"
                      >
                        <User className="h-3.5 w-3.5" />
                        Account
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${
                            showMobileAccountActions ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      <div
                        className={`absolute right-0 top-[calc(100%+0.45rem)] z-30 w-44 origin-top-right rounded-xl border border-[#1f419a]/15 bg-white p-1.5 shadow-lg transition-all ${
                          showMobileAccountActions
                            ? "pointer-events-auto translate-y-0 opacity-100"
                            : "pointer-events-none -translate-y-1 opacity-0"
                        }`}
                      >
                        <Link
                          href="/dashboard/profile/my-account"
                          onClick={() => setShowMobileAccountActions(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#1f419a] transition-colors hover:bg-[#eef2ff]"
                        >
                          <User className="h-3.5 w-3.5" />
                          My account
                        </Link>
                        <Link
                          href="/dashboard/profile/edit"
                          onClick={() => setShowMobileAccountActions(false)}
                          className="mt-1 flex items-center gap-2 rounded-lg bg-[#1f419a] px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#17357b]"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit profile
                        </Link>
                      </div>
                    </div>

                    <Link
                      href="/dashboard/profile/edit"
                      className="hidden items-center gap-1.5 rounded-lg bg-[#1f419a] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#17357b] sm:inline-flex"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </Link>
                  </div>
                </div>

                {/* About */}
                {(profile.about_yourself ||
                  personalityPromptEntries.length > 0 ||
                  legacyPersonalityText) && (
                  <div className="mt-4">
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      About Me
                    </h3>
                    {profile.about_yourself ? (
                      <p className="text-sm leading-relaxed text-gray-700">
                        {profile.about_yourself}
                      </p>
                    ) : null}
                    {!profile.about_yourself && legacyPersonalityText ? (
                      <p className="text-sm leading-relaxed text-gray-700">
                        {legacyPersonalityText}
                      </p>
                    ) : null}
                    {personalityPromptEntries.length > 0 ? (
                      <div className="mt-3 grid gap-2">
                        {personalityPromptEntries.map((prompt) => (
                          <div
                            key={prompt.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                          >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              {prompt.title}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-slate-700">
                              {prompt.answer}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Languages */}
                {profile.languages && profile.languages.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Languages
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.languages.map((lang, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full bg-[#eef2ff] px-2.5 py-1 text-[11px] font-medium text-[#1f419a]"
                        >
                          <MessageCircle className="h-3 w-3" />
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Love languages */}
                {profile.love_languages && profile.love_languages.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Love Languages
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.love_languages.map((ll, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-medium text-pink-600"
                        >
                          <Heart className="h-3 w-3" />
                          {ll}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick links */}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href="/dashboard/profile/preferences"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    Preferences
                  </Link>
                  <Link
                    href="/dashboard/profile/wallet"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Wallet
                  </Link>
                  <Link
                    href="/dashboard/profile/subscription"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    Subscription
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* ---- Photo gallery ---- */}
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Camera className="h-4 w-4 text-[#1f419a]" />
                Photos
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                  {allPhotos.length}
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={photoUploading || allPhotos.length >= MAX_PHOTOS}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {photoUploading && photoUploadProgress !== null
                    ? `Uploading ${photoUploadProgress}%`
                    : "Add Photo"}
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={photoUploading || allPhotos.length >= MAX_PHOTOS}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Camera
                </button>
              </div>
            </div>

            {allPhotos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
                <Camera className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm font-medium text-gray-700">No photos yet</p>
                <p className="mt-1 text-xs text-gray-500">
                  Upload clear photos of yourself. AI or unrelated images are blocked.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {allPhotos.map((photo, i) => (
                  <div
                    key={`${photo}-${i}`}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100"
                  >
                    <button
                      type="button"
                      onClick={() => openLightbox(i)}
                      aria-label={`View photo ${i + 1} in larger size`}
                      className="absolute inset-0 z-10"
                    >
                      <span className="sr-only">{`Open photo ${i + 1}`}</span>
                    </button>
                    <Image
                      src={photo}
                      alt={`Photo ${i + 1}`}
                      fill
                      className="cursor-zoom-in object-cover transition-transform group-hover:scale-105"
                      unoptimized
                    />
                    <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <span className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 inline-flex items-center justify-center rounded-full bg-black/50 p-1 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                      <Maximize2 className="h-3 w-3" />
                    </span>
                    {i === 0 ? (
                      <span className="absolute left-1 top-1 z-20 rounded bg-[#1f419a] px-1.5 py-0.5 text-[9px] font-bold text-white">
                        Primary
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void setPrimaryPhoto(photo)}
                        disabled={photoUploading || photoBusyUrl === photo}
                        className="absolute left-1 top-1 z-20 inline-flex items-center gap-1 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {photoBusyUrl === photo ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Star className="h-2.5 w-2.5" />
                        )}
                        Make Primary
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDeleteTargetPhoto(photo)}
                      disabled={photoUploading || photoBusyUrl === photo}
                      aria-label={`Delete photo ${i + 1}`}
                      className="absolute right-1 top-1 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-600/85 text-white shadow transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {photoBusyUrl === photo ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))}

                {allPhotos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={photoUploading}
                    className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-500 transition hover:border-[#1f419a] hover:text-[#1f419a] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex flex-col items-center justify-center gap-1">
                      {photoUploading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Upload className="h-5 w-5" />
                      )}
                      {photoUploading && photoUploadProgress !== null ? (
                        <span className="text-[11px] font-semibold">
                          {photoUploadProgress}%
                        </span>
                      ) : null}
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          {deleteTargetPhoto ? (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <button
                type="button"
                aria-label="Close delete photo dialog"
                className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
                onClick={() => {
                  if (photoBusyUrl) return;
                  setDeleteTargetPhoto(null);
                }}
              />
              <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
                <div className="border-b border-slate-100 bg-[linear-gradient(135deg,rgba(239,68,68,0.10),rgba(255,255,255,1)_55%,rgba(31,65,154,0.06))] px-6 py-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
                      <Trash2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Delete photo
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-slate-900">
                        Remove this photo?
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        This will remove the photo from your profile gallery immediately.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-200">
                      <Image
                        src={deleteTargetPhoto}
                        alt="Photo pending deletion"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setDeleteTargetPhoto(null)}
                      disabled={photoBusyUrl === deleteTargetPhoto}
                      className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Keep photo
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePhoto(deleteTargetPhoto)}
                      disabled={photoBusyUrl === deleteTargetPhoto}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(239,68,68,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {photoBusyUrl === deleteTargetPhoto ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Delete photo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ---- Details grid ---- */}
          {details.length > 0 && (
            <div className="overflow-hidden rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Profile Details</h3>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {details.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#eef2ff] text-[#1f419a]">
                      {d.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                        {d.label}
                      </p>
                      <p className="text-sm font-medium leading-snug text-gray-900 break-words [overflow-wrap:anywhere]">
                        {d.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
          onClick={closeLightbox}
        >
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
          <div
            className="relative z-10 flex w-full max-w-6xl flex-col gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between rounded-xl bg-black/35 px-3 py-2 text-sm text-white ring-1 ring-white/20 backdrop-blur">
              <span className="font-medium">
                Photo {lightboxIndex !== null ? lightboxIndex + 1 : 1} of {allPhotos.length}
              </span>
              <button
                type="button"
                onClick={closeLightbox}
                aria-label="Close lightbox"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative h-[min(78vh,860px)] w-full overflow-hidden rounded-2xl bg-black/35 ring-1 ring-white/20">
              <Image
                src={lightboxPhoto}
                alt={`Photo ${lightboxIndex !== null ? lightboxIndex + 1 : 1}`}
                fill
                priority
                unoptimized
                className="object-contain"
              />

              {allPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={showPreviousLightbox}
                    aria-label="Previous photo"
                    className="absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur transition hover:bg-black/60"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={showNextLightbox}
                    aria-label="Next photo"
                    className="absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur transition hover:bg-black/60"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
