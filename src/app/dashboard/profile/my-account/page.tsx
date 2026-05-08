"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Home,
  Compass,
  CalendarCheck,
  Wallet,
  Bell,
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
import { formatRelationshipStatusLabel } from "@/lib/relationship-status";
import {
  getPersonalityDisplayText,
  parseStoredPersonalityPrompts,
} from "@/lib/profile/personality-prompts";
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
  active_tier: string | null;
  created_at: string | null;
  account_status: string | null;
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

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const normalizeAuthProvider = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const extractUserAuthProviders = (user: {
  app_metadata?: Record<string, unknown> | null;
  identities?: Array<{ provider?: string | null }> | null;
  email?: string | null;
}) => {
  const providers = new Set<string>();
  const appMetadata = user.app_metadata || {};
  const fromMeta = appMetadata.providers;

  if (Array.isArray(fromMeta)) {
    for (const provider of fromMeta) {
      const normalized = normalizeAuthProvider(provider);
      if (normalized) providers.add(normalized);
    }
  }

  const primaryProvider = normalizeAuthProvider(appMetadata.provider);
  if (primaryProvider) providers.add(primaryProvider);

  if (Array.isArray(user.identities)) {
    for (const identity of user.identities) {
      const normalized = normalizeAuthProvider(identity?.provider);
      if (normalized) providers.add(normalized);
    }
  }

  if (providers.size === 0 && user.email) {
    providers.add("email");
  }

  return Array.from(providers);
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
  const [authProviders, setAuthProviders] = useState<string[]>([]);

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
  const [showDeleteSuccessModal, setShowDeleteSuccessModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const personalityPromptEntries = parseStoredPersonalityPrompts(
    profile?.personality_type
  );
  const legacyPersonalityText =
    personalityPromptEntries.length === 0
      ? getPersonalityDisplayText(profile?.personality_type)
      : null;

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
        setAuthProviders(extractUserAuthProviders(user));

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
          .select("id, email, display_name, tier, created_at, account_status, email_verified")
          .eq("id", user.id)
          .maybeSingle();

        const { data: membershipData } = await supabase
          .from("memberships")
          .select("tier, status, expires_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const activeTier =
          membershipData &&
          membershipData.status === "active" &&
          (!membershipData.expires_at || new Date(membershipData.expires_at) > new Date())
            ? membershipData.tier || null
            : null;

        if (accountError || !accountData) {
          setAccount({
            id: user.id,
            email: user.email || null,
            display_name: user.email?.split("@")[0] || null,
            tier: null,
            active_tier: activeTier,
            created_at: null,
            account_status: "active",
            email_verified: !!user.email_confirmed_at,
          });
        } else {
          setAccount({
            id: accountData.id,
            email: accountData.email,
            display_name: accountData.display_name,
            tier: accountData.tier || null,
            active_tier: activeTier,
            created_at: accountData.created_at || null,
            account_status: accountData.account_status || "active",
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
        setPwMessage({ type: "success", text: "Your password has been successfully changed." });
        setNewPassword("");
        setConfirmPassword("");
        setShowPasswordSection(false);
      }
    } catch {
      setPwMessage({ type: "error", text: "An unexpected error occurred." });
    } finally {
      setPwLoading(false);
    }
  };

  /* ── Account deactivation ─────────────────────────────────────── */

  const handleDeactivate = async () => {
    const nextAction = account?.account_status === "deactivated" ? "reactivate" : "deactivate";
    try {
      setActionLoading(true);
      setActionMessage(null);

      const res = await fetch("/api/profile/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: nextAction }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${nextAction}`);

      const updatedAccountStatus = data?.account?.account_status;
      if (typeof updatedAccountStatus === "string") {
        setAccount((prev) =>
          prev
            ? {
                ...prev,
                account_status: updatedAccountStatus,
              }
            : prev
        );
      }

      setActionMessage({
        type: "success",
        text:
          nextAction === "deactivate"
            ? "Account deactivated successfully."
            : "Account reactivated successfully.",
      });
      setShowDeactivateModal(false);
    } catch (error: unknown) {
      setActionMessage({
        type: "error",
        text: getErrorMessage(error, "Failed to update account status"),
      });
    } finally {
      setActionLoading(false);
    }
  };

  /* ── Account deletion ─────────────────────────────────────────── */

  const handleDelete = async () => {
    if (deleteConfirmText !== "DELETE") return;
    if (deleteReason.trim().length < 50) {
      setActionMessage({
        type: "error",
        text: "Please provide at least 50 characters describing why you want to delete your account.",
      });
      return;
    }
    if (requiresDeletePassword && !deletePassword.trim()) {
      setActionMessage({
        type: "error",
        text: "Please enter your password to confirm deletion request.",
      });
      return;
    }

    try {
      setActionLoading(true);
      setActionMessage(null);

      const res = await fetch("/api/profile/account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          confirm: true,
          reason: deleteReason.trim(),
          ...(requiresDeletePassword ? { password: deletePassword } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit deletion request");

      if (typeof data?.account?.account_status === "string") {
        setAccount((prev) =>
          prev
            ? {
                ...prev,
                account_status: data.account.account_status,
              }
            : prev
        );
      }

      const successText = data?.confirmation_email_sent
        ? "Your deletion request has been submitted successfully. We’ve sent a confirmation email, and your profile is now hidden while support reviews it."
        : "Your deletion request has been submitted successfully. Your profile is now hidden while support reviews it.";

      setActionMessage({
        type: "success",
        text: successText,
      });
      setDeleteSuccessMessage(successText);
      setShowDeleteModal(false);
      setShowDeleteSuccessModal(true);
      setDeleteConfirmText("");
      setDeleteReason("");
      setDeletePassword("");
    } catch (error: unknown) {
      setActionMessage({
        type: "error",
        text: getErrorMessage(error, "Failed to submit deletion request"),
      });
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
  const requiresDeletePassword = authProviders.includes("email");

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard/profile");
  };

  const handleDeleteCompletion = async () => {
    setShowDeleteSuccessModal(false);
    await supabase.auth.signOut();
    router.push("/login");
  };

  const quickNavItems = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/dashboard/discover", label: "Discover", icon: Compass },
    { href: "/dashboard/meetings", label: "Meetings", icon: CalendarCheck },
    { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
    { href: "/dashboard/notifications", label: "Alerts", icon: Bell },
    { href: "/dashboard/profile", label: "Profile", icon: User },
  ] as const;

  /* ── InfoField helper component ────────────────────────────────── */

  const InfoField = ({ label, value }: { label: string; value: string }) => (
    <div className="group relative rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4 transition-colors hover:border-[#1f419a]/30 hover:bg-white">
      <div>
        <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1.5 text-sm sm:text-base font-semibold leading-snug text-slate-900 break-words">{value}</div>
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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Link href="/" className="flex items-center gap-2">
              <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={110} height={28} style={{ width: "auto", height: "auto" }} />
            </Link>
          </div>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8 lg:py-7 xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="hidden lg:block lg:w-[260px] xl:w-[280px]">
          <Sidebar active="my-account" />
        </aside>

        {/* Main Content */}
        <section className="min-w-0 pb-8">

            {/* ─── Quick Navigation ─── */}
            <div className="mb-5 rounded-2xl border border-slate-200/80 bg-white/90 p-2.5 shadow-sm backdrop-blur md:hidden sm:mb-6">
              <div className="flex gap-2 overflow-x-auto pb-1.5">
                {quickNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-[#1f419a]/20 hover:bg-[#eef2ff] hover:text-[#1f419a]"
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ─── Profile Header Card ─── */}
            <div className="relative mb-5 overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-[#1f419a] via-[#2d4db0] to-[#4463cf] p-5 text-white shadow-xl sm:mb-6 sm:p-6 lg:sticky lg:top-[5.25rem] lg:z-20 lg:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex w-full items-start gap-4 sm:gap-5 lg:w-auto lg:flex-1">
                  <div className="relative flex-shrink-0">
                    <div className="h-20 w-20 overflow-hidden rounded-2xl ring-4 ring-white/20 shadow-lg sm:h-24 sm:w-24">
                      <Image src={primaryPhoto} alt="Profile" width={96} height={96} className="h-full w-full object-cover" unoptimized />
                    </div>
                    <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white bg-green-500 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                      {profile?.first_name || account?.display_name || "User"}
                    </h1>
                    <p className="mt-1.5 truncate text-sm text-white/90 sm:text-base">
                      {age !== null && `Age ${age}`}
                      {profile?.location && ` • ${profile.location}`}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium">
                        {formatGender(profile?.gender || null)}
                      </span>
                      {profile?.relationship_status && (
                        <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium">
                          {formatRelationshipStatusLabel(profile.relationship_status)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2.5 sm:w-auto sm:min-w-[300px]">
                  <Link
                    href="/dashboard/profile"
                    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-white/40 bg-white/10 px-3.5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-white/20 sm:min-h-[44px] sm:text-sm"
                  >
                    <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    View Profile
                  </Link>
                  <Link
                    href="/dashboard/profile/edit"
                    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-xs font-semibold text-[#1f419a] shadow-lg transition-all hover:bg-gray-50 hover:shadow-xl sm:min-h-[44px] sm:text-sm"
                  >
                    <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    Edit Profile
                  </Link>
                </div>
              </div>
            </div>

            {/* ─── Content Layout ─── */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">

              {/* ─── Left Column: Quick Info + Security ─── */}
              <div className="order-2 space-y-5 xl:order-1 xl:sticky xl:top-24 xl:self-start">

                {/* Quick Info Card */}
                <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-sm ring-1 ring-slate-200">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:mb-4">Quick Info</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 py-2">
                      <span className="text-sm text-slate-600">Customer ID</span>
                      <span className="ml-2 break-all text-right text-sm font-semibold text-slate-900">{customerNumber}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 py-2">
                      <span className="text-sm text-slate-600">Email</span>
                      <div className="flex items-center gap-1.5 ml-2">
                        <span className="max-w-[180px] truncate text-sm font-medium text-slate-900">
                          {account?.email || "Not set"}
                        </span>
                        {account?.email_verified ? (
                          <span className="flex items-center gap-0.5 rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700" title="Email verified">
                            <BadgeCheck className="h-3 w-3" />
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700" title="Email not verified">
                            <XCircle className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 py-2">
                      <span className="text-sm text-slate-600">Member Since</span>
                      <span className="text-sm font-medium text-slate-900">
                        {account?.created_at
                          ? new Date(account.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-slate-100 py-2">
                      <span className="text-sm text-slate-600">Account Status</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                        account?.account_status === "active"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : account?.account_status === "deactivated"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}>
                        {account?.account_status || "active"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-slate-600">Subscription</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                        account?.active_tier === "vip" ? "bg-purple-100 text-purple-700" :
                        account?.active_tier === "premium" ? "bg-yellow-100 text-yellow-700" :
                        account?.active_tier === "standard" ? "bg-blue-100 text-blue-700" :
                        account?.active_tier === "basic" ? "bg-gray-100 text-gray-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {account?.active_tier || "Not subscribed"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ─── Security & Privacy Card ─── */}
                <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-sm ring-1 ring-slate-200">
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:mb-4">
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
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-all hover:border-[#1f419a]/30 hover:bg-white"
                    >
                      <div className="flex items-center gap-2.5">
                        <Lock className="h-4 w-4 text-gray-500" />
                        <span className="text-xs sm:text-sm font-medium text-gray-900">Change Password</span>
                      </div>
                      <ChevronIcon open={showPasswordSection} />
                    </button>

                    {pwMessage && (
                      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                        pwMessage.type === "success"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}>
                        {pwMessage.type === "success" ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {pwMessage.text}
                      </div>
                    )}

                    {showPasswordSection && (
                      <div className="space-y-3 rounded-xl border border-[#1f419a]/10 bg-[#1f419a]/[0.02] p-3 sm:p-4">
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
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-all hover:border-[#1f419a]/30 hover:bg-white"
                    >
                      <div className="flex items-center gap-2.5">
                        <User className="h-4 w-4 text-gray-500" />
                        <span className="text-xs sm:text-sm font-medium text-gray-900">Match Preferences</span>
                      </div>
                      <ChevronIcon open={false} />
                    </Link>

                    <Link
                      href="/dashboard/profile/subscription"
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-all hover:border-[#1f419a]/30 hover:bg-white"
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
                <div className="rounded-2xl bg-white p-4 sm:p-5 shadow-sm ring-1 ring-red-200/60">
                  <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-600 sm:mb-4">
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
                        <div className="text-xs sm:text-sm font-medium text-amber-800">
                          {account?.account_status === "deactivated" ? "Reactivate Account" : "Deactivate Account"}
                        </div>
                        <div className="text-[9px] sm:text-[10px] text-amber-600">
                          {account?.account_status === "deactivated"
                            ? "Make your profile visible again and resume matching."
                            : "Temporarily hide your profile. You can reactivate anytime."}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(true)}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-red-200 bg-red-50/50 p-3 text-left hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                      <div>
                        <div className="text-xs sm:text-sm font-medium text-red-800">Request Account Deletion</div>
                        <div className="text-[9px] sm:text-[10px] text-red-600">Submit a deletion request. Your profile is hidden while support reviews it.</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* ─── Right Column: Profile Sections ─── */}
              <div className="order-1 space-y-5 lg:max-h-[calc(100dvh-12.5rem)] lg:overflow-y-auto lg:pr-2 lg:scroll-smooth lg:overscroll-contain xl:order-2 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">

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
                  <InfoField label="Relationship Status" value={formatRelationshipStatusLabel(profile?.relationship_status || null) || "Not set"} />
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
                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5 lg:p-6">
                  <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-base font-bold text-slate-900 sm:text-lg">About & Personality</h3>
                    <Link href="/dashboard/profile/edit" className="text-xs font-semibold text-[#1f419a] hover:text-[#17357b] sm:text-sm">
                      Edit
                    </Link>
                  </div>
                  <div className="space-y-3.5 sm:space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4 lg:p-5">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">About Yourself</span>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700 break-words sm:text-base">
                        {profile?.about_yourself || legacyPersonalityText || "Not set"}
                      </p>
                    </div>
                    {personalityPromptEntries.length > 0 ? (
                      <div className="grid gap-2">
                        {personalityPromptEntries.map((prompt) => (
                          <div
                            key={prompt.id}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4"
                          >
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                              {prompt.title}
                            </span>
                            <p className="mt-2 text-sm leading-relaxed text-slate-700 break-words sm:text-base">
                              {prompt.answer}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <InfoField
                        label="Personality Type"
                        value={formatValue(legacyPersonalityText)}
                      />
                    )}
                  </div>
                </div>
              </div>
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
                <h3 className="text-lg font-bold text-gray-900">
                  {account?.account_status === "deactivated" ? "Reactivate Account" : "Deactivate Account"}
                </h3>
                <p className="text-xs text-gray-500">This action is reversible</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {account?.account_status === "deactivated"
                ? "Your profile will be visible to other users again, and your matching activity will resume."
                : "Your profile will be hidden from other users. You can reactivate your account at any time."}
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
                {actionLoading
                  ? account?.account_status === "deactivated"
                    ? "Reactivating..."
                    : "Deactivating..."
                  : account?.account_status === "deactivated"
                  ? "Reactivate"
                  : "Deactivate"}
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
                <h3 className="text-lg font-bold text-gray-900">Request Account Deletion</h3>
                <p className="text-xs text-red-500 font-medium">Your profile will be hidden immediately</p>
              </div>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
              <p className="text-xs text-red-800 leading-relaxed">
                <strong>Important:</strong> This submits a support review request. Your account will be moved to
                <span className="font-semibold"> deletion requested</span> and hidden from other users.
              </p>
            </div>
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">
                Reason for deletion request (minimum 50 characters)
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Please tell us why you want to delete your account..."
                rows={4}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
              />
              <p className={`mt-1 text-[11px] ${deleteReason.trim().length >= 50 ? "text-green-600" : "text-gray-500"}`}>
                {deleteReason.trim().length} / 50 minimum characters
              </p>
            </div>
            {requiresDeletePassword ? (
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-600 mb-1.5 block">Confirm with your password</label>
                <div className="relative">
                  <input
                    type={showDeletePassword ? "text" : "password"}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showDeletePassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs leading-relaxed text-blue-800">
                  This account uses Google sign-in. Password confirmation is not required for this deletion request.
                </p>
              </div>
            )}
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
                  setDeleteReason("");
                  setDeletePassword("");
                }}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={
                  actionLoading ||
                  deleteConfirmText !== "DELETE" ||
                  deleteReason.trim().length < 50 ||
                  (requiresDeletePassword && !deletePassword.trim())
                }
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {actionLoading ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteSuccessModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Request Submitted</h3>
                <p className="text-xs text-green-600 font-medium">Your profile is now hidden</p>
              </div>
            </div>

            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm leading-relaxed text-green-900">
                {deleteSuccessMessage ||
                  "Your deletion request has been submitted successfully. Your profile is now hidden while support reviews it."}
              </p>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-gray-500">
              You’ll be signed out now. If we need more information, MatchIndeed support will contact you by email.
            </p>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleDeleteCompletion}
                className="flex-1 rounded-lg bg-[#1f419a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#17357b] transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Continue
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
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5 lg:p-6">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="text-base font-bold text-slate-900 sm:text-lg">{title}</h3>
        <Link href="/dashboard/profile/edit" className="text-xs font-semibold text-[#1f419a] hover:text-[#17357b] sm:text-sm">
          Edit
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 lg:gap-4">
        {children}
      </div>
    </div>
  );
}
