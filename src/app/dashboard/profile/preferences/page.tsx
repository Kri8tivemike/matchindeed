"use client";
import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, EyeOff, Mail, Compass, Heart, Search as SearchIcon, MessageCircle, ArrowLeft, ChevronRight, CheckCircle2, Video, Eye, Sparkles as SparklesIcon, Calendar, X, Check } from "lucide-react";
import GooglePlacesAutocomplete from "@/components/GooglePlacesAutocomplete";
import { supabase } from "@/lib/supabase";

type PreferenceData = {
  lookingFor: string;
  location: string;
  ageRange: string;
  height: string;
  ethnicity: {
    nigerian: string[];
    other: string[];
  };
  languages: {
    nigerian: string[];
    other: string[];
  };
  education: string;
  employment: string;
  drinking: string;
  smoking: string;
  diet: string;
  religion: string;
  hasChildren: string;
  wantsChildren: string;
  pets: string;
  benefits: string[];
};

function PreferencesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Check if we should start at congratulations step
  useEffect(() => {
    const checkPreferencesStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check URL parameter first
        const stepParam = searchParams.get("step");
        if (stepParam === "16") {
          setCurrentStep(16);
          setInitialized(true);
          return;
        }

        // Check if preferences are already completed
        const { data: progress } = await supabase
          .from("user_progress")
          .select("preferences_completed")
          .eq("user_id", user.id)
          .single();

        if (progress && progress.preferences_completed) {
          // Preferences already completed, show congratulations step
          setCurrentStep(16);
        }
      } catch (error) {
        console.error("Error checking preferences status:", error);
      } finally {
        setInitialized(true);
      }
    };

    checkPreferencesStatus();
  }, [searchParams]);
  const [formData, setFormData] = useState<PreferenceData>({
    lookingFor: "",
    location: "",
    ageRange: "20 - 29",
    height: "6'0\" • 183 cm", // Default to 6'0" as shown in requirements
    ethnicity: { nigerian: ["I'd rather not say"], other: ["I'd rather not say"] },
    languages: { nigerian: [], other: [] },
    education: "High school",
    employment: "Employed",
    drinking: "Drinks often",
    smoking: "Smoke Smoke",
    diet: "Gluten",
    religion: "Hindu",
    hasChildren: "Doesn't have kids",
    wantsChildren: "Doesn't want kids",
    pets: "Doesn't have pet(s)",
    benefits: [],
  });

  const [heightInches, setHeightInches] = useState(72); // 6'0" default

  const totalSteps = 16;

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Parse age range to min/max
      const ageRangeMatch = formData.ageRange.match(/(\d+)\s*-\s*(\d+)/);
      const ageMin = ageRangeMatch ? parseInt(ageRangeMatch[1]) : null;
      const ageMax = ageRangeMatch ? parseInt(ageRangeMatch[2]) : null;

      // Parse height to cm
      let heightMinCm = null;
      let heightMaxCm = null;
      if (formData.height !== "Open to any height") {
        const heightMatch = formData.height.match(/(\d+)\s*cm/);
        if (heightMatch) {
          const heightCm = parseInt(heightMatch[1]);
          heightMinCm = heightCm - 5; // Allow 5cm range
          heightMaxCm = heightCm + 5;
        }
      }

      // Map values to match database constraints
      const mapEmployment = (value: string): string | null => {
        if (!value) return null;
        const lower = value.toLowerCase();
        if (lower.includes("full-time") || lower.includes("employed")) return "full_time";
        if (lower.includes("part-time")) return "part_time";
        if (lower.includes("self-employed") || lower.includes("freelance")) return "self_employed";
        if (lower.includes("student")) return "student";
        if (lower.includes("retired")) return "retired";
        return "any";
      };

      const mapExperience = (value: string): string | null => {
        if (!value) return null;
        const lower = value.toLowerCase();
        if (lower.includes("serious") || lower.includes("marriage") || lower.includes("true love")) return "serious_relationship";
        if (lower.includes("casual") || lower.includes("hangout")) return "casual_dating";
        if (lower.includes("marriage")) return "marriage_focused";
        return "any";
      };

      const mapDiet = (value: string): string | null => {
        if (!value) return null;
        const lower = value.toLowerCase();
        if (lower.includes("vegetarian")) return "vegetarian";
        if (lower.includes("vegan")) return "vegan";
        if (lower.includes("halal")) return "halal";
        if (lower.includes("kosher")) return "kosher";
        return "any";
      };

      // Update user profile with preferences
      const preferencesUpdate: any = {
        user_id: user.id,
        partner_location: formData.location || null,
        partner_age_range: formData.ageRange || null,
        partner_height_min_cm: heightMinCm,
        partner_height_max_cm: heightMaxCm,
        partner_ethnicity: formData.ethnicity.nigerian.length > 0 || formData.ethnicity.other.length > 0 
          ? [...formData.ethnicity.nigerian, ...formData.ethnicity.other] 
          : null,
        partner_religion: formData.religion ? [formData.religion] : null,
        partner_education: formData.education ? [formData.education] : null,
        partner_have_children: formData.hasChildren === "Has kids" ? "yes" : formData.hasChildren === "Doesn't have kids" ? "no" : "doesnt_matter",
        partner_want_children: formData.wantsChildren === "Wants kids" ? "yes" : formData.wantsChildren === "Doesn't want kids" ? "no" : "doesnt_matter",
        partner_smoking: formData.smoking === "Never" ? "no" : formData.smoking === "Smoke Smoke" || formData.smoking === "Smoke Socially" ? "yes" : "doesnt_matter",
        partner_drinking: formData.drinking === "Doesn't drink" ? "no" : formData.drinking === "Drinks often" ? "yes" : "doesnt_matter",
        partner_diet: mapDiet(formData.diet),
        partner_employment: mapEmployment(formData.employment),
        partner_experience: mapExperience(formData.relationshipType),
        partner_pets: formData.pets === "Doesn't have pet(s)" ? "no" : formData.pets.includes("Has") ? "yes" : "doesnt_matter",
        preferences_completed: true,
      };

      const { error: profileError } = await supabase
        .from("user_profiles")
        .upsert(preferencesUpdate, { onConflict: "user_id" });

      if (profileError) {
        throw profileError;
      }

      // Update user progress
      const { error: progressError } = await supabase
        .from("user_progress")
        .upsert({
          user_id: user.id,
          preferences_completed: true,
        }, { onConflict: "user_id" });

      if (progressError) {
        throw progressError;
      }

      // Redirect to subscription page
      router.push("/dashboard/profile/subscription");
    } catch (error) {
      console.error("Error saving preferences:", error);
      alert("Failed to save preferences. Please try again.");
    } finally {
      setLoading(false);
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
    "White/caucasian",
    "Mixed Race",
    "Latin-American",
    "Asian",
    "Black",
    "Mediterranean",
    "Middle Eastern",
    "African Descent",
    "East Indian",
    "Other",
    "I'd rather not say",
  ];

  const nigerianLanguages = ["English", "Pidgin English", "Hausa", "Igbo", "Yoruba"];
  const otherLanguages = [
    "French",
    "Chinese",
    "Spanish",
    "Swahili",
    "Arabic",
    "Portuguese",
    "German",
    "Italian",
    "Japanese",
    "Korean",
    "Russian",
    "Hindi",
    "Other",
  ];

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div className="px-2 sm:px-4">
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white mb-3 sm:mb-4 md:mb-5 leading-tight">Tell us who you're looking for.</h2>
              <p className="mt-3 sm:mt-4 md:mt-5 text-white/90 text-sm sm:text-base md:text-lg lg:text-xl leading-relaxed max-w-2xl mx-auto">That way we can recommend singles to tickle your fancy.<br />And vice versa.</p>
            </div>
            <div className="space-y-3 sm:space-y-4 mt-6 sm:mt-8">
              {["I'm a man seeking a woman", "I'm a woman seeking a man", "I'm a man seeking a man", "I'm a woman seeking a woman"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, lookingFor: option })}
                  className={`w-full rounded-xl border-2 p-3 sm:p-4 md:p-5 text-left transition-all duration-200 font-medium text-sm sm:text-base md:text-lg lg:text-xl ${
                    formData.lookingFor === option 
                      ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" 
                      : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">What is your ideal partner's location?</h2>
            </div>
            <div>
              <GooglePlacesAutocomplete
                value={formData.location}
                onChange={(value) => setFormData({ ...formData, location: value })}
                placeholder="Leicester, United Kingdom"
                className="w-full bg-transparent border-0 border-b-2 border-white/50 text-white text-center text-base sm:text-lg md:text-xl lg:text-2xl placeholder-white/50 focus:border-white focus:outline-none pb-2 sm:pb-3"
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Roughly what age is your ideal partner?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["20 - 29", "30 - 39", "40 - 49", "50 - 59", "Others", "I'd rather not say"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, ageRange: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.ageRange === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 4:
        const formatHeight = (inches: number) => {
          const feet = Math.floor(inches / 12);
          const remainingInches = inches % 12;
          const cm = Math.round(inches * 2.54);
          return `${feet}'${remainingInches}" • ${cm} cm`;
        };

        const getCurrentHeightValue = () => {
          if (formData.height === "Open to any height") {
            return heightInches;
          }
          // Parse height string like "6'0\" • 183 cm"
          const match = formData.height.match(/(\d+)'(\d+)"/);
          if (match) {
            return parseInt(match[1]) * 12 + parseInt(match[2]);
          }
          return heightInches;
        };

        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Roughly how tall is your ideal partner?</h2>
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
                  disabled={formData.height === "Open to any height"}
                  className="range-brand w-full disabled:opacity-50"
                />
                <div className="mt-2 flex justify-between text-xs text-gray-500">
                  <span>4'7"</span>
                  <span>6'10"</span>
                </div>
                <div className="mt-2 text-center text-sm font-medium text-gray-900">
                  {formData.height === "Open to any height" ? "Open to any height" : formData.height}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (formData.height === "Open to any height") {
                    setFormData({ ...formData, height: formatHeight(heightInches) });
                  } else {
                    setFormData({ ...formData, height: "Open to any height" });
                  }
                }}
                className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                  formData.height === "Open to any height" ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                }`}
              >
                Open to any height
              </button>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">What is your ideal partner's ethnicity?</h2>
            </div>
            <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-3">She is a Nigerian...</label>
                <div className="space-y-2">
                  {nigerianEthnicities.map((ethnicity) => (
                    <label key={ethnicity} className={`flex items-center space-x-3 rounded-xl border-2 p-3 transition-all duration-200 font-medium cursor-pointer ${
                      formData.ethnicity.nigerian.includes(ethnicity)
                        ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30"
                        : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.ethnicity.nigerian.includes(ethnicity)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              ethnicity: {
                                ...formData.ethnicity,
                                nigerian: [...formData.ethnicity.nigerian, ethnicity],
                              },
                            });
                          } else {
                            setFormData({
                              ...formData,
                              ethnicity: {
                                ...formData.ethnicity,
                                nigerian: formData.ethnicity.nigerian.filter((e) => e !== ethnicity),
                              },
                            });
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-white focus:ring-white/50 accent-white"
                      />
                      <span>{ethnicity}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-3">Other countries</label>
                <div className="space-y-2">
                  {otherEthnicities.map((ethnicity) => (
                    <label key={ethnicity} className={`flex items-center space-x-3 rounded-xl border-2 p-3 transition-all duration-200 font-medium cursor-pointer ${
                      formData.ethnicity.other.includes(ethnicity)
                        ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30"
                        : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.ethnicity.other.includes(ethnicity)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              ethnicity: {
                                ...formData.ethnicity,
                                other: [...formData.ethnicity.other, ethnicity],
                              },
                            });
                          } else {
                            setFormData({
                              ...formData,
                              ethnicity: {
                                ...formData.ethnicity,
                                other: formData.ethnicity.other.filter((e) => e !== ethnicity),
                              },
                            });
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-white focus:ring-white/50 accent-white"
                      />
                      <span>{ethnicity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Which language(s) does your ideal partner speak?</h2>
            </div>
            <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-3">She is a Nigerian...</label>
                <div className="space-y-2">
                  {nigerianLanguages.map((lang) => (
                    <label key={lang} className={`flex items-center space-x-3 rounded-xl border-2 p-3 transition-all duration-200 font-medium cursor-pointer ${
                      formData.languages.nigerian.includes(lang)
                        ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30"
                        : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.languages.nigerian.includes(lang)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              languages: {
                                ...formData.languages,
                                nigerian: [...formData.languages.nigerian, lang],
                              },
                            });
                          } else {
                            setFormData({
                              ...formData,
                              languages: {
                                ...formData.languages,
                                nigerian: formData.languages.nigerian.filter((l) => l !== lang),
                              },
                            });
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-white focus:ring-white/50 accent-white"
                      />
                      <span>{lang}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/90 mb-3">Other Languages</label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {otherLanguages.map((lang) => (
                    <label key={lang} className={`flex items-center space-x-3 rounded-xl border-2 p-3 transition-all duration-200 font-medium cursor-pointer ${
                      formData.languages.other.includes(lang)
                        ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30"
                        : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.languages.other.includes(lang)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              languages: {
                                ...formData.languages,
                                other: [...formData.languages.other, lang],
                              },
                            });
                          } else {
                            setFormData({
                              ...formData,
                              languages: {
                                ...formData.languages,
                                other: formData.languages.other.filter((l) => l !== lang),
                              },
                            });
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-white focus:ring-white/50 accent-white"
                      />
                      <span>{lang}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">What is your ideal partner's education level?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["High school", "Some college", "Associates degree", "Bachelors degree/Masters", "PhD / post doctoral", "No preference"].map((option) => (
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

      case 8:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">My ideal partner's employment?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Employed", "Full-time Employed", "Part-time", "Freelance worker", "Self-employed", "Unemployed", "Retired"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, employment: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.employment === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
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
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">My ideal partner's drinking lifestyle?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Drinks often", "Drinks sometimes", "Doesn't drink", "I'd rather not say"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, drinking: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.drinking === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
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
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Are you ok with a partner who smokes?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Never", "Smoke Socially", "Smoke Smoke", "Trying to quit", "No preference"].map((option) => (
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

      case 11:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">My ideal partner's diet?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {[
                "Omnivore",
                "Vegetarian",
                "Vegan",
                "Kosher",
                "Halal",
                "Gluten",
                "Free Pescatarian",
                "Jain",
                "Lacto vegetarian",
                "Intermittent",
                "Ketogenic",
                "Fasting",
              ].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, diet: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.diet === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
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
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">What is your ideal partner's religion?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {[
                "Agnostic",
                "Atheist",
                "Buddhist/Taoist",
                "Christian/Christian",
                "Catholic/Christian",
                "Protestant",
                "Hindu",
                "Jewish",
                "Muslim/Islam",
                "Orthodox",
                "Shinto",
                "Sikh",
                "Spiritual but not religious",
                "Other",
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

      case 13:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Does your ideal partner have children?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Has kids", "Doesn't have kids", "No preference"].map((option) => (
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

      case 14:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">Does your ideal partner want children?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Wants kids", "Doesn't want kids", "Not sure", "No preference"].map((option) => (
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

      case 15:
        return (
          <div className="space-y-6 sm:space-y-8 md:space-y-10 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold text-white text-center leading-tight px-2 sm:px-4">My ideal partner's pet(s)?</h2>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {["Doesn't have pet(s)", "Has other pet(s)", "Has cat(s)", "Has dog(s)"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFormData({ ...formData, pets: option })}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 font-medium ${
                    formData.pets === option ? "border-[#1f419a] bg-[#1f419a] text-white shadow-lg shadow-[#1f419a]/30" : "border-gray-200/60 bg-white/90 text-gray-700 hover:border-gray-300 hover:bg-white hover:shadow-sm"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 16:
        const features = [
          {
            icon: Video,
            title: "Unlimited video dating meeting",
            description: "Connect face-to-face with your matches through unlimited video calls",
          },
          {
            icon: Heart,
            title: "Find out who is interested in you",
            description: "See who has liked your profile and discover mutual connections",
          },
          {
            icon: Eye,
            title: "Browse without adverts",
            description: "Enjoy an uninterrupted experience with an ad-free platform",
          },
          {
            icon: Calendar,
            title: "Enjoy preferential offers for our Events",
            description: "Get exclusive access to MatchIndeed events and special offers",
          },
        ];

        return (
          <div className="space-y-8">
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-white shadow-lg">
                <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 text-[#1f419a]" />
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3">Congratulations!</h2>
              <p className="mt-2 text-base sm:text-lg text-white/90">You've completed your preferences setup</p>
              <p className="mt-2 text-sm sm:text-base text-blue-100/80">Now you can enjoy the full MatchIndeed experience</p>
            </div>

            <div className="space-y-4 sm:space-y-6 mt-8">
              <h3 className="text-xl sm:text-2xl font-semibold text-white text-center">Here's what you'll enjoy on MatchIndeed:</h3>
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                {features.map((feature, index) => {
                  const IconComponent = feature.icon;
                  return (
                    <div
                      key={index}
                      className="rounded-2xl border-2 border-white/20 bg-white/95 p-4 sm:p-6 shadow-lg transition-all hover:shadow-xl hover:border-white/30"
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1f419a]">
                          <IconComponent className="h-6 w-6 text-white" />
                        </div>
                        <h4 className="text-base sm:text-lg font-semibold text-[#1f419a]">{feature.title}</h4>
                      </div>
                      <p className="text-sm text-gray-700">{feature.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] p-6 sm:p-8 text-center text-white mt-6 sm:mt-8">
              <p className="text-lg sm:text-xl font-medium">Ready to find your perfect match?</p>
              <p className="mt-2 text-sm sm:text-base text-white/90">Start discovering compatible singles now!</p>
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
            {!initialized ? (
              <div className="text-white text-center">Loading...</div>
            ) : (
              renderStep()
            )}
          </div>

          {/* Navigation button - Bottom Right */}
          {initialized && currentStep !== 16 && (
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
          )}
          
          {/* Button for congratulations step */}
          {initialized && currentStep === 16 && (
            <div className="mt-8 sm:mt-10 md:mt-12 flex w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl justify-end px-2 sm:px-4">
              <Link
                href="/dashboard/discover"
                className="rounded-lg bg-white px-6 py-3 sm:px-8 sm:py-4 md:px-10 md:py-5 text-sm sm:text-base md:text-lg font-semibold text-[#1f419a] shadow-lg transition-all hover:shadow-xl hover:scale-105"
              >
                That's it
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function PreferencesPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="relative h-full w-full overflow-y-auto" style={{
          background: 'radial-gradient(ellipse at center, #4169E1 0%, #1E3A8A 50%, #0F172A 100%)'
        }}>
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-white">Loading...</div>
          </div>
        </div>
      </div>
    }>
      <PreferencesPageContent />
    </Suspense>
  );
}

