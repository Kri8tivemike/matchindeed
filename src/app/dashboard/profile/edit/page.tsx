"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, X, Check, Loader2, ArrowUp, ArrowDown, ArrowLeft, Star } from "lucide-react";
import GooglePlacesAutocomplete from "@/components/GooglePlacesAutocomplete";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import { saveFormDraft, loadFormDraft, clearFormDraft, getDraftTimestamp } from "@/lib/form-autosave";
import {
  isValidFirstName,
  normalizeFirstName,
  sanitizeFirstNameInput,
} from "@/lib/name";
import {
  isLikelyGoogleSuggestedLocation,
  normalizeLocation,
} from "@/lib/location";
import {
  calculateAge,
  MINIMUM_PLATFORM_AGE,
} from "@/lib/age-restrictions";
import {
  formatRelationshipStatusLabel,
  PROFILE_RELATIONSHIP_STATUS_OPTIONS,
  relationshipStatusToDbValue,
} from "@/lib/relationship-status";
import {
  ALLOWED_PHOTO_TYPES,
  ALLOWED_PHOTO_FORMATS_LABEL,
  MAX_PHOTO_SIZE_BYTES,
  MAX_PHOTOS,
} from "@/lib/photo/validation";
import {
  PERSONALITY_PROMPT_CONFIGS,
  PERSONALITY_PROMPT_MAX_LENGTH,
  PERSONALITY_PROMPT_MIN_LENGTH,
  PERSONALITY_PROMPT_REQUIRED_COUNT,
  buildPersonalityPromptMap,
  countCompletedPersonalityPrompts,
  createEmptyPersonalityPromptMap,
  getPersonalityPromptPreview,
  parseStoredPersonalityPrompts,
  serializeStoredPersonalityPrompts,
  type PersonalityPromptEntry,
  type PersonalityPromptId,
} from "@/lib/profile/personality-prompts";

type ProfileData = {
  birthday: string;
  firstName: string;
  gender: string;
  location: string;
  aboutYourself: string;
  height: string;
  ethnicity: string[];
  religion: string;
  education: string;
  languages: string[];
  relationshipStatus: string;
  hasChildren: string;
  wantsChildren: string;
  smoking: string;
  relocationPlan: string;
  readyToMarry: string;
  relationshipType: string;
  careerStability: string;
  longTermGoals: string;
  emotionalConnection: string;
  loveLanguages: string[];
  personality: string;
  photos: File[];
};

type PhotoUploadResponse = {
  success?: boolean;
  code?: string;
  error?: string;
  errors?: string[];
  uploaded?: number;
  rejected?: number;
  uploaded_urls?: string[];
  approved_urls?: string[];
};

const PHOTO_UPLOAD_DEACTIVATED_MESSAGE =
  "Your MatchIndeed account is currently deactivated. Reactivate your account to upload photos and continue your profile.";

function displayBirthdayToIso(value: string) {
  if (!value) return "";
  const [monthRaw, dayRaw, yearRaw] = value.split("/");
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const year = Number(yearRaw);
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(year)
  ) {
    return "";
  }
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return "";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;
}

function getAdultMaxDateInputValue() {
  const now = new Date();
  const max = new Date(now.getFullYear() - MINIMUM_PLATFORM_AGE, now.getMonth(), now.getDate());
  return `${max.getFullYear()}-${String(max.getMonth() + 1).padStart(2, "0")}-${String(max.getDate()).padStart(2, "0")}`;
}

function isRemotePhotoUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isFileValue(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

async function fetchApprovedPhotoUrls(userId: string, urls: string[]): Promise<Set<string>> {
  const uniqueUrls = Array.from(
    new Set(urls.filter((value): value is string => typeof value === "string" && value.trim().length > 0))
  );

  if (!userId || uniqueUrls.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("photo_moderation")
    .select("photo_url")
    .eq("user_id", userId)
    .eq("status", "approved")
    .in("photo_url", uniqueUrls);

  if (error) {
    console.error("[profile/edit] failed to load approved photos:", error);
    return new Set<string>();
  }

  const approvedUrls = Array.isArray(data)
    ? data
        .map((row) => (typeof row?.photo_url === "string" ? row.photo_url : ""))
        .filter((value): value is string => value.trim().length > 0)
    : [];

  return new Set(approvedUrls);
}

const HUMAN_PHOTO_ONLY_MESSAGE =
  "We couldn't approve this photo automatically. Please upload a clear, natural photo of yourself.";
const MIN_ONBOARDING_PHOTOS = 2;
const LEGACY_PERSONALITY_DEFAULTS = new Set(["usuw", "undefined", "null", "n/a", "na"]);
const ABOUT_ME_MIN_LENGTH = 140;
const ABOUT_ME_MAX_LENGTH = 4000;
const ABOUT_ME_SAMPLES = [
  {
    label: "Honest & mature",
    value: "I’m someone who values honesty, communication, and emotional maturity.",
  },
  {
    label: "Calm & loyal",
    value: "My friends describe me as calm, loyal, and family oriented.",
  },
  {
    label: "Intentional dating",
    value: "I’m intentional about dating and looking for someone who shares similar values.",
  },
  {
    label: "Meaningful connection",
    value: "I enjoy meaningful conversations, peaceful environments, and building real connections.",
  },
  {
    label: "Serious relationship",
    value: "I’m ready for a serious relationship and looking for someone who is too.",
  },
];

const DEFAULT_PERSONALITY_PROMPT_ID = PERSONALITY_PROMPT_CONFIGS[0].id;

function uploadSinglePhotoWithProgress(
  file: File,
  accessToken: string,
  options?: {
    standalone?: boolean;
    onProgress?: (progress: number) => void;
  }
): Promise<{ status: number; result: PhotoUploadResponse | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/photo/upload");
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      options?.onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onerror = () => {
      reject(new Error("Photo upload failed."));
    };

    xhr.onload = () => {
      options?.onProgress?.(100);

      let result: PhotoUploadResponse | null = null;
      if (typeof xhr.responseText === "string" && xhr.responseText.trim()) {
        try {
          result = JSON.parse(xhr.responseText) as PhotoUploadResponse;
        } catch {
          result = null;
        }
      }

      resolve({ status: xhr.status, result });
    };

    const formData = new FormData();
    if (options?.standalone) {
      formData.append("mode", "standalone");
    }
    formData.append("photos", file);
    xhr.send(formData);
  });
}

async function verifyUploadedPhotoUrls(
  photoUrls: string[],
  accessToken: string
): Promise<{ status: number; result: PhotoUploadResponse | null }> {
  const response = await fetch("/api/photo/upload", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ photo_urls: photoUrls }),
  });

  const result = (await response.json().catch(() => null)) as
    | PhotoUploadResponse
    | null;

  return {
    status: response.status,
    result,
  };
}

async function getAccessTokenOrThrow() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Your session has expired. Please log in again.");
  }

  return accessToken;
}

function handlePhotoUploadAccountBlock(
  status: number,
  result: PhotoUploadResponse | null,
  toast: ReturnType<typeof useToast>["toast"],
  router: ReturnType<typeof useRouter>
) {
  if (
    status === 403 &&
    (result?.code === "account_deactivated" ||
      /deactivated/i.test(result?.error || ""))
  ) {
    toast.error(PHOTO_UPLOAD_DEACTIVATED_MESSAGE);
    router.push("/dashboard/reactivate");
    return true;
  }

  return false;
}

function sanitizePersonalityValue(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (LEGACY_PERSONALITY_DEFAULTS.has(trimmed.toLowerCase())) {
    return "";
  }

  return trimmed;
}

