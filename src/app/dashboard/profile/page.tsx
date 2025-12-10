"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, EyeOff, Mail, Compass, Heart, Search as SearchIcon, MessageCircle, ArrowLeft, User, X } from "lucide-react";
import Sidebar from "./components/Sidebar";
import { supabase } from "@/lib/supabase";

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
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [age, setAge] = useState<number | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          return;
        }

        const { data, error } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (error) throw error;

        if (data) {
          setProfile(data);
          
          // Calculate age from date_of_birth
          if (data.date_of_birth) {
            const birthDate = new Date(data.date_of_birth);
            const today = new Date();
            let calculatedAge = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              calculatedAge--;
            }
            setAge(calculatedAge);
          }
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="relative h-full w-full overflow-y-auto" style={{
          background: 'radial-gradient(ellipse at center, #4169E1 0%, #1E3A8A 50%, #0F172A 100%)'
        }}>
          <div className="flex min-h-screen items-center justify-center">
            <div className="text-white">Loading profile...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="relative h-full w-full overflow-y-auto" style={{
          background: 'radial-gradient(ellipse at center, #4169E1 0%, #1E3A8A 50%, #0F172A 100%)'
        }}>
          {/* Close Button - Top Right */}
          <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-10">
            <Link
              href="/dashboard/discover"
              className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors backdrop-blur-sm shadow-lg"
            >
              <X className="h-5 w-5 sm:h-6 sm:w-6" />
            </Link>
          </div>

          {/* Main Content */}
          <main className="flex min-h-screen flex-col items-center justify-center px-4 py-6 sm:py-8 md:py-12 lg:py-16">
            <div className="w-full max-w-2xl text-center space-y-6 sm:space-y-8">
              <div className="space-y-4">
                <div className="relative inline-flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-32 w-32 rounded-full bg-white/10 animate-pulse"></div>
                  </div>
                  <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/30">
                    <User className="h-12 w-12 text-white" />
                  </div>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-2">Create Your Profile</h1>
                  <p className="text-base sm:text-lg text-white/90">Complete your profile to start connecting with amazing people</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                <div className="rounded-2xl bg-white/95 p-6 shadow-lg ring-1 ring-white/20">
                  <div className="h-12 w-12 rounded-full bg-[#eef2ff] flex items-center justify-center mx-auto mb-4">
                    <Heart className="h-6 w-6 text-[#1f419a]" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Get More Matches</h3>
                  <p className="text-sm text-gray-600">Complete profiles get 3x more likes and matches</p>
                </div>
                <div className="rounded-2xl bg-white/95 p-6 shadow-lg ring-1 ring-white/20">
                  <div className="h-12 w-12 rounded-full bg-[#eef2ff] flex items-center justify-center mx-auto mb-4">
                    <SearchIcon className="h-6 w-6 text-[#1f419a]" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Better Discoveries</h3>
                  <p className="text-sm text-gray-600">We'll show you profiles that match your preferences</p>
                </div>
                <div className="rounded-2xl bg-white/95 p-6 shadow-lg ring-1 ring-white/20">
                  <div className="h-12 w-12 rounded-full bg-[#eef2ff] flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="h-6 w-6 text-[#1f419a]" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Stand Out</h3>
                  <p className="text-sm text-gray-600">Show your personality and attract the right people</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-[#1f419a] to-[#4463cf] rounded-2xl p-6 sm:p-8 text-white space-y-4">
                <h2 className="text-xl sm:text-2xl font-bold">Ready to get started?</h2>
                <p className="text-white/90 text-sm sm:text-base">It only takes a few minutes to create your profile and start your journey to finding love.</p>
                <Link 
                  href="/dashboard/profile/edit" 
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#1f419a] px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-semibold shadow-xl hover:bg-gray-50 transition-colors"
                >
                  <User className="h-5 w-5" />
                  Create My Profile
                </Link>
                <p className="text-sm text-white/80 mt-4">Already started? <Link href="/dashboard/profile/edit" className="underline font-medium">Continue editing</Link></p>
              </div>

              <div className="text-sm text-white/80 space-y-2">
                <p>✓ Quick and easy setup</p>
                <p>✓ Your information is secure and private</p>
                <p>✓ You can edit your profile anytime</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Format height
  const formatHeight = (cm: number | null): string => {
    if (!cm) return "Not specified";
    const feet = Math.floor(cm / 30.48);
    const inches = Math.round((cm % 30.48) / 2.54);
    return `${feet}'${inches}" • ${cm} cm`;
  };

  // Format smoking habits
  const formatSmoking = (habits: string | null): string => {
    if (!habits) return "Not specified";
    return habits
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Build tags array
  const tags: string[] = [];
  if (profile.height_cm) tags.push(formatHeight(profile.height_cm));
  if (profile.education_level) tags.push(profile.education_level);
  if (profile.smoking_habits) tags.push(formatSmoking(profile.smoking_habits));
  if (profile.have_children !== null) {
    tags.push(profile.have_children ? "Have kids" : "Don't have kids");
  }
  if (profile.want_children) {
    const wantKids = profile.want_children === "yes" ? "Want kids" : profile.want_children === "no" ? "Don't want kids" : "Not sure";
    tags.push(wantKids);
  }

  // Build I am array
  const iAm: string[] = [];
  if (profile.ethnicity) iAm.push(profile.ethnicity);
  if (profile.religion) iAm.push(profile.religion);

  const primaryPhoto = profile.photos && profile.photos.length > 0 
    ? profile.photos[0] 
    : profile.profile_photo_url 
    ? profile.profile_photo_url 
    : "https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?auto=format&fit=crop&w=1200&q=80";

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="relative h-full w-full overflow-y-auto" style={{
          background: 'radial-gradient(ellipse at center, #4169E1 0%, #1E3A8A 50%, #0F172A 100%)'
        }}>
          {/* Close Button - Top Right */}
          <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-10">
            <Link
              href="/dashboard/discover"
              className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors backdrop-blur-sm shadow-lg"
            >
              <X className="h-5 w-5 sm:h-6 sm:w-6" />
            </Link>
          </div>

          {/* Main Content */}
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <section className="space-y-4">
            <div className="flex items-center">
              <Link href="/dashboard/profile/my-account" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/90 px-3 py-2 text-sm text-[#1f419a] shadow-sm hover:bg-white transition-colors">
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </Link>
            </div>
            <div className="rounded-3xl bg-white/95 p-4 sm:p-6 shadow-lg ring-1 ring-white/20">
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900">{profile.first_name || "User"}</div>
                <div className="mt-1 text-sm text-gray-600">
                  {age !== null && `Age ${age}`}
                  {profile.location && `, ${profile.location}`}
                </div>
                {tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tags.map((t, i) => (
                      <span key={i} className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[360px_1fr]">
                <div>
                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <Image
                      src={primaryPhoto}
                      alt={profile.first_name || "Profile"}
                      width={1200}
                      height={900}
                      className="h-[320px] w-full object-cover"
                      unoptimized
                    />
                  </div>
                </div>
                <div>
                  {(profile.about_yourself || profile.personality_type) && (
                    <>
                      <div className="text-lg font-semibold text-gray-900">About me</div>
                      <div className="mt-1 text-gray-800">
                        {profile.about_yourself || profile.personality_type || "No description available"}
                      </div>
                    </>
                  )}
                  {iAm.length > 0 && (
                    <div className="mt-6">
                      <div className="text-sm font-medium text-gray-700">I am</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {iAm.map((t, i) => (
                          <span key={i} className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.languages && profile.languages.length > 0 && (
                    <div className="mt-6">
                      <div className="text-sm font-medium text-gray-700">Home life</div>
                      <div className="mt-2 text-sm text-gray-600">Languages</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {profile.languages.map((lang, i) => (
                          <span key={i} className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">{lang}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
