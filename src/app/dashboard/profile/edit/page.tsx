"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, EyeOff, Mail, Compass, Heart, Search as SearchIcon, MessageCircle, ArrowLeft, ChevronRight, Camera, Upload, X, Check } from "lucide-react";
import GooglePlacesAutocomplete from "@/components/GooglePlacesAutocomplete";
import { supabase } from "@/lib/supabase";

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

  const totalSteps = 23;

  // Load existing profile data
  useEffect(() => {
    const loadProfileData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (profile) {
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
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setDataLoaded(true);
      }
    };

    loadProfileData();
  }, []);

  const handleNext = () => {
    // Validate current step before proceeding
    if (currentStep === 3 && !formData.gender) {
      alert("Please select your gender");
      return;
    }
    if (currentStep === 2 && !formData.firstName.trim()) {
      alert("Please enter your first name");
      return;
    }
    if (currentStep === 1 && !formData.birthday) {
      alert("Please enter your birthday");
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
      // Get user - try getUser first as it's more reliable
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      // If getUser fails, try getSession as fallback
      let finalUser = user;
      
      if (userError || !user) {
        console.warn("getUser failed, trying getSession:", userError);
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session || !session.user) {
          console.error("Both getUser and getSession failed:", sessionError);
          // Only redirect if we're absolutely sure there's no valid session
          alert("Your session has expired. Please log in again.");
          router.push("/login");
          return;
        }
        
        // Use user from session
        finalUser = session.user;
      }
      
      // Final validation
      if (!finalUser || !finalUser.id) {
        console.error("No valid user found");
        alert("Authentication error. Please log in again.");
        router.push("/login");
        return;
      }

      // Parse birthday to date format
      const [month, day, year] = formData.birthday.split("/");
      const dateOfBirth = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

      // Parse height to cm
      const heightMatch = formData.height.match(/(\d+)\s*cm/);
      const heightCm = heightMatch ? parseInt(heightMatch[1]) : null;

      // Upload photos to storage
      const photoUrls: string[] = [];
      for (let i = 0; i < formData.photos.length; i++) {
        const file = formData.photos[i];
        const fileExt = file.name.split(".").pop();
        const fileName = `${finalUser.id}/${Date.now()}_${i}.${fileExt}`;
        // Don't include bucket name in path - storage.from() already handles that
        const filePath = fileName;

        const { error: uploadError } = await supabase.storage
          .from("profile-images")
          .upload(filePath, file, { upsert: true });

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from("profile-images")
            .getPublicUrl(filePath);
          photoUrls.push(publicUrl);
        } else {
          console.error("Photo upload error:", uploadError);
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
        photos: photoUrls.length > 0 ? photoUrls : null,
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
      const errorMessage = error?.message || error?.details || "Failed to save profile. Please try again.";
      
      // Don't redirect to login on save errors - just show the error
      // Only redirect if it's an authentication error
      if (error?.message?.includes("session") || error?.message?.includes("auth") || error?.message?.includes("unauthorized")) {
        alert("Your session has expired. Please log in again.");
        router.push("/login");
      } else {
        alert(`Error: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + formData.photos.length > 5) {
      alert("You can only upload up to 5 photos");
      return;
    }
    const newPhotos = [...formData.photos, ...files];
    setFormData({ ...formData, photos: newPhotos });

    // Create previews
    const newPreviews = files.map((file) => URL.createObjectURL(file));
    setPhotoPreviews([...photoPreviews, ...newPreviews]);
  };

  const removePhoto = (index: number) => {
    const newPhotos = formData.photos.filter((_, i) => i !== index);
    const newPreviews = photoPreviews.filter((_, i) => i !== index);
    setFormData({ ...formData, photos: newPhotos });
    setPhotoPreviews(newPreviews);
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
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                    <Image src={preview} alt={`Photo ${index + 1}`} width={200} height={200} className="h-32 w-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
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