export default function EditProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ProfileData>({
    birthday: "",
    firstName: "",
    gender: "",
    location: "",
    aboutYourself: "",
    height: "",
    ethnicity: [],
    religion: "",
    education: "",
    languages: [],
    relationshipStatus: "",
    hasChildren: "",
    wantsChildren: "",
    smoking: "",
    relocationPlan: "",
    readyToMarry: "",
    relationshipType: "",
    careerStability: "",
    longTermGoals: "",
    emotionalConnection: "",
    loveLanguages: [],
    personality: "",
    photos: [],
  });

  const [heightInches, setHeightInches] = useState(76); // 6'4" default
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [locationPickedFromGoogle, setLocationPickedFromGoogle] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [wasProfileCompleted, setWasProfileCompleted] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | null>(null);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);
  const [savedPersonalityPrompts, setSavedPersonalityPrompts] = useState(
    createEmptyPersonalityPromptMap
  );
  const [draftPersonalityPrompts, setDraftPersonalityPrompts] = useState(
    createEmptyPersonalityPromptMap
  );
  const [expandedPersonalityPromptId, setExpandedPersonalityPromptId] =
    useState<PersonalityPromptId | null>(DEFAULT_PERSONALITY_PROMPT_ID);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const galleryPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const selfiePhotoInputRef = useRef<HTMLInputElement | null>(null);

  const totalSteps = 23;
  const FORM_DRAFT_KEY = "profile_edit";

  const initializePersonalityPrompts = (
    storedValue: string | null | undefined
  ) => {
    const normalizedValue = sanitizePersonalityValue(storedValue);
    const nextSavedPrompts = buildPersonalityPromptMap(normalizedValue);
    const nextDraftPrompts = { ...nextSavedPrompts };
    const parsedPrompts = parseStoredPersonalityPrompts(normalizedValue);

    if (parsedPrompts.length === 0 && normalizedValue) {
      nextDraftPrompts[DEFAULT_PERSONALITY_PROMPT_ID] = normalizedValue;
    }

    setSavedPersonalityPrompts(nextSavedPrompts);
    setDraftPersonalityPrompts(nextDraftPrompts);

    const firstIncompletePrompt = PERSONALITY_PROMPT_CONFIGS.find(
      (config) => !nextSavedPrompts[config.id].trim()
    );

    setExpandedPersonalityPromptId(firstIncompletePrompt?.id || null);
  };

  const syncStoredPersonalityPrompts = (
    nextSavedPrompts: Record<PersonalityPromptId, string>
  ) => {
    const nextEntries: PersonalityPromptEntry[] = PERSONALITY_PROMPT_CONFIGS.reduce<
      PersonalityPromptEntry[]
    >((acc, config) => {
      const answer = nextSavedPrompts[config.id].trim();
      if (!answer) return acc;
      acc.push({
        id: config.id,
        title: config.title,
        answer,
      });
      return acc;
    }, []);

    const serializedPrompts =
      nextEntries.length > 0 ? serializeStoredPersonalityPrompts(nextEntries) : "";

    setSavedPersonalityPrompts(nextSavedPrompts);
    setFormData((prev) => ({ ...prev, personality: serializedPrompts }));
  };

  const handlePersonalityDraftChange = (
    promptId: PersonalityPromptId,
    value: string
  ) => {
    setDraftPersonalityPrompts((prev) => ({
      ...prev,
      [promptId]: value.slice(0, PERSONALITY_PROMPT_MAX_LENGTH),
    }));
  };

  const handleSavePersonalityPrompt = (promptId: PersonalityPromptId) => {
    const nextAnswer = draftPersonalityPrompts[promptId].trim();

    if (nextAnswer.length < PERSONALITY_PROMPT_MIN_LENGTH) {
      toast.warning(
        `Each prompt answer must be at least ${PERSONALITY_PROMPT_MIN_LENGTH} characters.`
      );
      return;
    }

    if (nextAnswer.length > PERSONALITY_PROMPT_MAX_LENGTH) {
      toast.warning(
        `Each prompt answer must be ${PERSONALITY_PROMPT_MAX_LENGTH} characters or less.`
      );
      return;
    }

    const nextSavedPrompts = {
      ...savedPersonalityPrompts,
      [promptId]: nextAnswer,
    };

    syncStoredPersonalityPrompts(nextSavedPrompts);

    const nextIncompletePrompt = PERSONALITY_PROMPT_CONFIGS.find(
      (config) => !nextSavedPrompts[config.id].trim()
    );
    setExpandedPersonalityPromptId(nextIncompletePrompt?.id || null);
  };

  // Load draft data first (before database)
  useEffect(() => {
    const loadDraft = () => {
      const draft = loadFormDraft<ProfileData & { heightInches?: number; currentStep?: number }>(FORM_DRAFT_KEY);
      if (draft) {
        // Restore form data from draft
        setFormData({
          birthday: draft.birthday || "",
          firstName: draft.firstName || "",
          gender: draft.gender || "",
          location: draft.location || "",
          aboutYourself: draft.aboutYourself || "",
          height: draft.height || "",
          ethnicity: draft.ethnicity || [],
          religion: draft.religion || "",
          education: draft.education || "",
          languages: draft.languages || [],
          relationshipStatus: formatRelationshipStatusLabel(draft.relationshipStatus || ""),
          hasChildren: draft.hasChildren || "",
          wantsChildren: draft.wantsChildren || "",
          smoking: draft.smoking || "",
          relocationPlan: draft.relocationPlan || "",
          readyToMarry: draft.readyToMarry || "",
          relationshipType: draft.relationshipType || "",
          careerStability: draft.careerStability || "",
          longTermGoals: draft.longTermGoals || "",
          emotionalConnection: draft.emotionalConnection || "",
          loveLanguages: draft.loveLanguages || [],
          personality: sanitizePersonalityValue(draft.personality),
          // File objects cannot be serialized safely in localStorage drafts.
          photos: [],
        });
        initializePersonalityPrompts(draft.personality);
        setLocationPickedFromGoogle(
          isLikelyGoogleSuggestedLocation(draft.location || "")
        );
        
        if (draft.heightInches) {
          setHeightInches(draft.heightInches);
        }
        
        if (draft.currentStep) {
          setCurrentStep(draft.currentStep);
        }

        // Show notification that draft was loaded
        const draftTime = getDraftTimestamp(FORM_DRAFT_KEY);
        if (draftTime) {
          const timeAgo = new Date(draftTime);
          const hoursAgo = Math.floor((Date.now() - timeAgo.getTime()) / (1000 * 60 * 60));
          console.log(`Draft loaded from ${hoursAgo} hour(s) ago`);
        }
      }
    };

    loadDraft();
  }, [router]);

  // Auto-save form data whenever it changes (debounced)
  useEffect(() => {
    // Don't save if data hasn't loaded yet
    if (!dataLoaded) return;

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set saving status
    setSaveStatus("saving");

    // Debounce save by 1 second
    saveTimeoutRef.current = setTimeout(() => {
      try {
        // Save form data along with current step and height
        const draftData = {
          ...formData,
          // File objects cannot be persisted in JSON drafts.
          photos: [],
          heightInches,
          currentStep,
        };
        saveFormDraft(FORM_DRAFT_KEY, draftData);
        setSaveStatus("saved");
        
        // Clear saved status after 2 seconds
        setTimeout(() => {
          setSaveStatus(null);
        }, 2000);
      } catch (error) {
        console.error("Error auto-saving form:", error);
        setSaveStatus(null);
      }
    }, 1000);

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [formData, heightInches, currentStep, dataLoaded]);

  // Load existing profile data
  useEffect(() => {
    const loadProfileData = async () => {
      try {
        // Get session first, then try to refresh if needed
        const { data: { session } } = await supabase.auth.getSession();
        
        let user = session?.user;
        
        // If session exists but might be stale, refresh it
        if (session) {
          const { data: refreshData } = await supabase.auth.refreshSession();
          if (refreshData.session?.user) {
            user = refreshData.session.user;
          }
        }
        
        if (!user) {
          // Try getUser as final fallback
          const { data: { user: directUser } } = await supabase.auth.getUser();
          user = directUser || undefined;
        }
        
        // If still no user, redirect to login
        if (!user) {
          console.log("No authenticated user found, redirecting to login...");
          router.push("/login?next=/dashboard/profile/edit");
          return;
        }

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        // If profile exists and is completed, load from database (overwrites draft)
        // If no profile or profile not completed, draft data (already loaded) takes precedence
        if (profile && profile.profile_completed) {
          setWasProfileCompleted(true);

          // Format date of birth
          let birthday = "";
          if (profile.date_of_birth) {
            const date = new Date(profile.date_of_birth);
            birthday = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
          }

          // Format height
          let height = "";
          if (profile.height_cm) {
            const feet = Math.floor(profile.height_cm / 30.48);
            const inches = Math.round((profile.height_cm % 30.48) / 2.54);
            height = `${feet}'${inches}" • ${profile.height_cm} cm`;
            setHeightInches(Math.round(profile.height_cm / 2.54));
          }

          // Format gender
          let gender = "";
          if (profile.gender) {
            const genderMap: Record<string, string> = {
              male: "Male",
              female: "Female",
              other: "Other",
              prefer_not_to_say: "Prefer not to say",
            };
            gender = genderMap[profile.gender] || profile.gender;
          }

          setFormData({
            birthday,
            firstName: profile.first_name || "",
            gender,
            location: profile.location || "",
            aboutYourself: profile.about_yourself || "",
            height,
            ethnicity: profile.ethnicity ? profile.ethnicity.split(", ") : [],
            religion: profile.religion || "",
            education: profile.education_level || "",
            languages: profile.languages || [],
            relationshipStatus: formatRelationshipStatusLabel(profile.relationship_status || ""),
            hasChildren: profile.have_children === true ? "Has kid(s) and wants more" : profile.have_children === false ? "Doesn't have kids but wants them" : "",
            wantsChildren: profile.want_children === "yes" ? "Want kids" : profile.want_children === "no" ? "Don't want kids" : profile.want_children === "maybe" ? "Not sure" : "",
            smoking: profile.smoking_habits === "never"
              ? "Never"
              : profile.smoking_habits === "occasionally"
                ? "Smoke Socially"
                : profile.smoking_habits === "regularly"
                  ? "Regularly"
                  : profile.smoking_habits === "trying_to_quit"
                    ? "Trying to quit"
                    : profile.smoking_habits
                      ? profile.smoking_habits.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())
                      : "",
            relocationPlan: profile.willing_to_relocate === "yes"
              ? "Ready for relocation plan"
              : profile.willing_to_relocate === "no"
                ? "Not ready to relocate"
                : profile.willing_to_relocate === "maybe"
                  ? "Maybe in the future"
                  : "",
            readyToMarry: profile.ready_for_marriage === "yes"
              ? "Absolutely"
              : profile.ready_for_marriage === "no"
                ? "No way"
                : profile.ready_for_marriage === "not_sure"
                  ? "Get married yes, settle down no"
                  : "",
            relationshipType: profile.relationship_type || "",
            careerStability: profile.career_stability || "",
            longTermGoals: profile.long_term_goals || "",
            emotionalConnection: profile.emotional_connection || "",
            loveLanguages: profile.love_languages || [],
            personality: sanitizePersonalityValue(profile.personality_type),
            photos: [],
          });
          initializePersonalityPrompts(profile.personality_type);
          setLocationPickedFromGoogle(
            isLikelyGoogleSuggestedLocation(profile.location || "")
          );

          // Only keep photo URLs that are actually approved in moderation.
          const rawProfilePhotos =
            profile.photos && Array.isArray(profile.photos) && profile.photos.length > 0
              ? profile.photos.filter((value: unknown): value is string => typeof value === "string")
              : profile.profile_photo_url
                ? [profile.profile_photo_url]
                : [];

          const approvedPhotoSet = await fetchApprovedPhotoUrls(user.id, rawProfilePhotos);
          const approvedProfilePhotos = rawProfilePhotos.filter((url: string) =>
            approvedPhotoSet.has(url)
          );

          if (approvedProfilePhotos.length > 0) {
            setPhotoPreviews(approvedProfilePhotos);
          } else {
            setPhotoPreviews([]);
          }
        } else {
          // No profile exists - draft data (if any) was already loaded, just mark as loaded
          console.log("No profile found - using draft data if available");
        }
      } catch (error) {
        console.error("Error loading profile:", error);
        // Even on error, mark as loaded so draft can be used
      } finally {
        setDataLoaded(true);
      }
    };

    loadProfileData();
  }, [router]);

  const validateProfileStep = (step: number) => {
    switch (step) {
      case 1:
        if (!formData.birthday.trim()) {
          toast.warning("Please enter your birthday.");
          return false;
        }
        {
          const birthdayIso = displayBirthdayToIso(formData.birthday);
          const age = calculateAge(birthdayIso || null);
          if (!birthdayIso || age === null) {
            toast.warning("Please enter a valid birthday.");
            return false;
          }
          if (age < MINIMUM_PLATFORM_AGE) {
            toast.warning(`You must be at least ${MINIMUM_PLATFORM_AGE} years old.`);
            return false;
          }
        }
        return true;
      case 2: {
        const normalizedFirstName = normalizeFirstName(formData.firstName);
        if (!normalizedFirstName) {
          toast.warning("Please enter your first name.");
          return false;
        }
        if (!isValidFirstName(normalizedFirstName)) {
          toast.warning("First name must contain only letters (2-50 characters).");
          return false;
        }
        if (normalizedFirstName !== formData.firstName) {
          setFormData((prev) => ({ ...prev, firstName: normalizedFirstName }));
        }
        return true;
      }
      case 3:
        if (!formData.gender.trim()) {
          toast.warning("Please select your gender.");
          return false;
        }
        return true;
      case 4: {
        const normalizedLocation = normalizeLocation(formData.location);
        if (!normalizedLocation) {
          toast.warning("Please select your location.");
          return false;
        }
        if (
          !locationPickedFromGoogle ||
          !isLikelyGoogleSuggestedLocation(normalizedLocation)
        ) {
          toast.warning("Please select your location from Google suggestions.");
          return false;
        }
        if (normalizedLocation !== formData.location) {
          setFormData((prev) => ({ ...prev, location: normalizedLocation }));
        }
        return true;
      }
      case 5: {
        const aboutTextLength = formData.aboutYourself.trim().length;
        if (!aboutTextLength) {
          toast.warning("Please tell us about yourself.");
          return false;
        }
        if (aboutTextLength < ABOUT_ME_MIN_LENGTH) {
          toast.warning(
            `Your About Me must be at least ${ABOUT_ME_MIN_LENGTH} characters.`
          );
          return false;
        }
        if (aboutTextLength > ABOUT_ME_MAX_LENGTH) {
          toast.warning(
            `Your About Me must be ${ABOUT_ME_MAX_LENGTH} characters or less.`
          );
          return false;
        }
        return true;
      }
      case 6:
        if (!formData.height.trim()) {
          toast.warning("Please select your height.");
          return false;
        }
        return true;
      case 7:
        if (formData.ethnicity.length === 0) {
          toast.warning("Please select your ethnicity.");
          return false;
        }
        return true;
      case 8:
        if (!formData.religion.trim()) {
          toast.warning("Please select your religion.");
          return false;
        }
        return true;
      case 9:
        if (!formData.education.trim()) {
          toast.warning("Please select your education level.");
          return false;
        }
        return true;
      case 10:
        if (formData.languages.length === 0) {
          toast.warning("Please select at least one language.");
          return false;
        }
        return true;
      case 11:
        if (!formData.relationshipStatus.trim()) {
          toast.warning("Please select your relationship status.");
          return false;
        }
        return true;
      case 12:
        if (!formData.hasChildren.trim()) {
          toast.warning("Please select your children status.");
          return false;
        }
        return true;
      case 13:
        if (!formData.wantsChildren.trim()) {
          toast.warning("Please select if you want children.");
          return false;
        }
        return true;
      case 14:
        if (!formData.smoking.trim()) {
          toast.warning("Please select your smoking preference.");
          return false;
        }
        return true;
      case 15:
        if (!formData.relocationPlan.trim()) {
          toast.warning("Please select your relocation plan.");
          return false;
        }
        return true;
      case 16:
        if (!formData.readyToMarry.trim()) {
          toast.warning("Please select your marriage readiness.");
          return false;
        }
        return true;
      case 17:
        if (!formData.relationshipType.trim()) {
          toast.warning("Please select your relationship type.");
          return false;
        }
        return true;
      case 18:
        if (!formData.careerStability.trim()) {
          toast.warning("Please select your career stability.");
          return false;
        }
        return true;
      case 19:
        if (!formData.longTermGoals.trim()) {
          toast.warning("Please select your long-term goal.");
          return false;
        }
        return true;
      case 20:
        if (!formData.emotionalConnection.trim()) {
          toast.warning("Please select your emotional connection.");
          return false;
        }
        return true;
      case 21:
        if (formData.loveLanguages.length === 0) {
          toast.warning("Please select at least one love language.");
          return false;
        }
        return true;
      case 22:
        if (
          countCompletedPersonalityPrompts(formData.personality) <
          PERSONALITY_PROMPT_REQUIRED_COUNT
        ) {
          toast.warning(
            `Please complete ${PERSONALITY_PROMPT_REQUIRED_COUNT} personality prompts.`
          );
          return false;
        }
        return true;
      case 23:
        {
          const minimumRequiredPhotos = wasProfileCompleted
            ? 1
            : MIN_ONBOARDING_PHOTOS;
          if (photoPreviews.length < minimumRequiredPhotos) {
            toast.warning(
              minimumRequiredPhotos === 1
                ? "Please add at least one photo."
                : `Please add at least ${minimumRequiredPhotos} photos.`
            );
            return false;
          }
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!validateProfileStep(currentStep)) {
      return;
    }

    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else if (currentStep === totalSteps) {
      // Last step, automatically submit
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      for (let step = 1; step <= totalSteps; step += 1) {
        if (!validateProfileStep(step)) {
          setCurrentStep(step);
          setLoading(false);
          return;
        }
      }

      const normalizedFirstName = normalizeFirstName(formData.firstName);
      if (!normalizedFirstName || !isValidFirstName(normalizedFirstName)) {
        toast.error("First name must contain only letters (2-50 characters).");
        setLoading(false);
        return;
      }

      const normalizedLocation = normalizeLocation(formData.location);
      if (
        !locationPickedFromGoogle ||
        !isLikelyGoogleSuggestedLocation(normalizedLocation)
      ) {
        toast.error("Please select a valid location from Google suggestions.");
        setLoading(false);
        return;
      }

      // First try to refresh the session to ensure it's valid
      let finalUser = null;
      
      // Try getSession first (more reliable for checking if session exists)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (session?.user) {
        finalUser = session.user;
        
        // Check if session needs refresh (expires within 5 minutes)
        if (session.expires_at) {
          const expiresAt = session.expires_at * 1000;
          const fiveMinutes = 5 * 60 * 1000;
          
          if (expiresAt - Date.now() < fiveMinutes) {
            console.log("Session expiring soon, refreshing...");
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            
            if (!refreshError && refreshData.session?.user) {
              finalUser = refreshData.session.user;
              console.log("Session refreshed successfully");
            }
          }
        }
      } else {
        // No session, try getUser as fallback (might have token in storage)
        console.warn("No session found, trying getUser...");
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (user) {
          finalUser = user;
        } else {
          console.error("No session or user found:", sessionError || userError);
          toast.error("Your session has expired. Please log in again.");
          router.push("/login");
          return;
        }
      }
      
      // Final validation
      if (!finalUser || !finalUser.id) {
        console.error("No valid user found");
        toast.error("Authentication error. Please log in again.");
        router.push("/login");
        return;
      }

      // Parse birthday to ISO date format
      const dateOfBirth = displayBirthdayToIso(formData.birthday);
      if (!dateOfBirth) {
        toast.error("Please enter a valid birthday.");
        setLoading(false);
        return;
      }

      // Parse height to cm
      const heightMatch = formData.height.match(/(\d+)\s*cm/);
      const heightCm = heightMatch ? parseInt(heightMatch[1]) : null;

      // Build final photo list: preserve only already-approved URLs + upload new File objects
      // through API moderation (AI/synthetic/random image checks).
      const uploadErrors: string[] = [];
      let moderationRejected = false;
      const existingRemotePhotoUrls = photoPreviews.filter(isRemotePhotoUrl);
      let approvedExistingPhotoSet = await fetchApprovedPhotoUrls(
        finalUser.id,
        existingRemotePhotoUrls
      );
      const missingApprovedRemoteUrls = existingRemotePhotoUrls.filter(
        (url) => !approvedExistingPhotoSet.has(url)
      );

      if (missingApprovedRemoteUrls.length > 0) {
        const accessToken = await getAccessTokenOrThrow();
        const { status, result } = await verifyUploadedPhotoUrls(
          missingApprovedRemoteUrls,
          accessToken
        );

        if (status === 401) {
          throw new Error("Your session has expired. Please log in again.");
        }

        if (handlePhotoUploadAccountBlock(status, result, toast, router)) {
          return;
        }

        const recoveredApprovedUrls = Array.isArray(result?.approved_urls)
          ? result.approved_urls.filter(
              (item): item is string => typeof item === "string"
            )
          : [];

        if (recoveredApprovedUrls.length > 0) {
          approvedExistingPhotoSet = new Set([
            ...approvedExistingPhotoSet,
            ...recoveredApprovedUrls,
          ]);
        }

        const verificationErrors = Array.isArray(result?.errors)
          ? result.errors.filter((item): item is string => typeof item === "string")
          : [];
        uploadErrors.push(...verificationErrors);
        moderationRejected =
          moderationRejected ||
          verificationErrors.some((message) =>
            /real human|human beings|photo of yourself|could not verify/i.test(
              message
            )
          );
      }

      const staleExistingPhotoCount = existingRemotePhotoUrls.filter(
        (url) => !approvedExistingPhotoSet.has(url)
      ).length;
      let finalPhotoUrls = existingRemotePhotoUrls.filter((url) =>
        approvedExistingPhotoSet.has(url)
      );

      const localPreviewCount = photoPreviews.filter(
        (preview) => !isRemotePhotoUrl(preview)
      ).length;
      const draftFiles = formData.photos.filter(isFileValue);
      if (draftFiles.length !== formData.photos.length) {
        console.warn(
          "[profile/edit] Removed non-File draft photo entries before upload."
        );
      }
      if (draftFiles.length > 0 && localPreviewCount === 0) {
        console.warn(
          "[profile/edit] Ignoring stale draft photo files because all visible photos are already remote."
        );
      }

      const orderedNewFiles: File[] =
        localPreviewCount > 0
          ? (() => {
              const nextOrderedFiles: File[] = [];
              const newFileQueue = [...draftFiles];
              for (const preview of photoPreviews) {
                if (isRemotePhotoUrl(preview)) continue;
                const nextFile = newFileQueue.shift();
                if (nextFile) {
                  nextOrderedFiles.push(nextFile);
                }
              }
              return nextOrderedFiles;
            })()
          : [];

      if (orderedNewFiles.length > 0) {
        const {
          data: { session: uploadSession },
        } = await supabase.auth.getSession();
        const accessToken = uploadSession?.access_token;

        if (!accessToken) {
          throw new Error("Your session has expired. Please log in again.");
        }

        const uploadedUrls: string[] = [];
        setPhotoUploadProgress(0);

        for (let index = 0; index < orderedNewFiles.length; index += 1) {
          const file = orderedNewFiles[index];
          const { status, result } = await uploadSinglePhotoWithProgress(file, accessToken, {
            standalone: true,
            onProgress: (progress) => {
              const overallProgress = Math.round(
                ((index + progress / 100) / orderedNewFiles.length) * 100
              );
              setPhotoUploadProgress(Math.min(100, overallProgress));
            },
          });

          const serverErrors = Array.isArray(result?.errors)
            ? result.errors.filter((item): item is string => typeof item === "string")
            : [];
          uploadErrors.push(...serverErrors);

          const humanOnlyErrorDetected = serverErrors.some((message) =>
            /real human|human beings|photo of yourself|could not verify/i.test(message)
          );
          moderationRejected =
            moderationRejected ||
            result?.code === "MODERATION_REJECTED" ||
            humanOnlyErrorDetected;

          if (status === 401) {
            throw new Error("Your session has expired. Please log in again.");
          }

          if (handlePhotoUploadAccountBlock(status, result, toast, router)) {
            return;
          }

          if (status < 200 || status >= 300 || result?.success === false) {
            continue;
          }

          const nextUploadedUrls = Array.isArray(result?.uploaded_urls)
            ? result.uploaded_urls.filter((item): item is string => typeof item === "string")
            : [];
          uploadedUrls.push(...nextUploadedUrls);
        }

        const uploadedQueue = [...uploadedUrls];
        const orderedUrls: string[] = [];

        for (const preview of photoPreviews) {
          if (isRemotePhotoUrl(preview)) {
            if (!approvedExistingPhotoSet.has(preview)) {
              continue;
            }
            orderedUrls.push(preview);
            continue;
          }
          const nextUploaded = uploadedQueue.shift();
          if (nextUploaded) {
            orderedUrls.push(nextUploaded);
          }
        }

        finalPhotoUrls = orderedUrls;
      }

      // Show errors to user if any uploads failed
      if (uploadErrors.length > 0 && finalPhotoUrls.length > 0) {
        if (moderationRejected) {
          toast.centerWarning(HUMAN_PHOTO_ONLY_MESSAGE);
        } else {
          toast.warning(
            `Some photos were rejected by moderation. Continuing with ${finalPhotoUrls.length} approved photo(s).`
          );
        }
      }

      if (staleExistingPhotoCount > 0) {
        toast.warning(
          staleExistingPhotoCount === 1
            ? "One previously saved photo could not be kept because it was not approved by moderation."
            : `${staleExistingPhotoCount} previously saved photos could not be kept because they were not approved by moderation.`
        );
      }

      if (finalPhotoUrls.length === 0 && photoPreviews.length > 0) {
        throw new Error(
          moderationRejected
            ? HUMAN_PHOTO_ONLY_MESSAGE
            : uploadErrors[0] || "No approved photos were available. Please upload a clear, real photo of yourself."
        );
      }

      const minimumRequiredPhotos = wasProfileCompleted
        ? 1
        : MIN_ONBOARDING_PHOTOS;
      if (finalPhotoUrls.length < minimumRequiredPhotos) {
        if (moderationRejected) {
          throw new Error(
            `At least ${MIN_ONBOARDING_PHOTOS} approved real-human photos are required to complete your profile.`
          );
        }
        throw new Error(
          minimumRequiredPhotos === 1
            ? "Please add at least one photo."
            : `Please upload at least ${minimumRequiredPhotos} photos to complete your profile.`
        );
      }

      // Map form data to database fields (matching exact column names and constraints)
      // Map ready_to_marry to ready_for_marriage constraint values: 'yes', 'no', 'not_sure'
      const mapReadyToMarry = (value: string): string | null => {
        if (!value) return null;
        const lower = value.toLowerCase();
        if (lower.includes("absolutely") || (lower.includes("get married") && lower.includes("yes"))) return "yes";
        if (lower.includes("no way") || (lower.includes("get married") && lower.includes("no"))) return "no";
        if (lower.includes("i'd rather not say") || lower.includes("not sure") || lower.includes("settle down")) return "not_sure";
        return "not_sure"; // default
      };

      // Map relocation plan to willing_to_relocate constraint values: 'yes', 'no', 'maybe'
      const mapRelocationPlan = (value: string): string | null => {
        if (!value) return null;
        if (value.includes("Ready for relocation") || value.includes("yes")) return "yes";
        if (value.includes("Not ready to relocate") || value.includes("no")) return "no";
        if (value.includes("Maybe in the future") || value.includes("maybe")) return "maybe";
        return "maybe"; // default
      };

      // Map smoking habits to constraint values: 'never', 'occasionally', 'regularly', 'trying_to_quit'
      const mapSmokingHabits = (value: string): string | null => {
        if (!value) return null;
        if (value.toLowerCase().includes("never")) return "never";
        if (value.toLowerCase().includes("socially")) return "occasionally";
        if (value.toLowerCase().includes("regularly") || value.toLowerCase().includes("smoke smoke")) return "regularly";
        if (value.toLowerCase().includes("trying to quit")) return "trying_to_quit";
        return "never"; // default
      };

      // Map gender to database constraint values: 'male', 'female', 'other', 'prefer_not_to_say'
      const mapGender = (value: string): string | null => {
        if (!value) return null;
        const lower = value.toLowerCase();
        if (lower.includes("male") && !lower.includes("fe")) return "male";
        if (lower.includes("female")) return "female";
        if (lower.includes("other")) return "other";
        if (lower.includes("prefer not") || lower.includes("rather not")) return "prefer_not_to_say";
        return null;
      };

      const profileUpdate: Record<string, unknown> = {
        user_id: finalUser.id,
        first_name: normalizedFirstName,
        gender: mapGender(formData.gender),
        date_of_birth: dateOfBirth || null,
        location: normalizedLocation || null,
        about_yourself: formData.aboutYourself || null,
        height_cm: heightCm || null,
        ethnicity: formData.ethnicity.length > 0 ? formData.ethnicity.join(", ") : null,
        religion: formData.religion || null,
        education_level: formData.education || null,
        languages: formData.languages.length > 0 ? formData.languages : null,
        relationship_status: relationshipStatusToDbValue(formData.relationshipStatus),
        have_children: formData.hasChildren ? formData.hasChildren.includes("Has kid") : null,
        want_children: formData.wantsChildren === "Want kids" ? "yes" : formData.wantsChildren === "Don't want kids" ? "no" : formData.wantsChildren === "Not sure" ? "maybe" : null,
        smoking_habits: mapSmokingHabits(formData.smoking),
        willing_to_relocate: mapRelocationPlan(formData.relocationPlan),
        ready_for_marriage: mapReadyToMarry(formData.readyToMarry),
        relationship_type: formData.relationshipType || null,
        career_stability: formData.careerStability || null,
        long_term_goals: formData.longTermGoals || null,
        emotional_connection: formData.emotionalConnection || null,
        love_languages: formData.loveLanguages.length > 0 ? formData.loveLanguages : null,
        personality_type: sanitizePersonalityValue(formData.personality) || null,
        profile_photo_url: finalPhotoUrls[0] || null,
        photos: finalPhotoUrls.length > 0 ? finalPhotoUrls : null,
        profile_completed: true,
      };

      // Save profile
      const { error: profileError } = await supabase
        .from("user_profiles")
        .upsert(profileUpdate, { onConflict: "user_id" });

      if (profileError) {
        throw profileError;
      }

        // Update user progress
        const { error: progressError } = await supabase
          .from("user_progress")
          .upsert({
            user_id: finalUser.id,
            profile_completed: true,
          }, { onConflict: "user_id" });

      if (progressError) {
        console.error("Progress update error:", progressError);
      }

      // Track initial profile completion for lifecycle onboarding (fire once on first completion).
      if (!wasProfileCompleted) {
        try {
          const { data: { session: trackingSession } } = await supabase.auth.getSession();
          const accessToken = trackingSession?.access_token;

          if (accessToken) {
            const lifecycleResponse = await fetch("/api/lifecycle/profile-progress", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                step: "profile_completed",
                event_data: {
                  photos_count: finalPhotoUrls.length,
                  location: formData.location || null,
                },
              }),
            });

            if (!lifecycleResponse.ok) {
              console.warn(
                "Profile completion lifecycle tracking failed:",
                lifecycleResponse.status
              );
            }
          }
        } catch (lifecycleError) {
          console.warn("Profile lifecycle tracking error:", lifecycleError);
        }
      }

      // Clear draft since form was successfully submitted
      clearFormDraft(FORM_DRAFT_KEY);
      setSaveStatus(null);

      // Always redirect to preferences after successful profile submission
      // Check if preferences are completed
        try {
          const { data: progress, error: progressCheckError } = await supabase
            .from("user_progress")
            .select("preferences_completed")
            .eq("user_id", finalUser.id)
            .maybeSingle();

        if (progressCheckError) {
          console.error("Error checking preferences status:", progressCheckError);
          // Even if there's an error, redirect to preferences form
          // Use window.location to ensure full page navigation and session persistence
          window.location.href = "/dashboard/profile/preferences";
          return;
        }

        if (progress && progress.preferences_completed) {
          // Preferences already completed, show congratulations step (step 16)
          window.location.href = "/dashboard/profile/preferences?step=16";
        } else {
          // Preferences not completed or no progress record, redirect to preferences form (step 1)
          window.location.href = "/dashboard/profile/preferences";
        }
      } catch (progressError) {
        // If there's an error checking progress, default to redirecting to preferences form
        console.error("Error checking preferences status:", progressError);
        window.location.href = "/dashboard/profile/preferences";
      }
    } catch (error: unknown) {
      console.error("Error saving profile:", error);
      
      // Extract detailed error message
      let errorMessage = "Failed to save profile. Please try again.";
      const errorObj =
        typeof error === "object" && error !== null
          ? (error as {
              message?: string;
              details?: string;
              hint?: string;
              code?: string;
              status?: number;
            })
          : {};
      
      if (errorObj.message) {
        errorMessage = errorObj.message;
      } else if (errorObj.details) {
        errorMessage = errorObj.details;
      } else if (typeof error === "string") {
        errorMessage = error;
      }
      
      // Log full error details for debugging
      console.error("Full error details:", JSON.stringify({
        message: errorObj.message,
        details: errorObj.details,
        hint: errorObj.hint,
        code: errorObj.code,
        status: errorObj.status,
        error: error
      }, null, 2));
      
      // Don't redirect to login on save errors - just show the error
      // Only redirect if it's an authentication error
      if (errorObj.message?.includes("session") || 
          errorObj.message?.includes("auth") || 
          errorObj.message?.includes("unauthorized") ||
          errorObj.code === "PGRST301" ||
          errorObj.status === 401) {
        toast.error("Your session has expired. Please log in again.");
        router.push("/login");
      } else {
        if (/real human|human beings|photo of yourself|could not verify/i.test(errorMessage)) {
          toast.centerWarning(HUMAN_PHOTO_ONLY_MESSAGE);
        } else {
          toast.error(errorMessage);
        }
      }
    } finally {
      setPhotoUploadProgress(null);
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if ((e.target.files?.length || 0) > 1) {
      toast.warning("Please upload one photo at a time.");
    }

    if (photoPreviews.length >= MAX_PHOTOS) {
      toast.warning(
        `You can only upload up to ${MAX_PHOTOS} photos total. Please remove some photos first.`
      );
      e.target.value = "";
      return;
    }

    const maxSize = MAX_PHOTO_SIZE_BYTES;
    const allowedTypes = ALLOWED_PHOTO_TYPES;

    if (!allowedTypes.includes(file.type)) {
      toast.error(
        `${file.name}: Invalid file type. Please use ${ALLOWED_PHOTO_FORMATS_LABEL}.`
      );
      e.target.value = "";
      return;
    }

    if (file.size > maxSize) {
      toast.error(`${file.name}: File too large. Maximum size is 5MB.`);
      e.target.value = "";
      return;
    }

    e.target.value = "";

    try {
      setLoading(true);
      setPhotoUploadProgress(0);

      const accessToken = await getAccessTokenOrThrow();
      const { status, result } = await uploadSinglePhotoWithProgress(file, accessToken, {
        standalone: true,
        onProgress: (progress) => setPhotoUploadProgress(progress),
      });

      const serverErrors = Array.isArray(result?.errors)
        ? result.errors.filter((item): item is string => typeof item === "string")
        : [];
      const uploadedUrls = Array.isArray(result?.uploaded_urls)
        ? result.uploaded_urls.filter((item): item is string => typeof item === "string")
        : [];

      if (status === 401) {
        throw new Error("Your session has expired. Please log in again.");
      }

      if (handlePhotoUploadAccountBlock(status, result, toast, router)) {
        return;
      }

      if (uploadedUrls.length > 0) {
        setPhotoPreviews((prev) => [...prev, ...uploadedUrls].slice(0, MAX_PHOTOS));
        setFormData((prev) => ({ ...prev, photos: [] }));
        toast.success(
          uploadedUrls.length === 1
            ? "Photo approved and added."
            : `${uploadedUrls.length} photos approved and added.`
        );
      }

      if (serverErrors.length > 0) {
        const humanOnlyErrorDetected = serverErrors.some((message) =>
          /real human|human beings|photo of yourself|could not verify/i.test(message)
        );
        if (humanOnlyErrorDetected || result?.code === "MODERATION_REJECTED") {
          toast.centerWarning(HUMAN_PHOTO_ONLY_MESSAGE);
        } else {
          toast.warning(serverErrors[0]);
        }
      }

      if (status < 200 || status >= 300 || result?.success === false) {
        if (!serverErrors.length) {
          toast.error(result?.error || "Failed to upload photo. Please try again.");
        }
        return;
      }
    } catch (error) {
      console.error("[profile/edit] immediate photo upload failed:", error);
      const message =
        error instanceof Error ? error.message : "Failed to upload photo. Please try again.";
      if (/session|auth|unauthorized/i.test(message)) {
        toast.error("Your session has expired. Please log in again.");
        router.push("/login");
      } else {
        toast.error(message);
      }
    } finally {
      setPhotoUploadProgress(null);
      setLoading(false);
    }
  };

  const openGalleryPhotoPicker = () => {
    galleryPhotoInputRef.current?.click();
  };

  const openSelfieCamera = () => {
    selfiePhotoInputRef.current?.click();
  };

  const syncDraftPhotosWithPreviewOrder = (nextPreviews: string[]) => {
    const currentDraftFiles = formData.photos.filter(isFileValue);
    const currentBlobPreviewOrder = photoPreviews.filter(
      (preview) => !isRemotePhotoUrl(preview)
    );
    const fileByBlobUrl = new Map<string, File>();

    currentBlobPreviewOrder.forEach((blobUrl, index) => {
      const file = currentDraftFiles[index];
      if (file) {
        fileByBlobUrl.set(blobUrl, file);
      }
    });

    const nextDraftFiles: File[] = [];
    nextPreviews.forEach((preview) => {
      if (isRemotePhotoUrl(preview)) return;
      const mappedFile = fileByBlobUrl.get(preview);
      if (mappedFile) {
        nextDraftFiles.push(mappedFile);
      }
    });

    setFormData({ ...formData, photos: nextDraftFiles });
  };

  const removePhoto = async (index: number) => {
    const removedPreview = photoPreviews[index];
    if (!removedPreview) return;

    if (isRemotePhotoUrl(removedPreview)) {
      try {
        setLoading(true);
        const accessToken = await getAccessTokenOrThrow();
        const response = await fetch("/api/photo/upload", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ photo_url: removedPreview }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Failed to remove photo.");
        }
      } catch (error) {
        console.error("[profile/edit] remove photo failed:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to remove photo."
        );
        setLoading(false);
        return;
      } finally {
        setLoading(false);
      }
    }

    if (removedPreview?.startsWith("blob:")) {
      URL.revokeObjectURL(removedPreview);
    }

    const newPreviews = photoPreviews.filter((_, i) => i !== index);
    setPhotoPreviews(newPreviews);
    syncDraftPhotosWithPreviewOrder(newPreviews);
  };

  /** Move a photo up (towards index 0) in the display order */
  const movePhotoUp = (index: number) => {
    if (index <= 0) return;
    const newPreviews = [...photoPreviews];
    [newPreviews[index - 1], newPreviews[index]] = [newPreviews[index], newPreviews[index - 1]];
    setPhotoPreviews(newPreviews);
    syncDraftPhotosWithPreviewOrder(newPreviews);
  };

  /** Move a photo down (towards the end) in the display order */
  const movePhotoDown = (index: number) => {
    if (index >= photoPreviews.length - 1) return;
    const newPreviews = [...photoPreviews];
    [newPreviews[index], newPreviews[index + 1]] = [newPreviews[index + 1], newPreviews[index]];
    setPhotoPreviews(newPreviews);
    syncDraftPhotosWithPreviewOrder(newPreviews);
  };

  /** Set a specific photo as primary (move to index 0) */
  const setAsPrimary = (index: number) => {
    if (index === 0) return;
    const newPreviews = [...photoPreviews];
    const [moved] = newPreviews.splice(index, 1);
    newPreviews.unshift(moved);
    setPhotoPreviews(newPreviews);
    syncDraftPhotosWithPreviewOrder(newPreviews);
  };

  const nigerianEthnicities = [
    "Hausa-Fulani (North)",
    "Yoruba (Southwest)",
    "Igbo (Southeast)",
    "Ijaw (Niger Delta)",
    "Kanuri (Northeast)",
    "Tiv (Middle Belt)",
    "Edo (South)",
    "Ibibio/Efik (South-South)",
    "I'd rather not say",
  ];

  const otherEthnicities = [
    "White / caucasian",
    "Asian Black",
    "African Descent",
    "Mixed Race",
    "Mediterranean Middle Eastern",
    "East Indian",
    "Latin-American",
    "Other",
  ];

  const allLanguages = [
    "English",
    "Pidgin English",
    "Hausa",
    "Igbo",
    "Yoruba",
    "Spanish",
    "German",
    "Portuguese",
    "Catalan",
    "Croatian",
    "Euskera",
    "Orean",
    "Macedonian",
    "Punjabi",
    "Slovak",
    "Taiwanese",
    "French",
    "Greek",
    "Dutch",
    "Chinese traditional",
    "Czech",
    "Finnish",
    "Latvian",
    "Malay",
    "Romanian",
    "Slovenian",
    "Tajik",
    "Thai",
    "Italian",
    "Polish",
    "Garian",
    "Chinese",
    "Estonian",
    "Gallero",
    "Lithuanian",
    "Norwegian",
    "Russian",
    "Swahili",
    "Tami",
    "Tongan",
    "Ukrainian",
    "Turkmen",
    "Pashto",
    "Burmese",
    "Moldovan",
    "Marathi",
    "Mallorquin",
    "Nepalese",
    "Serbian",
    "Tagalog",
    "ITelugu",
    "Turkish",
  ];

  // Helper function for step container styling
  const stepContainer = (children: React.ReactNode) => (
    <div className="space-y-8 text-center">{children}</div>
  );

  // Helper function for step heading
  const stepHeading = (text: string) => (
    <h2 className="text-3xl sm:text-4xl font-semibold text-white">{text}</h2>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        // Convert MM/DD/YYYY to YYYY-MM-DD for date input
        const getDateInputValue = () => {
          if (!formData.birthday || formData.birthday === "") return "";
          if (formData.birthday.includes("/")) {
            const [month, day, year] = formData.birthday.split("/");
            if (month && day && year && month.length === 2 && day.length === 2 && year.length === 4) {
              return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
            }
          }
          return "";
        };

        // Format date for display (MM/DD/YYYY)
        const formatDateForDisplay = (dateString: string) => {
          if (!dateString) return "";
          const date = new Date(dateString);
          if (isNaN(date.getTime())) return "";
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          const year = date.getFullYear();
          return `${month}/${day}/${year}`;
        };

        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div className="px-2 sm:px-4">
                  <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white leading-tight mb-3 sm:mb-4 md:mb-5">Hi, let&apos;s get started.<br />When&apos;s your birthday?</h2>
            </div>
            <div>
              <input
                type="date"
                value={getDateInputValue()}
                max={getAdultMaxDateInputValue()}
                onChange={(e) => {
                  const formatted = formatDateForDisplay(e.target.value);
                  if (formatted) {
                    setFormData({ ...formData, birthday: formatted });
                  }
                }}
                className="w-full bg-transparent border-0 border-b-2 border-gray-300/60 text-blue-100 text-center text-base sm:text-lg md:text-xl lg:text-2xl placeholder-blue-200/70 focus:border-blue-200 focus:text-white focus:outline-none pb-2 sm:pb-3 transition-colors [color-scheme:dark]"
                style={{
                  color: 'rgb(219 234 254)',
                }}
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
                    <h2 className="text-3xl sm:text-4xl font-semibold text-white">What&apos;s your first name?</h2>
            </div>
            <div>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    firstName: sanitizeFirstNameInput(e.target.value),
                  })
                }
                placeholder="First name"
                maxLength={50}
                autoComplete="given-name"
                inputMode="text"
                className="w-full bg-transparent border-0 border-b-2 border-gray-300/60 text-blue-100 text-center text-base sm:text-lg md:text-xl lg:text-2xl placeholder-blue-200/70 focus:border-blue-200 focus:text-white focus:outline-none pb-2 sm:pb-3 transition-colors"
              />
            </div>
          </div>
        );

      case 3:
        return stepContainer(
          <>
            <div>{stepHeading("What's your gender?")}</div>
            <div className="space-y-3 sm:space-y-4">
              {["Male", "Female", "Other", "Prefer not to say"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, gender: option })}
                  className={`w-full rounded-xl border-2 p-3 sm:p-4 md:p-5 text-sm sm:text-base md:text-lg lg:text-xl transition-all duration-200 font-medium ${
                    formData.gender === option 
                      ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" 
                      : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </>
        );

      case 4:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Where are you located?</h2>
            </div>
            <div>
              <GooglePlacesAutocomplete
                value={formData.location}
                onChange={(value, prediction) => {
                  setFormData({ ...formData, location: normalizeLocation(value) });
                  setLocationPickedFromGoogle(Boolean(prediction));
                }}
                requireSuggestion
                placeholder="Manchester, United Kingdom"
                className="w-full bg-transparent border-0 border-b-2 border-gray-300/60 text-blue-100 text-center text-base sm:text-lg md:text-xl lg:text-2xl placeholder-blue-200/70 focus:border-blue-200 focus:text-white focus:outline-none pb-2 sm:pb-3 transition-colors"
              />
            </div>
          </div>
        );

      case 5: {
        const aboutMeLength = formData.aboutYourself.trim().length;
        const charactersRemaining = Math.max(ABOUT_ME_MIN_LENGTH - aboutMeLength, 0);
        const showAboutMeSamples = aboutMeLength === 0;

        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Tell us about yourself and what you are looking for</h2>
              <p className="mt-3 text-sm text-blue-100/85">
                Write a short intro about your personality, values, and intentions.
              </p>
            </div>
            <div className="space-y-4">
              <textarea
                value={formData.aboutYourself}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    aboutYourself: e.target.value.slice(0, ABOUT_ME_MAX_LENGTH),
                  })
                }
                placeholder="Write a short intro about your personality, values, and intentions."
                rows={7}
                className="w-full bg-transparent border-0 border-b-2 border-gray-300/60 text-blue-100 text-center text-base sm:text-lg md:text-xl lg:text-2xl placeholder-blue-200/70 focus:border-blue-200 focus:text-white focus:outline-none pb-2 sm:pb-3 transition-colors"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-100/80">
                <span>
                  {aboutMeLength < ABOUT_ME_MIN_LENGTH
                    ? `${charactersRemaining} more characters required`
                    : "Looks good"}
                </span>
                <span>
                  {aboutMeLength}/{ABOUT_ME_MAX_LENGTH}
                </span>
              </div>
            </div>
            {showAboutMeSamples ? (
              <div className="space-y-3 text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/70">
                  Samples (tap to insert)
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ABOUT_ME_SAMPLES.map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      onClick={() => setFormData({ ...formData, aboutYourself: sample.value })}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-center text-xs font-medium text-white/95 backdrop-blur-sm transition hover:bg-white/18"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      }

      case 6:
        const formatHeight = (inches: number) => {
          const feet = Math.floor(inches / 12);
          const remainingInches = inches % 12;
          const cm = Math.round(inches * 2.54);
          return `${feet}'${remainingInches}" • ${cm} cm`;
        };

        const getCurrentHeightValue = () => {
          if (formData.height === "I'd rather not say") {
            return heightInches;
          }
          const match = formData.height.match(/(\d+)'(\d+)"/);
          if (match) {
            return parseInt(match[1]) * 12 + parseInt(match[2]);
          }
          return heightInches;
        };

        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">How tall are you?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              <div className="relative">
                <input
                  type="range"
                  min="55"
                  max="82"
                  value={getCurrentHeightValue()}
                  onChange={(e) => {
                    const inches = parseInt(e.target.value);
                    setHeightInches(inches);
                    setFormData({ ...formData, height: formatHeight(inches) });
                  }}
                  disabled={formData.height === "I'd rather not say"}
                  className="range-brand w-full disabled:opacity-50"
                />
                <div className="mt-2 flex justify-between text-xs text-blue-100/80">
                        <span>4&apos;7&quot;</span>
                        <span>6&apos;10&quot;</span>
                </div>
                <div className="mt-2 text-center text-sm font-medium text-blue-100">
                  {formData.height === "I'd rather not say" ? "I'd rather not say" : formData.height}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (formData.height === "I'd rather not say") {
                    setFormData({ ...formData, height: formatHeight(heightInches) });
                  } else {
                    setFormData({ ...formData, height: "I'd rather not say" });
                  }
                }}
                className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.height === "I'd rather not say" ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                }`}
              >
                          I&apos;d rather not say
              </button>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">What is your ethnicity?</h2>
            </div>
            <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
              <div>
                <div className="space-y-2">
                  {nigerianEthnicities.map((ethnicity) => (
                    <label key={ethnicity} className={`flex items-center space-x-3 rounded-xl border-2 p-3 transition-all duration-200 font-medium cursor-pointer ${
                      formData.ethnicity.includes(ethnicity)
                        ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30"
                        : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.ethnicity.includes(ethnicity)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, ethnicity: [...formData.ethnicity, ethnicity] });
                          } else {
                            setFormData({ ...formData, ethnicity: formData.ethnicity.filter((e) => e !== ethnicity) });
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-white focus:ring-[#1f419a] accent-white"
                      />
                      <span>{ethnicity}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="space-y-2">
                  {otherEthnicities.map((ethnicity) => (
                    <label key={ethnicity} className={`flex items-center space-x-3 rounded-xl border-2 p-3 transition-all duration-200 font-medium cursor-pointer ${
                      formData.ethnicity.includes(ethnicity)
                        ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30"
                        : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.ethnicity.includes(ethnicity)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, ethnicity: [...formData.ethnicity, ethnicity] });
                          } else {
                            setFormData({ ...formData, ethnicity: formData.ethnicity.filter((e) => e !== ethnicity) });
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-white focus:ring-[#1f419a] accent-white"
                      />
                      <span>{ethnicity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 8:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">What is your religion?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {[
                "Agnostic",
                "Buddhist/Taoist",
                "Catholic / Christian",
                "Jewish",
                "Orthodox",
                "Spiritual but not religious",
                "Atheist",
                "Christian / Christian",
                "Protestant",
                "Hindu",
                "Muslim / Islam",
                "Shinto",
                "Sikh",
                "Other",
                "I'd rather not say",
              ].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, religion: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.religion === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 9:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">What is your education level?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["High school", "Associates degree", "PhD / post doctoral", "Some college", "Bachelors degree/Masters", "I'd rather not say"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, education: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.education === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 10:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Which language(s) do you speak?</h2>
            </div>
            <div className="max-h-96 space-y-2.5 sm:space-y-3 overflow-y-auto px-1">
              {allLanguages.map((lang) => {
                const isChecked = formData.languages.includes(lang);
                return (
                  <label
                    key={lang}
                    className={`group flex items-center space-x-3 sm:space-x-4 rounded-xl border-2 p-3 sm:p-4 cursor-pointer transition-all duration-200 ${
                      isChecked
                        ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30"
                        : "border-gray-200/80 bg-white/95 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, languages: [...formData.languages, lang] });
                        } else {
                          setFormData({ ...formData, languages: formData.languages.filter((l) => l !== lang) });
                        }
                      }}
                      className="h-5 w-5 sm:h-5 sm:w-5 rounded border-2 transition-all duration-200 cursor-pointer accent-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/50 focus:ring-offset-1"
                      style={{
                        borderColor: isChecked ? '#1f419a' : '#d1d5db',
                      }}
                    />
                    <span className={`text-sm sm:text-base font-medium transition-colors duration-200 ${
                      isChecked ? "text-white" : "text-gray-700 group-hover:text-gray-900"
                    }`}>
                      {lang}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );

      case 11:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">What is your current relationship status?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {PROFILE_RELATIONSHIP_STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, relationshipStatus: option.label })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.relationshipStatus === option.label ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        );

      case 12:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Do you have children?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {[
                "Doesn't have kids and doesn't want them",
                "Doesn't have kids but might want them",
                "Doesn't have kids but wants them",
                "Has kid(s) and doesn't want more",
                "Has kid(s) and might want more",
                "Has kid(s) and wants more",
                "I'd rather not say",
              ].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, hasChildren: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.hasChildren === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 13:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Do you want children one day?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Want kids", "Don't want kids", "Not sure", "I'd rather not say"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, wantsChildren: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.wantsChildren === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 14:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Do you smoke?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Never", "Smoke Socially", "Smoke Smoke", "Regularly", "Trying to quit"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, smoking: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.smoking === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 15:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">What describe your relocation plan?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Not ready for relocation plan", "Maybe in the future", "Ready for relocation plan", "Not ready to relocate"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, relocationPlan: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.relocationPlan === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 16:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Are you ready to settle down and get married right now?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Absolutely", "No way", "Get married yes, settle down no", "Get married no, settle down yes", "I'd rather not say"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, readyToMarry: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.readyToMarry === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 17:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Relationship type you are looking for?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {[
                "A Marriage (non-monogamous)",
                "Casual dating",
                "Friendship",
                "True love",
                "Marriage (monogamous)",
                "Long-term",
                "Hangout",
                "Meet new people",
                "I'll let destiny be my guide",
              ].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, relationshipType: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.relationshipType === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 18:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Describe your Career Stability</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Job Security", "Marketable Skills", "Growth Opportunities", "Strong Professional Network", "Work-Life Balance"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, careerStability: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.careerStability === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 19:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Describe your Long-Term Goals</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {[
                "Career & Professional Growth",
                "Education & Knowledge",
                "Family & Relationships",
                "Financial Stability & Wealth",
                "Personal Development & Well-being",
                "Travel & Lifestyle",
                "Social Impact & Legacy",
              ].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, longTermGoals: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.longTermGoals === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 20:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Emotional connection that describe you</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {[
                "Romantic Emotional Connection",
                "Familial Emotional Connection",
                "Platonic Emotional Connection",
                "Empathetic Emotional Connection",
                "Spiritual/Soul Connection",
                "Trauma Bond (Toxic Emotional Connection)",
                "Intellectual Emotional Connection",
              ].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, emotionalConnection: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.emotionalConnection === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 21:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Your love languages type?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Words of Affirmation", "Acts of Service", "Quality Time", "Appreciation", "Receiving Gifts", "Physical Touch"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    if (formData.loveLanguages.includes(option)) {
                      setFormData({ ...formData, loveLanguages: formData.loveLanguages.filter((l) => l !== option) });
                    } else {
                      setFormData({ ...formData, loveLanguages: [...formData.loveLanguages, option] });
                    }
                  }}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.loveLanguages.includes(option) ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 22:
        return (
          <div className="space-y-4 sm:space-y-6 md:space-y-8 text-left">
            <div className="rounded-[1.75rem] border border-white/15 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.05))] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.22)] backdrop-blur-xl sm:rounded-[2rem] sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-50/90 sm:px-3 sm:text-[11px]">
                  Personality prompts
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-400/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-50 ring-1 ring-emerald-200/20 sm:px-3 sm:text-xs">
                  {PERSONALITY_PROMPT_REQUIRED_COUNT} required
                </span>
              </div>

              <div className="mt-4 text-center sm:mt-5">
                <h2 className="px-1 text-[clamp(1.8rem,7vw,3.5rem)] font-semibold leading-[1.06] text-white sm:px-2">
                  Reveal your personality
                </h2>
                <p className="mx-auto mt-2.5 max-w-xl text-sm leading-6 text-blue-100/82 sm:mt-3 sm:text-base">
                  Pick three prompts that best reflect your values, dating
                  intentions, and the kind of connection you want to build.
                </p>
              </div>

              <div className="mt-4 grid gap-3 sm:mt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-blue-100/72 sm:text-xs">
                    <span>Prompts completed</span>
                    <span>
                      {countCompletedPersonalityPrompts(formData.personality)} /{" "}
                      {PERSONALITY_PROMPT_REQUIRED_COUNT}
                    </span>
                  </div>
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-950/25">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#f8fafc_0%,#bfdbfe_45%,#86efac_100%)] transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          (countCompletedPersonalityPrompts(formData.personality) /
                            PERSONALITY_PROMPT_REQUIRED_COUNT) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/15 bg-slate-950/20 px-3.5 py-2.5 text-left backdrop-blur-sm sm:px-4 sm:py-3 sm:text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-100/70 sm:text-[11px]">
                    Status
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {countCompletedPersonalityPrompts(formData.personality) >=
                    PERSONALITY_PROMPT_REQUIRED_COUNT
                      ? "Ready to continue"
                      : "In progress"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {PERSONALITY_PROMPT_CONFIGS.map((prompt) => {
                const savedAnswer = savedPersonalityPrompts[prompt.id].trim();
                const draftAnswer = draftPersonalityPrompts[prompt.id];
                const trimmedDraftAnswer = draftAnswer.trim();
                const isExpanded = expandedPersonalityPromptId === prompt.id;
                const isSaved = Boolean(savedAnswer);
                const isDraftValid =
                  trimmedDraftAnswer.length >= PERSONALITY_PROMPT_MIN_LENGTH &&
                  trimmedDraftAnswer.length <= PERSONALITY_PROMPT_MAX_LENGTH;
                const promptIndex =
                  PERSONALITY_PROMPT_CONFIGS.findIndex(
                    ({ id }) => id === prompt.id
                  ) + 1;

                return (
                  <div
                    key={prompt.id}
                    className={`overflow-hidden rounded-[1.75rem] border shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-all duration-200 sm:rounded-[2rem] ${
                      isExpanded
                        ? "border-white/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.07))]"
                        : "border-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.05))] hover:border-white/20 hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.07))]"
                    }`}
                  >
                    {isExpanded ? (
                      <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-2.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white text-sm font-semibold text-[#1f419a] shadow-sm sm:h-9 sm:w-9 sm:rounded-2xl">
                                {String(promptIndex).padStart(2, "0")}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-100/72 sm:px-3 sm:text-[11px]">
                                Prompt
                              </span>
                            </div>
                            <h3 className="mt-1 text-base font-semibold text-white sm:text-xl">
                              {prompt.title}
                            </h3>
                          </div>
                          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end">
                            {isSaved ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/25">
                                <Check className="h-3.5 w-3.5" />
                                Saved
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setExpandedPersonalityPromptId(null)}
                              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:bg-white/10"
                            >
                              Minimize
                            </button>
                          </div>
                        </div>

                        <textarea
                          value={draftAnswer}
                          onChange={(event) =>
                            handlePersonalityDraftChange(prompt.id, event.target.value)
                          }
                          rows={4}
                          placeholder="Write your answer in your own words."
                          className="w-full rounded-[1.35rem] border border-white/15 bg-slate-950/18 px-4 py-3.5 text-sm leading-6 text-white placeholder:text-blue-100/45 focus:border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-200/40 sm:rounded-[1.75rem] sm:px-5 sm:py-4 sm:leading-7"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-100/75">
                          <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1.5">
                            {PERSONALITY_PROMPT_MIN_LENGTH}–{PERSONALITY_PROMPT_MAX_LENGTH} characters
                          </span>
                          <span
                            className={`rounded-full px-3 py-1.5 font-medium ${
                              trimmedDraftAnswer.length > PERSONALITY_PROMPT_MAX_LENGTH
                                ? "bg-rose-500/20 text-rose-100 ring-1 ring-rose-300/25"
                                : trimmedDraftAnswer.length >= PERSONALITY_PROMPT_MIN_LENGTH
                                  ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-300/25"
                                  : "border border-white/12 bg-white/6 text-blue-100/75"
                            }`}
                          >
                            {trimmedDraftAnswer.length}/{PERSONALITY_PROMPT_MAX_LENGTH}
                          </span>
                        </div>

                        <div className="space-y-3 rounded-[1.35rem] border border-white/12 bg-slate-950/14 p-3.5 sm:rounded-[1.75rem] sm:p-4">
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100/70">
                              Sample answers
                            </p>
                            <p className="text-xs text-blue-100/65">
                              Tap one to insert, then personalize it.
                            </p>
                          </div>
                          <div className="grid gap-2">
                            {prompt.samples.map((sample) => (
                              <button
                                key={sample}
                                type="button"
                                onClick={() =>
                                  handlePersonalityDraftChange(prompt.id, sample)
                                }
                                className="rounded-xl border border-white/12 bg-white/8 px-3 py-2.5 text-left text-sm leading-5 text-white/90 transition hover:border-white/20 hover:bg-white/14 sm:rounded-2xl sm:py-3 sm:leading-6"
                              >
                                {sample}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-white/10 pt-2">
                          {isSaved ? (
                            <button
                              type="button"
                              onClick={() =>
                                setDraftPersonalityPrompts((prev) => ({
                                  ...prev,
                                  [prompt.id]: savedAnswer,
                                }))
                              }
                              className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10"
                            >
                              Reset
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handleSavePersonalityPrompt(prompt.id)}
                            disabled={!isDraftValid}
                            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#1f419a] shadow-lg shadow-slate-950/15 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Save Prompt
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpandedPersonalityPromptId(prompt.id)}
                        className="block w-full p-3.5 text-left transition hover:bg-white/5 sm:p-5"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/95 text-sm font-semibold text-[#1f419a] shadow-sm sm:h-11 sm:w-11 sm:rounded-2xl">
                              {String(promptIndex).padStart(2, "0")}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-100/70 sm:text-xs">
                                Prompt
                              </p>
                              <h3 className="mt-1 text-[1.02rem] font-semibold leading-6 text-white sm:text-lg">
                                {prompt.title}
                              </h3>
                              {isSaved ? (
                                <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-blue-100/85">
                                  {getPersonalityPromptPreview(savedAnswer)}
                                </p>
                              ) : (
                                <p className="mt-1.5 text-sm text-blue-100/70">
                                  Add a thoughtful answer in your own words.
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 pl-[3.25rem] sm:flex-shrink-0 sm:justify-end sm:pl-0">
                            {isSaved ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/25">
                                <Check className="h-3.5 w-3.5" />
                                Completed
                              </span>
                            ) : null}
                            <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                              <span className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/85">
                                {isSaved ? "Edit" : "Open"}
                              </span>
                              {!isSaved ? (
                                <span className="text-[10px] uppercase tracking-[0.16em] text-blue-100/55 sm:text-[11px]">
                                  {PERSONALITY_PROMPT_MIN_LENGTH}–{PERSONALITY_PROMPT_MAX_LENGTH}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 23:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <input
              ref={galleryPhotoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <input
              ref={selfiePhotoInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Add photo</h2>
              <p className="mt-2 text-sm text-blue-100/80">
                Upload up to 5 photos to showcase yourself
                {!wasProfileCompleted && (
                  <span className="block">
                    Add at least {MIN_ONBOARDING_PHOTOS} real photos of yourself to continue.
                  </span>
                )}
              </p>
              {!wasProfileCompleted && photoPreviews.length < MIN_ONBOARDING_PHOTOS && (
                <p className="mt-2 text-xs font-medium text-amber-200">
                  {MIN_ONBOARDING_PHOTOS - photoPreviews.length} more photo
                  {MIN_ONBOARDING_PHOTOS - photoPreviews.length === 1 ? "" : "s"} required.
                </p>
              )}
              <p className="mt-2 text-xs text-blue-100/80">
                You can upload from gallery or take a selfie. Add one photo at a time.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {photoPreviews.map((preview, index) => (
                <div key={index} className="relative group">
                  <div className={`overflow-hidden rounded-xl border-2 bg-gray-50 transition-colors ${
                    index === 0 ? "border-yellow-400 ring-2 ring-yellow-400/30" : "border-gray-200"
                  }`}>
                    <Image src={preview} alt={`Photo ${index + 1}`} width={200} height={200} className="h-32 w-full object-cover" />
                  </div>

                  {/* Primary badge */}
                  {index === 0 && (
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-yellow-400 px-2 py-0.5 shadow">
                      <Star className="h-3 w-3 text-yellow-900 fill-yellow-900" />
                      <span className="text-[10px] font-bold text-yellow-900">Primary</span>
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100 z-10"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  {/* Reorder controls — visible on hover */}
                  {photoPreviews.length > 1 && (
                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      {/* Move up / left */}
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => movePhotoUp(index)}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors"
                          title="Move left"
                        >
                          <ArrowUp className="h-3 w-3 -rotate-90" />
                        </button>
                      )}
                      {/* Set as primary */}
                      {index !== 0 && (
                        <button
                          type="button"
                          onClick={() => setAsPrimary(index)}
                          className="flex h-6 items-center gap-0.5 rounded-full bg-yellow-500 px-2 text-yellow-950 hover:bg-yellow-400 transition-colors"
                          title="Set as primary photo"
                        >
                          <Star className="h-3 w-3 fill-current" />
                          <span className="text-[9px] font-bold">Primary</span>
                        </button>
                      )}
                      {/* Move down / right */}
                      {index < photoPreviews.length - 1 && (
                        <button
                          type="button"
                          onClick={() => movePhotoDown(index)}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors"
                          title="Move right"
                        >
                          <ArrowDown className="h-3 w-3 -rotate-90" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {Array.from({ length: 5 - photoPreviews.length }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={openGalleryPhotoPicker}
                  className="flex h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white transition-colors hover:border-[#1f419a] hover:bg-gray-50"
                >
                  <div className="text-center">
                    <Camera className="mx-auto h-8 w-8 text-gray-400" />
                    <span className="mt-1 block text-xs text-gray-500">Add photo</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={openSelfieCamera}
                className="flex w-full items-center justify-center rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                <Camera className="mr-2 h-4 w-4" />
                Take selfie
              </button>
              <button
                type="button"
                onClick={openGalleryPhotoPicker}
                className="flex w-full items-center justify-center rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                Upload from gallery
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const showStatusIndicator =
    (loading && photoUploadProgress !== null) || Boolean(saveStatus);
  const statusToneClass =
    loading && photoUploadProgress !== null
      ? "bg-blue-500/80 text-white"
      : saveStatus === "saving"
        ? "bg-blue-500/80 text-white"
        : "bg-green-500/80 text-white";
  const completedPersonalityPromptCount = countCompletedPersonalityPrompts(
    formData.personality
  );
  const canContinueFromPersonalityStep =
    completedPersonalityPromptCount >= PERSONALITY_PROMPT_REQUIRED_COUNT;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative h-full w-full overflow-y-auto" style={{
        background: 'radial-gradient(ellipse at center, #4169E1 0%, #1E3A8A 50%, #0F172A 100%)'
      }}>
        {/* Header with Progress Bar and Close Button */}
        <div className="sticky top-0 z-10 w-full">
          {/* Progress indicator */}
          <div className="w-full flex justify-center pt-4 sm:pt-6 pb-3 sm:pb-4">
            <div className="w-[70%]">
              <div className="h-1 w-full rounded-full overflow-hidden" style={{
                background: 'linear-gradient(to right, #FCD34D 0%, #FCD34D ' + ((currentStep / totalSteps) * 100) + '%, rgba(255, 255, 255, 0.3) ' + ((currentStep / totalSteps) * 100) + '%, rgba(255, 255, 255, 0.3) 100%)'
              }}></div>
            </div>
          </div>
          
          {/* Auto-save Status Indicator */}
          {showStatusIndicator ? (
            <div className="absolute top-4 sm:top-6 left-4 sm:left-6">
              <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur-sm ${statusToneClass}`}>
                {loading && photoUploadProgress !== null ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Uploading {photoUploadProgress}%</span>
                  </>
                ) : saveStatus === "saving" ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3 w-3" />
                    <span>Saved</span>
                  </>
                )}
              </div>
            </div>
          ) : null}
          
          {/* Close Button */}
          <div className="absolute top-4 sm:top-6 right-4 sm:right-6">
            <Link
              href="/dashboard/profile/my-account"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors backdrop-blur-sm"
            >
              <X className="h-5 w-5" />
            </Link>
          </div>
        </div>

        {/* Main Content - Centered */}
        <main className="flex min-h-screen flex-col items-center justify-center px-4 py-6 sm:py-8 md:py-12 lg:py-16 pb-[calc(env(safe-area-inset-bottom)+6rem)]">

          {/* Step content */}
          <div className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl px-2 sm:px-4 [&_h2]:mx-auto [&_h2]:max-w-[95%] [&_h2]:!text-[clamp(1.6rem,6.2vw,3rem)] [&_h2]:break-words [&_h2]:[overflow-wrap:anywhere] [&_h2]:[text-wrap:balance]">
            {renderStep()}
          </div>

          {/* Navigation buttons */}
          <div
            className={`mt-6 flex w-full max-w-md gap-3 px-2 sm:mt-10 sm:max-w-lg sm:gap-4 sm:px-4 md:mt-12 md:max-w-xl lg:max-w-2xl ${
              currentStep === 22
                ? "items-stretch justify-between"
                : "items-center justify-between"
            }`}
          >
            <button
              type="button"
              onClick={handleBack}
              disabled={currentStep === 1 || loading}
              className={`rounded-lg border-2 border-white/60 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10 ${
                currentStep === 22 ? "shrink-0" : ""
              }`}
            >
              <ArrowLeft className="mr-1 inline h-4 w-4" />
              Back
            </button>
            {currentStep < totalSteps ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={
                  loading ||
                  (currentStep === 22 && !canContinueFromPersonalityStep)
                }
                className={`rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[#1f419a] shadow-lg transition-all hover:shadow-xl hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 sm:px-8 sm:py-4 sm:text-base md:px-10 md:py-5 md:text-lg ${
                  currentStep === 22 ? "min-w-0 flex-1 px-4 sm:flex-none sm:px-8" : ""
                }`}
              >
                {currentStep === 22
                  ? canContinueFromPersonalityStep
                    ? "Continue"
                    : `Complete ${PERSONALITY_PROMPT_REQUIRED_COUNT} prompts`
                  : "That's it"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  loading ||
                  photoPreviews.length <
                    (wasProfileCompleted ? 1 : MIN_ONBOARDING_PHOTOS)
                }
                className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-[#1f419a] shadow-lg transition-colors hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? photoUploadProgress !== null
                    ? `Uploading ${photoUploadProgress}%`
                    : "Saving..."
                  : photoPreviews.length <
                      (wasProfileCompleted ? 1 : MIN_ONBOARDING_PHOTOS)
                    ? `Add ${
                        (wasProfileCompleted ? 1 : MIN_ONBOARDING_PHOTOS) -
                        photoPreviews.length
                      } more photo${
                        (wasProfileCompleted ? 1 : MIN_ONBOARDING_PHOTOS) -
                          photoPreviews.length ===
                        1
                          ? ""
                          : "s"
                      }`
                    : "That's it"}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
