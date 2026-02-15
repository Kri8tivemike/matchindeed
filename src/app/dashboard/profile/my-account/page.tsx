"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  User,
  Pencil,
  Shield,
  Lock,
  AlertTriangle,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Power,
  BadgeCheck,
  Sparkles,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import { supabase } from "@/lib/supabase";
import { getCurrentUserSafe } from "@/lib/auth-helpers";
import { useRouter } from "next/navigation";

/* ─── Types ──────────────────────────────────────────────────────── */

type ProfileData = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
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
  career_stability: string | null;
  long_term_goals: string | null;
  emotional_connection: string | null;
  love_languages: string[] | null;
  ready_for_marriage: string | null;
  willing_to_relocate: string | null;
  relationship_type: string | null;
  profile_photo_url: string | null;
  photos: string[] | null;
  user_id: string;
};

type AccountInfo = {
  id: string;
  email: string | null;
  display_name: string | null;
  tier: string | null;
  created_at: string | null;
  status: string | null;
  email_verified: boolean;
};

/* ─── Helpers ────────────────────────────────────────────────────── */

const formatGender = (gender: string | null): string => {
  if (!gender) return "Not specified";
  const map: Record<string, string> = {
    male: "Male",
    female: "Female",
    other: "Other",
    prefer_not_to_say: "Prefer not to say",
  };
  return map[gender.toLowerCase()] || gender.charAt(0).toUpperCase() + gender.slice(1).replace(/_/g, " ");
};

const formatHeight = (cm: number | null): string => {
  if (!cm) return "Not specified";
  const feet = Math.floor(cm / 30.48);
  const inches = Math.round((cm % 30.48) / 2.54);
  return `${feet}'${inches}" (${cm} cm)`;
};

