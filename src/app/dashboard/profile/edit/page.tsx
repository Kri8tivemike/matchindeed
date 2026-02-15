"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, EyeOff, Mail, Compass, Heart, Search as SearchIcon, MessageCircle, ArrowLeft, ChevronRight, Camera, Upload, X, Check, Save, Loader2, ArrowUp, ArrowDown, Star } from "lucide-react";
import GooglePlacesAutocomplete from "@/components/GooglePlacesAutocomplete";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import { saveFormDraft, loadFormDraft, clearFormDraft, hasFormDraft, getDraftTimestamp } from "@/lib/form-autosave";

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

export default function EditProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ProfileData>({
    birthday: "02/28/2003",
    firstName: "",
    gender: "",
    location: "Manchester, United Kingdom",
    aboutYourself: "",
    height: "6'4\" • 193 cm",
    ethnicity: ["I'd rather not say"],
    religion: "Protestant",
    education: "High school",
    languages: [],
    relationshipStatus: "Single",
    hasChildren: "Doesn't have kids but wants them",
    wantsChildren: "Not sure",
    smoking: "Smoke Smoke",
    relocationPlan: "Not ready for relocation plan",
    readyToMarry: "Get married yes, settle down no",
    relationshipType: "Hangout",
    careerStability: "Job Security",
    longTermGoals: "Career & Professional Growth",
    emotionalConnection: "Intellectual Emotional Connection",
    loveLanguages: ["Words of Affirmation"],
    personality: "",
    photos: [],
  });

  const [heightInches, setHeightInches] = useState(76); // 6'4" default
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const totalSteps = 23;
  const FORM_DRAFT_KEY = "profile_edit";

  // Load draft data first (before database)
  useEffect(() => {
    const loadDraft = () => {
      const draft = loadFormDraft<ProfileData & { heightInches?: number; currentStep?: number }>(FORM_DRAFT_KEY);
      if (draft) {
        // Restore form data from draft
        setFormData({
          birthday: draft.birthday || "02/28/2003",
          firstName: draft.firstName || "",
          gender: draft.gender || "",
          location: draft.location || "Manchester, United Kingdom",
          aboutYourself: draft.aboutYourself || "",
          height: draft.height || "6'4\" • 193 cm",
          ethnicity: draft.ethnicity || ["I'd rather not say"],
          religion: draft.religion || "Protestant",
          education: draft.education || "High school",
          languages: draft.languages || [],
          relationshipStatus: draft.relationshipStatus || "Single",
          hasChildren: draft.hasChildren || "Doesn't have kids but wants them",
          wantsChildren: draft.wantsChildren || "Not sure",
          smoking: draft.smoking || "Smoke Smoke",
          relocationPlan: draft.relocationPlan || "Not ready for relocation plan",
          readyToMarry: draft.readyToMarry || "Get married yes, settle down no",
          relationshipType: draft.relationshipType || "Hangout",
          careerStability: draft.careerStability || "Job Security",
          longTermGoals: draft.longTermGoals || "Career & Professional Growth",
          emotionalConnection: draft.emotionalConnection || "Intellectual Emotional Connection",
          loveLanguages: draft.loveLanguages || ["Words of Affirmation"],
          personality: draft.personality || "",
          photos: draft.photos || [],
        });
        
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
  }, []);

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
          user = directUser;
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
          .single();

        // If profile exists and is completed, load from database (overwrites draft)
        // If no profile or profile not completed, draft data (already loaded) takes precedence
        if (profile && profile.profile_completed) {
          // Format date of birth
          let birthday = "02/28/2003";
          if (profile.date_of_birth) {
            const date = new Date(profile.date_of_birth);
            birthday = `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
          }

          // Format height
          let height = "6'4\" • 193 cm";
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
            location: profile.location || "Manchester, United Kingdom",
            aboutYourself: profile.about_yourself || "",
            height,
            ethnicity: profile.ethnicity ? profile.ethnicity.split(", ") : ["I'd rather not say"],
            religion: profile.religion || "Protestant",
            education: profile.education_level || "High school",
            languages: profile.languages || [],
            relationshipStatus: profile.relationship_status ? profile.relationship_status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "Single",
            hasChildren: profile.have_children ? "Has kid(s) and wants more" : "Doesn't have kids but wants them",
            wantsChildren: profile.want_children === "yes" ? "Want kids" : profile.want_children === "no" ? "Don't want kids" : "Not sure",
            smoking: profile.smoking_habits ? profile.smoking_habits.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "Smoke Smoke",
            relocationPlan: profile.willing_to_relocate || "Not ready for relocation plan",
            readyToMarry: profile.ready_for_marriage || "Get married yes, settle down no",
            relationshipType: profile.relationship_type || "Hangout",
            careerStability: profile.career_stability || "Job Security",
            longTermGoals: profile.long_term_goals || "Career & Professional Growth",
            emotionalConnection: profile.emotional_connection || "Intellectual Emotional Connection",
            loveLanguages: profile.love_languages || ["Words of Affirmation"],
            personality: profile.personality_type || "",
            photos: [],
          });

          // Load photo previews if available
          if (profile.photos && Array.isArray(profile.photos) && profile.photos.length > 0) {
            setPhotoPreviews(profile.photos);
          } else if (profile.profile_photo_url) {
            setPhotoPreviews([profile.profile_photo_url]);
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
  }, []);

  const handleNext = () => {
    // Validate current step before proceeding
    if (currentStep === 3 && !formData.gender) {
      toast.warning("Please select your gender");
      return;
    }
    if (currentStep === 2 && !formData.firstName.trim()) {
      toast.warning("Please enter your first name");
      return;
    }
    if (currentStep === 1 && !formData.birthday) {
      toast.warning("Please enter your birthday");
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

      // Parse birthday to date format
      const [month, day, year] = formData.birthday.split("/");
      const dateOfBirth = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

      // Parse height to cm
      const heightMatch = formData.height.match(/(\d+)\s*cm/);
      const heightCm = heightMatch ? parseInt(heightMatch[1]) : null;

      // Build final photo list: preserve existing URLs + upload new File objects
      // photoPreviews contains the ordered list of all photos (URLs for existing, blob URLs for new)
      const finalPhotoUrls: string[] = [];
      const uploadErrors: string[] = [];

      // Create a map from blob URL → File for newly added photos
      const blobToFile = new Map<string, File>();
      for (const file of formData.photos) {
        // Each new file has a corresponding blob:// preview URL
        const blobUrl = URL.createObjectURL(file);
        blobToFile.set(blobUrl, file);
        // We can't match by blob URL easily since createObjectURL returns different values
        // Instead, track new files by their position
      }

      // Determine which previews are existing URLs vs new files
      // Existing photos start with http(s):// ; new files have blob:// URLs
      const newFileQueue = [...formData.photos]; // new files in upload order

      for (const preview of photoPreviews) {
        if (preview.startsWith("http://") || preview.startsWith("https://")) {
          // Existing photo URL — keep it as-is in the correct order
          finalPhotoUrls.push(preview);
        } else {
          // This is a blob URL for a newly uploaded file — upload next file from queue
          const file = newFileQueue.shift();
          if (!file) continue;

          // Validate file size (5MB limit)
          const maxSize = 5 * 1024 * 1024;
          if (file.size > maxSize) {
            uploadErrors.push(`Photo "${file.name}" is too large. Maximum size is 5MB.`);
            continue;
          }

          // Validate file type
          const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
          if (!allowedTypes.includes(file.type)) {
            uploadErrors.push(`Photo "${file.name}" has an invalid file type. Please use JPEG, PNG, WebP, or GIF.`);
            continue;
          }

          const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
          const timestamp = Date.now();
          const idx = finalPhotoUrls.length;
          const filePath = `${finalUser.id}/${timestamp}_${idx}.${fileExt}`;

          try {
            const { error: uploadError } = await supabase.storage
              .from("profile-images")
              .upload(filePath, file, {
                upsert: true,
                contentType: file.type,
                cacheControl: "3600",
              });

            if (uploadError) {
              console.error("Photo upload error:", uploadError);
              uploadErrors.push(`Failed to upload "${file.name}": ${uploadError.message || "Unknown error"}`);
              continue;
            }

            const { data: { publicUrl } } = supabase.storage
              .from("profile-images")
              .getPublicUrl(filePath);

            if (publicUrl) {
              finalPhotoUrls.push(publicUrl);
            } else {
              uploadErrors.push(`Failed to get URL for "${file.name}"`);
            }
          } catch (error: any) {
            console.error("Photo upload exception:", error);
            uploadErrors.push(`Error uploading "${file.name}": ${error.message || "Unknown error"}`);
          }
        }
      }

      // Show errors to user if any uploads failed
      if (uploadErrors.length > 0) {
        const errorMessage = uploadErrors.join("\n");
        console.error("Photo upload errors:", errorMessage);

        if (finalPhotoUrls.length === 0 && photoPreviews.length > 0) {
          throw new Error(`Failed to upload photos:\n${errorMessage}`);
        } else if (uploadErrors.length > 0 && finalPhotoUrls.length > 0) {
          toast.warning(`Some photos failed to upload. Continuing with ${finalPhotoUrls.length} photo(s).`);
        }
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

      // Map relationship status to constraint values: 'single', 'divorced', 'widowed', 'separated'
      const mapRelationshipStatus = (value: string): string | null => {
        if (!value) return null;
        const lower = value.toLowerCase();
        if (lower.includes("single")) return "single";
        if (lower.includes("divorced")) return "divorced";
        if (lower.includes("widowed")) return "widowed";
        if (lower.includes("separated")) return "separated";
        return "single"; // default
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

      const profileUpdate: any = {
        user_id: finalUser.id,
        first_name: formData.firstName || null,
        gender: mapGender(formData.gender),
        date_of_birth: dateOfBirth || null,
        location: formData.location || null,
        about_yourself: formData.aboutYourself || null,
        height_cm: heightCm || null,
        ethnicity: formData.ethnicity.length > 0 ? formData.ethnicity.join(", ") : null,
        religion: formData.religion || null,
        education_level: formData.education || null,
        languages: formData.languages.length > 0 ? formData.languages : null,
        relationship_status: mapRelationshipStatus(formData.relationshipStatus),
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
        personality_type: formData.personality || null,
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
            .single();

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
    } catch (error: any) {
      console.error("Error saving profile:", error);
      
      // Extract detailed error message
      let errorMessage = "Failed to save profile. Please try again.";
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.details) {
        errorMessage = error.details;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Log full error details for debugging
      console.error("Full error details:", JSON.stringify({
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        status: error?.status,
        error: error
      }, null, 2));
      
      // Don't redirect to login on save errors - just show the error
      // Only redirect if it's an authentication error
      if (error?.message?.includes("session") || 
          error?.message?.includes("auth") || 
          error?.message?.includes("unauthorized") ||
          error?.code === "PGRST301" ||
          error?.status === 401) {
        toast.error("Your session has expired. Please log in again.");
        router.push("/login");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) {
      return;
    }
    
    // Check total photo count
    if (files.length + formData.photos.length > 5) {
      toast.warning("You can only upload up to 5 photos total. Please remove some photos first.");
      e.target.value = ''; // Reset input
      return;
    }
    
    // Validate file types and sizes
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const validFiles: File[] = [];
    const errors: string[] = [];
    
    files.forEach((file, index) => {
      if (!allowedTypes.includes(file.type)) {
        errors.push(`${file.name}: Invalid file type. Please use JPEG, PNG, WebP, or GIF.`);
        return;
      }
      
      if (file.size > maxSize) {
        errors.push(`${file.name}: File too large. Maximum size is 5MB.`);
        return;
      }
      
      validFiles.push(file);
    });
    
    // Show errors if any
    if (errors.length > 0) {
      toast.error(errors.length === 1 ? errors[0] : `Some files were rejected: ${errors.join("; ")}`);
    }
    
    // Only add valid files
    if (validFiles.length > 0) {
      const newPhotos = [...formData.photos, ...validFiles];
      setFormData({ ...formData, photos: newPhotos });

      // Create previews for valid files
      const newPreviews = validFiles.map((file) => URL.createObjectURL(file));
      setPhotoPreviews([...photoPreviews, ...newPreviews]);
    }
    
    // Reset input to allow selecting the same file again if needed
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    const newPhotos = formData.photos.filter((_, i) => i !== index);
    const newPreviews = photoPreviews.filter((_, i) => i !== index);
    setFormData({ ...formData, photos: newPhotos });
    setPhotoPreviews(newPreviews);
  };

  /** Move a photo up (towards index 0) in the display order */
  const movePhotoUp = (index: number) => {
    if (index <= 0) return;
    const newPreviews = [...photoPreviews];
    [newPreviews[index - 1], newPreviews[index]] = [newPreviews[index], newPreviews[index - 1]];
    setPhotoPreviews(newPreviews);

    const newPhotos = [...formData.photos];
    if (newPhotos.length > index) {
      [newPhotos[index - 1], newPhotos[index]] = [newPhotos[index], newPhotos[index - 1]];
      setFormData({ ...formData, photos: newPhotos });
    }
  };

  /** Move a photo down (towards the end) in the display order */
  const movePhotoDown = (index: number) => {
    if (index >= photoPreviews.length - 1) return;
    const newPreviews = [...photoPreviews];
    [newPreviews[index], newPreviews[index + 1]] = [newPreviews[index + 1], newPreviews[index]];
    setPhotoPreviews(newPreviews);

    const newPhotos = [...formData.photos];
    if (newPhotos.length > index + 1) {
      [newPhotos[index], newPhotos[index + 1]] = [newPhotos[index + 1], newPhotos[index]];
      setFormData({ ...formData, photos: newPhotos });
    }
  };

  /** Set a specific photo as primary (move to index 0) */
  const setAsPrimary = (index: number) => {
    if (index === 0) return;
    const newPreviews = [...photoPreviews];
    const [moved] = newPreviews.splice(index, 1);
    newPreviews.unshift(moved);
    setPhotoPreviews(newPreviews);

    const newPhotos = [...formData.photos];
    if (newPhotos.length > index) {
      const [movedFile] = newPhotos.splice(index, 1);
      newPhotos.unshift(movedFile);
      setFormData({ ...formData, photos: newPhotos });
    }
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

  // Helper function for text input
  const textInput = (value: string, onChange: (value: string) => void, placeholder: string) => (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent border-0 border-b-2 border-gray-300/60 text-blue-100 text-center text-base sm:text-lg md:text-xl lg:text-2xl placeholder-blue-200/70 focus:border-blue-200 focus:text-white focus:outline-none pb-2 sm:pb-3 transition-colors"
    />
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
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white leading-tight mb-3 sm:mb-4 md:mb-5">Hi, let's get started.<br />When's your birthday?</h2>
            </div>
            <div>
              <input
                type="date"
                value={getDateInputValue()}
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
              <h2 className="text-3xl sm:text-4xl font-semibold text-white">What's your first name?</h2>
            </div>
            <div>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="First name"
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
                onChange={(value) => setFormData({ ...formData, location: value })}
                placeholder="Manchester, United Kingdom"
                className="w-full bg-transparent border-0 border-b-2 border-gray-300/60 text-blue-100 text-center text-base sm:text-lg md:text-xl lg:text-2xl placeholder-blue-200/70 focus:border-blue-200 focus:text-white focus:outline-none pb-2 sm:pb-3 transition-colors"
              />
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Complete your profile and tell us about yourself.</h2>
            </div>
            <div>
              <textarea
                value={formData.aboutYourself}
                onChange={(e) => setFormData({ ...formData, aboutYourself: e.target.value })}
                placeholder="Write about yourself..."
                rows={6}
                className="w-full bg-transparent border-0 border-b-2 border-gray-300/60 text-blue-100 text-center text-base sm:text-lg md:text-xl lg:text-2xl placeholder-blue-200/70 focus:border-blue-200 focus:text-white focus:outline-none pb-2 sm:pb-3 transition-colors"
              />
            </div>
          </div>
        );

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
                  <span>4'7"</span>
                  <span>6'10"</span>
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
                I'd rather not say
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
              {["Single", "Separated", "Widowed", "Married (non-monogamous)", "Divorced", "I'd rather not say"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, relationshipStatus: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.relationshipStatus === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
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
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Reveal your personality</h2>
            </div>
            <div>
              <textarea
                value={formData.personality}
                onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
                placeholder="Write about yourself..."
                rows={8}
                className="w-full bg-transparent border-0 border-b-2 border-gray-300/60 text-blue-100 text-center text-base sm:text-lg md:text-xl lg:text-2xl placeholder-blue-200/70 focus:border-blue-200 focus:text-white focus:outline-none pb-2 sm:pb-3 transition-colors"
              />
            </div>
          </div>
        );

      case 23:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Add photo</h2>
              <p className="mt-2 text-sm text-blue-100/80">Upload up to 5 photos to showcase yourself</p>
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
                <label
                  key={index}
                  className="flex h-32 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white transition-colors hover:border-[#1f419a] hover:bg-gray-50"
                >
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" multiple />
                  <div className="text-center">
                    <Camera className="mx-auto h-8 w-8 text-gray-400" />
                    <span className="mt-1 block text-xs text-gray-500">Add photo</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

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
          {saveStatus && (
            <div className="absolute top-4 sm:top-6 left-4 sm:left-6">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm ${
                saveStatus === "saving" 
                  ? "bg-blue-500/80 text-white" 
                  : "bg-green-500/80 text-white"
              }`}>
                {saveStatus === "saving" ? (
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
          )}
          
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
        <main className="flex min-h-screen flex-col items-center justify-center px-4 py-6 sm:py-8 md:py-12 lg:py-16">

          {/* Step content */}
          <div className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl px-2 sm:px-4">
            {renderStep()}
          </div>

          {/* Navigation button - Bottom Right */}
          <div className="mt-8 sm:mt-10 md:mt-12 flex w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl justify-end px-2 sm:px-4">
            {currentStep < totalSteps ? (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-lg bg-white px-6 py-3 sm:px-8 sm:py-4 md:px-10 md:py-5 text-sm sm:text-base md:text-lg font-semibold text-[#1f419a] shadow-lg transition-all hover:shadow-xl hover:scale-105"
              >
                That's it
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-[#1f419a] shadow-lg transition-colors hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Saving..." : "That's it"}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