const formatValue = (value: string | null | boolean | string[]): string => {
  if (value === null || value === undefined) return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "Not set";
  if (typeof value === "string") {
    return value
      .replace(/_/g, " ")
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return String(value);
};

const formatDate = (date: string | null): string => {
  if (!date) return "Not set";
  try {
    return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return date;
  }
};

/* ─── Password validation rules ──────────────────────────────────── */

function getPasswordStrength(pw: string) {
  const rules = [
    { label: "At least 8 characters", met: pw.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(pw) },
    { label: "One lowercase letter", met: /[a-z]/.test(pw) },
    { label: "One number", met: /\d/.test(pw) },
    { label: "One special character (!@#$…)", met: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = rules.filter((r) => r.met).length;
  return { rules, score };
}

/* ─── Component ──────────────────────────────────────────────────── */

export default function MyAccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [age, setAge] = useState<number | null>(null);
  const [accessToken, setAccessToken] = useState<string>("");

  // Password change state
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Account actions state
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  /* ── Fetch data ──────────────────────────────────────────────────── */

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.user) {
          setLoading(false);
          return;
        }

        setAccessToken(session.access_token);

        // Refresh expired sessions
        if (session.expires_at && session.expires_at * 1000 < Date.now()) {
          const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !newSession) {
            setLoading(false);
            return;
          }
          setAccessToken(newSession.access_token);
        }

        const user = session.user;

        // Fetch profile
        const { data: profileData } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileData) {
          setProfile({ ...profileData, user_id: user.id } as ProfileData);
          if (profileData.date_of_birth) {
            const birth = new Date(profileData.date_of_birth);
            const today = new Date();
            let a = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
            setAge(a);
          }
        }

        // Fetch account
        const { data: accountData, error: accountError } = await supabase
          .from("accounts")
          .select("id, email, display_name, tier, created_at, status, email_verified")
          .eq("id", user.id)
          .maybeSingle();

        if (accountError || !accountData) {
          setAccount({
            id: user.id,
            email: user.email || null,
            display_name: user.email?.split("@")[0] || null,
            tier: null,
            created_at: null,
            status: "active",
            email_verified: !!user.email_confirmed_at,
          });
        } else {
          setAccount({
            id: accountData.id,
            email: accountData.email,
            display_name: accountData.display_name,
            tier: accountData.tier || null,
            created_at: accountData.created_at || null,
            status: accountData.status || "active",
            email_verified: accountData.email_verified ?? !!user.email_confirmed_at,
          });
        }
      } catch (err) {
        console.error("Error fetching account data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Refresh on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        (async () => {
          try {
            const user = await getCurrentUserSafe();
            if (!user) return;

            const { data } = await supabase
              .from("user_profiles")
              .select("*")
              .eq("user_id", user.id)
              .single();

            if (data) {
              setProfile(data as ProfileData);
              if (data.date_of_birth) {
                const birth = new Date(data.date_of_birth);
                const today = new Date();
                let a = today.getFullYear() - birth.getFullYear();
                const m = today.getMonth() - birth.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
                setAge(a);
              }
            }
          } catch {
            // Silently handle refresh errors
          }
        })();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  /* ── Password change handler ──────────────────────────────────── */

  const handleChangePassword = async () => {
    setPwMessage(null);

    if (newPassword !== confirmPassword) {
      setPwMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    const { score } = getPasswordStrength(newPassword);
    if (score < 4) {
      setPwMessage({ type: "error", text: "Password does not meet security requirements." });
      return;
    }

    try {
      setPwLoading(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        setPwMessage({ type: "error", text: error.message });
      } else {
        setPwMessage({ type: "success", text: "Password updated successfully!" });
        setNewPassword("");
        setConfirmPassword("");
        setShowPasswordSection(false);
      }
    } catch (err) {
      setPwMessage({ type: "error", text: "An unexpected error occurred." });
    } finally {
      setPwLoading(false);
    }
  };

  /* ── Account deactivation ─────────────────────────────────────── */

  const handleDeactivate = async () => {
    try {
      setActionLoading(true);
      setActionMessage(null);

      const res = await fetch("/api/profile/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: "deactivate" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to deactivate");

      setActionMessage({ type: "success", text: "Account deactivated. Signing you out..." });
      setShowDeactivateModal(false);

      // Sign out after a short delay
      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push("/login");
      }, 2000);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to deactivate account" });
    } finally {
      setActionLoading(false);
    }
  };

  /* ── Account deletion ─────────────────────────────────────────── */

  const handleDelete = async () => {
    if (deleteConfirmText !== "DELETE") return;

    try {
      setActionLoading(true);
      setActionMessage(null);

      const res = await fetch("/api/profile/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ confirm: true }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete account");

      setActionMessage({ type: "success", text: "Account deleted. Redirecting..." });
      setShowDeleteModal(false);

      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push("/login");
      }, 2000);
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to delete account" });
    } finally {
      setActionLoading(false);
    }
  };

  /* ── Derived values ───────────────────────────────────────────── */

  const primaryPhoto =
    profile?.photos && profile.photos.length > 0
      ? profile.photos[0]
      : profile?.profile_photo_url || "/placeholder-profile.svg";

  const customerNumber = profile?.user_id ? profile.user_id.substring(0, 9).toUpperCase() : "N/A";

  const pwStrength = getPasswordStrength(newPassword);

  /* ── InfoField helper component ────────────────────────────────── */

  const InfoField = ({ label, value }: { label: string; value: string }) => (
    <div className="group relative rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 sm:p-3 lg:p-4 hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all">
      <div className="mb-1 sm:mb-1.5 lg:mb-2">
        <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xs sm:text-sm lg:text-base font-semibold text-gray-900 break-words">{value}</div>
    </div>
  );

  /* ── Loading state ─────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/matchindeed.svg" alt="Matchindeed" width={140} height={36} style={{ width: "auto", height: "auto" }} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 flex-shrink-0">
          <Sidebar active="my-account" />
        </aside>

        {/* Main Content */}
        <section className="min-w-0 flex-1 space-y-4 sm:space-y-6 pb-6 sm:pb-8">

            {/* ─── Profile Header Card ─── */}
            <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#1f419a] to-[#4463cf] p-4 sm:p-6 lg:p-8 text-white shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                  <div className="relative flex-shrink-0">
                    <div className="h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24 rounded-lg sm:rounded-xl overflow-hidden ring-2 sm:ring-4 ring-white/20 shadow-lg">
                      <Image src={primaryPhoto} alt="Profile" width={96} height={96} className="h-full w-full object-cover" unoptimized />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 rounded-full bg-green-500 border-2 border-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">
                      {profile?.first_name || account?.display_name || "User"}
                    </h1>
                    <p className="text-white/90 mt-1 text-xs sm:text-sm lg:text-base truncate">
                      {age !== null && `Age ${age}`}
                      {profile?.location && ` • ${profile.location}`}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="inline-flex items-center rounded-full bg-white/20 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium">
                        {formatGender(profile?.gender || null)}
                      </span>
                      {profile?.relationship_status && (
                        <span className="inline-flex items-center rounded-full bg-white/20 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium">
                          {formatValue(profile.relationship_status)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Link
                  href="/dashboard/profile/edit"
                  className="inline-flex items-center gap-2 rounded-lg sm:rounded-xl bg-white text-[#1f419a] px-3 sm:px-4 lg:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl w-full sm:w-auto justify-center"
                >
                  <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Edit Profile
                </Link>
              </div>
            </div>

            {/* ─── Three Column Layout ─── */}
            <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">

              {/* ─── Left Column: Quick Info + Security ─── */}
              <div className="lg:col-span-1 space-y-4">

                {/* Quick Info Card */}
                <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 shadow-sm ring-1 ring-gray-200">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 sm:mb-4">Quick Info</h3>
                  <div className="space-y-2.5 sm:space-y-3">
                    <div className="flex items-center justify-between py-1.5 sm:py-2 border-b border-gray-100">
                      <span className="text-[10px] sm:text-xs lg:text-sm text-gray-600">Customer ID</span>
                      <span className="text-[10px] sm:text-xs lg:text-sm font-semibold text-gray-900 break-all text-right ml-2">{customerNumber}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 sm:py-2 border-b border-gray-100">
                      <span className="text-[10px] sm:text-xs lg:text-sm text-gray-600">Email</span>
                      <div className="flex items-center gap-1.5 ml-2">
                        <span className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-900 truncate max-w-[100px] sm:max-w-[120px] lg:max-w-[150px]">
                          {account?.email || "Not set"}
                        </span>
                        {account?.email_verified ? (
                          <span className="flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] font-medium text-green-700 border border-green-200" title="Email verified">
                            <BadgeCheck className="h-3 w-3" />
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 border border-amber-200" title="Email not verified">
                            <XCircle className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-1.5 sm:py-2 border-b border-gray-100">
                      <span className="text-[10px] sm:text-xs lg:text-sm text-gray-600">Member Since</span>
                      <span className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-900">
                        {account?.created_at
                          ? new Date(account.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 sm:py-2 border-b border-gray-100">
                      <span className="text-[10px] sm:text-xs lg:text-sm text-gray-600">Account Status</span>
                      <span className={`text-[10px] sm:text-xs lg:text-sm font-semibold capitalize px-2 py-0.5 rounded-full ${
                        account?.status === "active"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : account?.status === "deactivated"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}>
                        {account?.status || "Active"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 sm:py-2">
                      <span className="text-[10px] sm:text-xs lg:text-sm text-gray-600">Subscription</span>
                      <span className={`text-[10px] sm:text-xs lg:text-sm font-semibold capitalize px-2 py-0.5 rounded-full ${
                        account?.tier === "vip" ? "bg-purple-100 text-purple-700" :
                        account?.tier === "premium" ? "bg-yellow-100 text-yellow-700" :
                        account?.tier === "standard" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {account?.tier || "Basic"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ─── Security & Privacy Card ─── */}
                <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 shadow-sm ring-1 ring-gray-200">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 sm:mb-4 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" />
                    Security & Privacy
                  </h3>
                  <div className="space-y-2.5">
                    {/* Change Password */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordSection(!showPasswordSection);
                        setPwMessage(null);
                      }}
                      className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 p-3 text-left hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <Lock className="h-4 w-4 text-gray-500" />
                        <span className="text-xs sm:text-sm font-medium text-gray-900">Change Password</span>
                      </div>
                      <ChevronIcon open={showPasswordSection} />
                    </button>

                    {showPasswordSection && (
                      <div className="rounded-lg border border-[#1f419a]/10 bg-[#1f419a]/[0.02] p-3 sm:p-4 space-y-3">
                        {/* New Password */}
                        <div>
                          <label className="text-[10px] sm:text-xs font-medium text-gray-600 mb-1 block">New Password</label>
                          <div className="relative">
                            <input
                              type={showNewPw ? "text" : "password"}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Enter new password"
                              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-10 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20 focus:border-[#1f419a]/40"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPw(!showNewPw)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>

                        {/* Password strength indicators */}
                        {newPassword.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((i) => (
                                <div
                                  key={i}
                                  className={`h-1 flex-1 rounded-full transition-colors ${
                                    i <= pwStrength.score
                                      ? pwStrength.score <= 2
                                        ? "bg-red-400"
                                        : pwStrength.score <= 3
                                        ? "bg-amber-400"
                                        : pwStrength.score <= 4
                                        ? "bg-blue-400"
                                        : "bg-green-500"
                                      : "bg-gray-200"
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="space-y-0.5">
                              {pwStrength.rules.map((r) => (
                                <div key={r.label} className="flex items-center gap-1.5">
                                  {r.met ? (
                                    <CheckCircle className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <XCircle className="h-3 w-3 text-gray-300" />
                                  )}
                                  <span className={`text-[10px] ${r.met ? "text-green-700" : "text-gray-400"}`}>{r.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Confirm Password */}
                        <div>
                          <label className="text-[10px] sm:text-xs font-medium text-gray-600 mb-1 block">Confirm Password</label>
                          <div className="relative">
                            <input
                              type={showConfirmPw ? "text" : "password"}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="Confirm new password"
                              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-10 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#1f419a]/20 focus:border-[#1f419a]/40"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPw(!showConfirmPw)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showConfirmPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                            <p className="text-[10px] text-red-500 mt-1">Passwords do not match</p>
                          )}
                        </div>

                        {/* Message */}
                        {pwMessage && (
                          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                            pwMessage.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                          }`}>
                            {pwMessage.type === "success" ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                            {pwMessage.text}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleChangePassword}
                          disabled={pwLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword || pwStrength.score < 4}
                          className="w-full rounded-lg bg-[#1f419a] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#17357b] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                        >
                          {pwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                          {pwLoading ? "Updating..." : "Update Password"}
                        </button>
                      </div>
                    )}

                    {/* Links to other settings */}
                    <Link
                      href="/dashboard/profile/preferences"
                      className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 p-3 text-left hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <User className="h-4 w-4 text-gray-500" />
                        <span className="text-xs sm:text-sm font-medium text-gray-900">Match Preferences</span>
                      </div>
                      <ChevronIcon open={false} />
                    </Link>

                    <Link
                      href="/dashboard/profile/subscription"
                      className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 p-3 text-left hover:border-[#1f419a]/30 hover:bg-gray-50 transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <Sparkles className="h-4 w-4 text-gray-500" />
                        <span className="text-xs sm:text-sm font-medium text-gray-900">Manage Subscription</span>
                      </div>
                      <ChevronIcon open={false} />
                    </Link>
                  </div>
                </div>

                {/* ─── Danger Zone ─── */}
                <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 shadow-sm ring-1 ring-red-200/50">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-red-600 uppercase tracking-wide mb-3 sm:mb-4 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Danger Zone
                  </h3>

                  {actionMessage && (
                    <div className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                      actionMessage.type === "success"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      {actionMessage.type === "success" ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      {actionMessage.text}
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => setShowDeactivateModal(true)}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-left hover:bg-amber-50 transition-all"
                    >
                      <Power className="h-4 w-4 text-amber-600" />
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-amber-800">Deactivate Account</div>
                        <div className="text-[9px] sm:text-[10px] text-amber-600">Temporarily hide your profile. You can reactivate anytime.</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(true)}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-red-200 bg-red-50/50 p-3 text-left hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-red-800">Delete Account</div>
                        <div className="text-[9px] sm:text-[10px] text-red-600">Permanently delete your account and all data. This cannot be undone.</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* ─── Right Column: Profile Sections ─── */}
              <div className="lg:col-span-2 space-y-3 sm:space-y-4 lg:space-y-6">

                {/* Basic Information */}
                <ProfileSection title="Basic Information">
                  <InfoField label="First Name" value={profile?.first_name || "Not set"} />
                  <InfoField label="Last Name" value={profile?.last_name || "Not set"} />
                  <InfoField label="Date of Birth" value={formatDate(profile?.date_of_birth || null)} />
                  <InfoField label="Age" value={age !== null ? `${age} years old` : "Not set"} />
                  <InfoField label="Location" value={profile?.location || "Not set"} />
                  <InfoField label="Height" value={formatHeight(profile?.height_cm || null)} />
                </ProfileSection>

                {/* Background & Education */}
                <ProfileSection title="Background & Education">
                  <InfoField label="Ethnicity" value={formatValue(profile?.ethnicity || null)} />
                  <InfoField label="Religion" value={formatValue(profile?.religion || null)} />
                  <InfoField label="Education Level" value={formatValue(profile?.education_level || null)} />
                  <InfoField label="Languages" value={formatValue(profile?.languages || null)} />
                </ProfileSection>

                {/* Relationship & Family */}
                <ProfileSection title="Relationship & Family">
                  <InfoField label="Relationship Status" value={formatValue(profile?.relationship_status || null)} />
                  <InfoField label="Have Children" value={formatValue(profile?.have_children || null)} />
                  <InfoField label="Want Children" value={formatValue(profile?.want_children || null)} />
                  <InfoField label="Relationship Type" value={formatValue(profile?.relationship_type || null)} />
                </ProfileSection>

                {/* Lifestyle */}
                <ProfileSection title="Lifestyle">
                  <InfoField label="Smoking Habits" value={formatValue(profile?.smoking_habits || null)} />
                  <InfoField label="Ready for Marriage" value={formatValue(profile?.ready_for_marriage || null)} />
                  <InfoField label="Willing to Relocate" value={formatValue(profile?.willing_to_relocate || null)} />
                </ProfileSection>

                {/* Personal Development */}
                <ProfileSection title="Personal Development">
                  <InfoField label="Career Stability" value={formatValue(profile?.career_stability || null)} />
                  <InfoField label="Long-Term Goals" value={formatValue(profile?.long_term_goals || null)} />
                  <InfoField label="Emotional Connection" value={formatValue(profile?.emotional_connection || null)} />
                  <InfoField label="Love Languages" value={formatValue(profile?.love_languages || null)} />
                </ProfileSection>

                {/* About & Personality */}
                <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-200">
                  <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-5">
                    <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">About & Personality</h3>
                    <Link href="/dashboard/profile/edit" className="text-[10px] sm:text-xs lg:text-sm text-[#1f419a] hover:text-[#17357b] font-medium">
                      Edit
                    </Link>
                  </div>
                  <div className="space-y-2.5 sm:space-y-3 lg:space-y-4">
                    <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 sm:p-4 lg:p-5">
                      <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-gray-500 uppercase tracking-wide">About Yourself</span>
                      <p className="mt-2 text-xs sm:text-sm lg:text-base text-gray-700 leading-relaxed break-words">
                        {profile?.about_yourself || profile?.personality_type || "Not set"}
                      </p>
                    </div>
                    <InfoField label="Personality Type" value={formatValue(profile?.personality_type || null)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-row gap-2 sm:gap-3 pt-3 sm:pt-4 pb-4">
              <Link
                href="/dashboard/profile/edit"
                className="flex-1 rounded-lg sm:rounded-xl bg-gray-900 text-[10px] sm:text-xs lg:text-sm font-semibold text-white shadow-lg hover:bg-gray-800 transition-all h-10 sm:h-11 lg:h-12 flex items-center justify-center gap-1 sm:gap-1.5 lg:gap-2 min-w-0"
              >
                <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 flex-shrink-0" />
                <span className="hidden sm:inline truncate">Edit Profile</span>
                <span className="sm:hidden truncate">Edit</span>
              </Link>
              <Link
                href="/dashboard/profile"
                className="flex-1 rounded-lg sm:rounded-xl bg-[#1f419a] text-[10px] sm:text-xs lg:text-sm font-semibold text-white shadow-lg hover:bg-[#17357b] transition-all h-10 sm:h-11 lg:h-12 flex items-center justify-center gap-1 sm:gap-1.5 lg:gap-2 min-w-0"
              >
                <User className="h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 flex-shrink-0" />
                <span className="hidden sm:inline truncate">View Profile</span>
                <span className="sm:hidden truncate">View</span>
              </Link>
            </div>
        </section>
      </div>

      {/* ─── Deactivate Confirmation Modal ─── */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <Power className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Deactivate Account</h3>
                <p className="text-xs text-gray-500">This action is reversible</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Your profile will be hidden from other users and you will be signed out. You can reactivate your account
              at any time by logging back in. Your data will be preserved.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeactivateModal(false)}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={actionLoading}
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                {actionLoading ? "Deactivating..." : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Delete Account Permanently</h3>
                <p className="text-xs text-red-500 font-medium">This action cannot be undone</p>
              </div>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
              <p className="text-xs text-red-800 leading-relaxed">
                <strong>Warning:</strong> This will permanently delete your profile, messages, matches, meeting history,
                wallet balance, credits, and all associated data. You will not be able to recover any of this information.
              </p>
            </div>
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE here"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText("");
                }}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={actionLoading || deleteConfirmText !== "DELETE"}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {actionLoading ? "Deleting..." : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────── */

/** Simple chevron that rotates when open */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/** Reusable profile section wrapper */
function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg sm:rounded-xl bg-white p-4 sm:p-5 lg:p-6 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-center justify-between mb-3 sm:mb-4 lg:mb-5">
        <h3 className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">{title}</h3>
        <Link href="/dashboard/profile/edit" className="text-[10px] sm:text-xs lg:text-sm text-[#1f419a] hover:text-[#17357b] font-medium">
          Edit
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:gap-3 lg:gap-4 sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

