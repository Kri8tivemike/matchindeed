"use client";

/**
 * AdminUserDetailPage — Enhanced User Detail & Management
 *
 * Tabbed interface with:
 * - Overview: Profile info, account settings, status actions, credits, wallet
 * - Activities: Sent/received winks, likes, interested with counts
 * - Reports: Reports against and by this user
 * - Meetings: All meetings with status breakdown
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Calendar,
  MapPin,
  CreditCard,
  Video,
  Shield,
  Crown,
  Ban,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Edit,
  Loader2,
  Save,
  Plus,
  Minus,
  User,
  RefreshCw,
  Eye,
  Heart,
  MessageCircle,
  Flag,
  Clock,
  Activity,
  FileWarning,
  Send,
  Inbox,
} from "lucide-react";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type UserDetail = {
  id: string;
  email: string;
  display_name: string | null;
  tier: string;
  role: string;
  account_status: string;
  email_verified: boolean;
  created_at: string;
  suspended_until: string | null;
  suspension_reason: string | null;
  profile: {
    first_name: string | null;
    last_name: string | null;
    date_of_birth: string | null;
    gender: string | null;
    location: string | null;
    profile_photo_url: string | null;
    about_yourself: string | null;
    ethnicity: string | null;
    religion: string | null;
    education_level: string | null;
    height_cm: number | null;
    relationship_status: string | null;
    languages: string[] | null;
    profile_completed: boolean | null;
  } | null;
  credits: {
    total: number;
    used: number;
    rollover?: number;
    updated_at?: string;
  } | null;
  wallet: {
    balance_cents: number;
    updated_at?: string;
  } | null;
  meetings_count: number;
};

type TabType = "overview" | "activities" | "reports" | "meetings";

// ---------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedTier, setEditedTier] = useState("");
  const [editedRole, setEditedRole] = useState("");
  const [creditAdjustment, setCreditAdjustment] = useState(0);
  const [actionReason, setActionReason] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // Tab data states
  const [tabData, setTabData] = useState<any>(null);
  const [tabLoading, setTabLoading] = useState(false);

  // ── Fetch User ────────────────────────────────────────
  const fetchUser = useCallback(async () => {
    try {
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .select(
          "id, email, display_name, tier, role, account_status, email_verified, created_at, suspended_until, suspension_reason"
        )
        .eq("id", userId)
        .single();

      if (accountError || !account) {
        router.push("/admin/users");
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      const { data: credits } = await supabase
        .from("credits")
        .select("total, used, rollover, updated_at")
        .eq("user_id", userId)
        .single();

      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance_cents, updated_at")
        .eq("user_id", userId)
        .single();

      const { count: meetingsCount } = await supabase
        .from("meeting_participants")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      setUser({
        id: account.id,
        email: account.email,
        display_name: account.display_name,
        tier: account.tier,
        role: account.role,
        account_status: account.account_status,
        email_verified: account.email_verified,
        created_at: account.created_at,
        suspended_until: account.suspended_until,
        suspension_reason: account.suspension_reason,
        profile: profile,
        credits: credits || { total: 0, used: 0, rollover: 0 },
        wallet: wallet || { balance_cents: 0 },
        meetings_count: meetingsCount || 0,
      });

      setEditedTier(account.tier);
      setEditedRole(account.role);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [userId, router]);

  useEffect(() => {
    if (userId) fetchUser();
  }, [userId, fetchUser]);

  // ── Fetch Tab Data ────────────────────────────────────
  const fetchTabData = useCallback(
    async (tab: TabType) => {
      if (tab === "overview") return;
      setTabLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(
          `/api/admin/user-profile?user_id=${userId}&tab=${tab}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (res.ok) {
          setTabData(await res.json());
        }
      } catch (err) {
        console.error("Error fetching tab data:", err);
      } finally {
        setTabLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    fetchTabData(activeTab);
  }, [activeTab, fetchTabData]);

  // ── Save Account Changes ──────────────────────────────
  const handleSaveChanges = async () => {
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from("accounts")
        .update({ tier: editedTier, role: editedRole })
        .eq("id", userId);
      if (error) throw error;

      const {
        data: { user: adminUser },
      } = await supabase.auth.getUser();
      if (adminUser) {
        await supabase.from("admin_logs").insert({
          admin_id: adminUser.id,
          target_user_id: userId,
          action: "user_update",
          meta: {
            old_tier: user.tier,
            new_tier: editedTier,
            old_role: user.role,
            new_role: editedRole,
          },
        });
      }

      setUser({ ...user, tier: editedTier, role: editedRole });
      setEditMode(false);
      setMessage({ type: "success", text: "Changes saved successfully!" });
    } catch {
      setMessage({ type: "error", text: "Failed to save changes." });
    } finally {
      setSaving(false);
    }
  };

  // ── Adjust Credits ────────────────────────────────────
  const handleCreditAdjustment = async () => {
    if (!user || creditAdjustment === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const currentTotal = user.credits?.total || 0;
      const newTotal = Math.max(0, currentTotal + creditAdjustment);

      const { error } = await supabase.from("credits").upsert(
        {
          user_id: userId,
          total: newTotal,
          used: user.credits?.used || 0,
          rollover: user.credits?.rollover || 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;

      const {
        data: { user: adminUser },
      } = await supabase.auth.getUser();
      if (adminUser) {
        await supabase.from("admin_logs").insert({
          admin_id: adminUser.id,
          target_user_id: userId,
          action: creditAdjustment > 0 ? "credits_add" : "credits_remove",
          meta: {
            adjustment: creditAdjustment,
            old_total: currentTotal,
            new_total: newTotal,
            reason: actionReason,
          },
        });
      }

      await fetchUser();
      setCreditAdjustment(0);
      setActionReason("");
      setMessage({
        type: "success",
        text: `Credits adjusted. New total: ${newTotal}`,
      });
    } catch {
      setMessage({ type: "error", text: "Failed to adjust credits." });
    } finally {
      setSaving(false);
    }
  };

  // ── Update Status ─────────────────────────────────────
  const handleStatusChange = async (newStatus: string) => {
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      const updateData: Record<string, any> = {
        account_status: newStatus,
      };
      if (newStatus === "suspended") {
        const until = new Date();
        until.setDate(until.getDate() + 7);
        updateData.suspended_until = until.toISOString();
        updateData.suspension_reason =
          actionReason || "Suspended by admin";
      } else {
        updateData.suspended_until = null;
        updateData.suspension_reason = null;
      }

      const { error } = await supabase
        .from("accounts")
        .update(updateData)
        .eq("id", userId);
      if (error) throw error;

      const {
        data: { user: adminUser },
      } = await supabase.auth.getUser();
      if (adminUser) {
        await supabase.from("admin_logs").insert({
          admin_id: adminUser.id,
          target_user_id: userId,
          action: `user_${newStatus}`,
          meta: { reason: actionReason },
        });
      }

      // Notify the user
      await supabase.from("notifications").insert({
        user_id: userId,
        type: "account_action",
        title:
          newStatus === "active"
            ? "Account Activated"
            : newStatus === "suspended"
              ? "Account Suspended"
              : "Account Banned",
        message:
          newStatus === "active"
            ? "Your account has been reactivated."
            : newStatus === "suspended"
              ? `Your account has been suspended. Reason: ${actionReason || "Policy violation"}`
              : `Your account has been banned. Reason: ${actionReason || "Repeated violations"}`,
        data: { action: newStatus, reason: actionReason },
      });

      setUser({
        ...user,
        account_status: newStatus,
        suspended_until: updateData.suspended_until,
        suspension_reason: updateData.suspension_reason,
      });
      setActionReason("");
      setMessage({
        type: "success",
        text: `User ${newStatus} successfully!`,
      });
    } catch {
      setMessage({ type: "error", text: "Failed to update status." });
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────
  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "vip":
        return "bg-purple-100 text-purple-700";
      case "premium":
        return "bg-amber-100 text-amber-700";
      case "standard":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700";
      case "suspended":
        return "bg-amber-100 text-amber-700";
      case "banned":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };
  const age = (dob: string | null) => {
    if (!dob) return null;
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  };

  // ── Loading / Not Found ───────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">User not found</p>
        <Link
          href="/admin/users"
          className="text-[#1f419a] hover:underline mt-2 inline-block"
        >
          Back to Users
        </Link>
      </div>
    );
  }

  const name =
    [user.profile?.first_name, user.profile?.last_name]
      .filter(Boolean)
      .join(" ") || user.display_name || "Unknown";
  const userAge = age(user.profile?.date_of_birth ?? null);

  // ── TABS CONFIG ───────────────────────────────────────
  const TABS: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <User className="h-4 w-4" /> },
    {
      key: "activities",
      label: "Activities",
      icon: <Activity className="h-4 w-4" />,
    },
    {
      key: "reports",
      label: "Reports",
      icon: <Flag className="h-4 w-4" />,
    },
    {
      key: "meetings",
      label: "Meetings",
      icon: <Video className="h-4 w-4" />,
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/users"
          className="p-2 rounded-lg hover:bg-gray-100 transition"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
            {user.profile?.profile_photo_url ? (
              <img
                src={user.profile.profile_photo_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="h-7 w-7 text-gray-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 truncate">
                {name}
              </h1>
              {userAge && (
                <span className="text-sm text-gray-500">({userAge})</span>
              )}
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${getStatusBadge(user.account_status)}`}
              >
                {user.account_status}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${getTierBadge(user.tier)}`}
              >
                {user.tier}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" /> {user.email}
                {user.email_verified && (
                  <CheckCircle className="h-3 w-3 text-green-500" />
                )}
              </span>
              {user.profile?.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {user.profile.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Joined{" "}
                {new Date(user.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Message Toast */}
      {message && (
        <div
          className={`flex items-center gap-3 p-3 rounded-xl text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {message.text}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
          <p className="text-lg font-bold text-gray-900">
            {(user.credits?.total || 0) - (user.credits?.used || 0)}
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Credits Avail.</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
          <p className="text-lg font-bold text-gray-900">
            ₦
            {(
              (user.wallet?.balance_cents || 0) / 100
            ).toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Wallet</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
          <p className="text-lg font-bold text-gray-900">
            {user.meetings_count}
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Meetings</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
          <p className="text-lg font-bold text-gray-900">
            {user.profile?.profile_completed ? "Yes" : "No"}
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Profile Done</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
          <p
            className={`text-lg font-bold ${user.role !== "user" ? "text-purple-700" : "text-gray-900"}`}
          >
            {user.role}
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Role</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ──────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Info */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Profile Details
              </h3>
              {user.profile?.about_yourself && (
                <p className="text-sm text-gray-600 mb-4">
                  {user.profile.about_yourself}
                </p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {[
                  { label: "Gender", value: user.profile?.gender },
                  { label: "Ethnicity", value: user.profile?.ethnicity },
                  { label: "Religion", value: user.profile?.religion },
                  { label: "Education", value: user.profile?.education_level },
                  {
                    label: "Height",
                    value: user.profile?.height_cm
                      ? `${user.profile.height_cm} cm`
                      : null,
                  },
                  {
                    label: "Status",
                    value: user.profile?.relationship_status,
                  },
                  {
                    label: "Languages",
                    value: user.profile?.languages?.join(", "),
                  },
                ].map(
                  (item) =>
                    item.value && (
                      <div key={item.label} className="bg-gray-50 rounded-lg p-2.5">
                        <p className="text-[10px] text-gray-400 uppercase">
                          {item.label}
                        </p>
                        <p className="text-gray-700 font-medium mt-0.5">
                          {item.value}
                        </p>
                      </div>
                    )
                )}
              </div>
            </div>

            {/* Account Settings */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Account Settings
                </h3>
                {!editMode ? (
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[#1f419a] hover:bg-[#1f419a]/10"
                  >
                    <Edit className="h-3 w-3" /> Edit
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveChanges}
                      disabled={saving}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-[#1f419a] text-white hover:bg-[#17357b] disabled:opacity-50"
                    >
                      <Save className="h-3 w-3" /> Save
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Tier
                  </label>
                  {editMode ? (
                    <select
                      value={editedTier}
                      onChange={(e) => setEditedTier(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#1f419a] outline-none"
                    >
                      <option value="basic">Basic</option>
                      <option value="standard">Standard</option>
                      <option value="premium">Premium</option>
                      <option value="vip">VIP</option>
                    </select>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium ${getTierBadge(user.tier)}`}
                    >
                      <Crown className="h-3.5 w-3.5" />
                      {user.tier.charAt(0).toUpperCase() + user.tier.slice(1)}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Role
                  </label>
                  {editMode ? (
                    <select
                      value={editedRole}
                      onChange={(e) => setEditedRole(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#1f419a] outline-none"
                    >
                      <option value="user">User</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                      <option value="superadmin">Super Admin</option>
                    </select>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium ${user.role !== "user" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-700"}`}
                    >
                      <Shield className="h-3.5 w-3.5" />
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Status Actions */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Account Status
              </h3>
              <input
                type="text"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Reason for action (optional)..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#1f419a] outline-none mb-3"
              />
              <div className="flex flex-wrap gap-2">
                {user.account_status !== "active" && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange("active")}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500 text-white text-sm hover:bg-green-600 disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4" /> Activate
                  </button>
                )}
                {user.account_status === "active" && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStatusChange("suspended")}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600 disabled:opacity-50"
                    >
                      <AlertTriangle className="h-4 w-4" /> Suspend (7d)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange("banned")}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 disabled:opacity-50"
                    >
                      <Ban className="h-4 w-4" /> Ban
                    </button>
                  </>
                )}
              </div>
              {user.suspension_reason && (
                <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
                  <strong>Reason:</strong> {user.suspension_reason}
                  {user.suspended_until && (
                    <span className="block text-xs mt-1">
                      Until:{" "}
                      {new Date(user.suspended_until).toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Credits */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Credits
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total</span>
                  <span className="font-bold">{user.credits?.total || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Used</span>
                  <span>{user.credits?.used || 0}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-gray-500">Available</span>
                  <span className="font-bold text-green-600">
                    {(user.credits?.total || 0) - (user.credits?.used || 0)}
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t">
                <label className="block text-xs text-gray-500 mb-1.5">
                  Adjust
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCreditAdjustment(creditAdjustment - 1)}
                    className="p-1.5 rounded border border-gray-200 hover:bg-gray-50"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <input
                    type="number"
                    value={creditAdjustment}
                    onChange={(e) =>
                      setCreditAdjustment(parseInt(e.target.value) || 0)
                    }
                    className="flex-1 text-center px-2 py-1.5 rounded border border-gray-200 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCreditAdjustment(creditAdjustment + 1)}
                    className="p-1.5 rounded border border-gray-200 hover:bg-gray-50"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleCreditAdjustment}
                  disabled={creditAdjustment === 0 || saving}
                  className="w-full mt-2 py-2 rounded-lg bg-[#1f419a] text-white text-sm font-medium hover:bg-[#17357b] disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Wallet */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Wallet
              </h3>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-gray-400" />
                <span
                  className={`text-xl font-bold ${(user.wallet?.balance_cents || 0) < 0 ? "text-red-600" : "text-gray-900"}`}
                >
                  ₦
                  {(
                    (user.wallet?.balance_cents || 0) / 100
                  ).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Activities Tab ────────────────────────────── */}
      {activeTab === "activities" && (
        <div>
          {tabLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#1f419a]" />
            </div>
          ) : tabData ? (
            <div className="space-y-6">
              {/* Activity Counts */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                  <p className="text-xl font-bold text-gray-900">
                    {tabData.counts?.total_sent || 0}
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase">
                    Total Sent
                  </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                  <p className="text-xl font-bold text-gray-900">
                    {tabData.counts?.total_received || 0}
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase">
                    Received
                  </p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100 text-center">
                  <p className="text-xl font-bold text-purple-700">
                    {tabData.counts?.winks_sent || 0}
                  </p>
                  <p className="text-[10px] text-purple-600 uppercase">
                    Winks
                  </p>
                </div>
                <div className="bg-red-50 rounded-xl p-4 border border-red-100 text-center">
                  <p className="text-xl font-bold text-red-700">
                    {tabData.counts?.likes_sent || 0}
                  </p>
                  <p className="text-[10px] text-red-600 uppercase">Likes</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 text-center">
                  <p className="text-xl font-bold text-blue-700">
                    {tabData.counts?.interested_sent || 0}
                  </p>
                  <p className="text-[10px] text-blue-600 uppercase">
                    Interested
                  </p>
                </div>
              </div>

              {/* Sent Activities */}
              <div className="bg-white rounded-xl shadow-sm border">
                <div className="px-5 py-3 border-b flex items-center gap-2">
                  <Send className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    Sent ({tabData.sent?.length || 0})
                  </h3>
                </div>
                <div className="divide-y max-h-[300px] overflow-y-auto">
                  {(tabData.sent || []).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      No sent activities
                    </p>
                  ) : (
                    (tabData.sent || []).map((a: any) => (
                      <div
                        key={a.id}
                        className="px-5 py-2.5 flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {a.activity_type === "wink" && (
                            <Eye className="h-4 w-4 text-purple-500" />
                          )}
                          {a.activity_type === "like" && (
                            <Heart className="h-4 w-4 text-red-500" />
                          )}
                          {a.activity_type === "interested" && (
                            <MessageCircle className="h-4 w-4 text-blue-500" />
                          )}
                          <span className="capitalize font-medium text-gray-700">
                            {a.activity_type}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="text-gray-600">
                            {a.target_user?.display_name ||
                              a.target_user?.email ||
                              "Unknown"}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {timeAgo(a.created_at)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Received Activities */}
              <div className="bg-white rounded-xl shadow-sm border">
                <div className="px-5 py-3 border-b flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    Received ({tabData.received?.length || 0})
                  </h3>
                </div>
                <div className="divide-y max-h-[300px] overflow-y-auto">
                  {(tabData.received || []).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      No received activities
                    </p>
                  ) : (
                    (tabData.received || []).map((a: any) => (
                      <div
                        key={a.id}
                        className="px-5 py-2.5 flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {a.activity_type === "wink" && (
                            <Eye className="h-4 w-4 text-purple-500" />
                          )}
                          {a.activity_type === "like" && (
                            <Heart className="h-4 w-4 text-red-500" />
                          )}
                          {a.activity_type === "interested" && (
                            <MessageCircle className="h-4 w-4 text-blue-500" />
                          )}
                          <span className="text-gray-600">
                            {a.user?.display_name ||
                              a.user?.email ||
                              "Unknown"}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="capitalize font-medium text-gray-700">
                            {a.activity_type}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {timeAgo(a.created_at)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ─── Reports Tab ──────────────────────────────── */}
      {activeTab === "reports" && (
        <div>
          {tabLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#1f419a]" />
            </div>
          ) : tabData ? (
            <div className="space-y-6">
              {/* Counts */}
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`rounded-xl p-4 shadow-sm border text-center ${(tabData.counts?.total_against || 0) > 0 ? "bg-red-50 border-red-200" : "bg-white"}`}
                >
                  <p
                    className={`text-xl font-bold ${(tabData.counts?.total_against || 0) > 0 ? "text-red-700" : "text-gray-900"}`}
                  >
                    {tabData.counts?.total_against || 0}
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase">
                    Reports Against
                  </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
                  <p className="text-xl font-bold text-gray-900">
                    {tabData.counts?.total_by_user || 0}
                  </p>
                  <p className="text-[10px] text-gray-500 uppercase">
                    Reports Made
                  </p>
                </div>
              </div>

              {/* Reports Against */}
              <div className="bg-white rounded-xl shadow-sm border">
                <div className="px-5 py-3 border-b flex items-center gap-2">
                  <FileWarning className="h-4 w-4 text-red-400" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    Reports Against This User (
                    {tabData.against?.length || 0})
                  </h3>
                </div>
                <div className="divide-y max-h-[350px] overflow-y-auto">
                  {(tabData.against || []).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      No reports against this user
                    </p>
                  ) : (
                    (tabData.against || []).map((r: any) => (
                      <div key={r.id} className="px-5 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              r.priority === "urgent"
                                ? "bg-red-100 text-red-700"
                                : r.priority === "high"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {r.priority}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              r.status === "resolved"
                                ? "bg-green-100 text-green-700"
                                : r.status === "dismissed"
                                  ? "bg-gray-100 text-gray-500"
                                  : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {r.status}
                          </span>
                          <span className="text-xs text-gray-600 capitalize">
                            {r.reason.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-auto">
                            {timeAgo(r.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          By:{" "}
                          {r.reporter?.display_name ||
                            r.reporter?.email ||
                            "Unknown"}
                        </p>
                        {r.description && (
                          <p className="text-xs text-gray-500 mt-1 italic">
                            &quot;{r.description}&quot;
                          </p>
                        )}
                        {r.resolution && (
                          <p className="text-xs text-green-600 mt-1">
                            Resolution: {r.resolution}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Reports By User */}
              <div className="bg-white rounded-xl shadow-sm border">
                <div className="px-5 py-3 border-b flex items-center gap-2">
                  <Flag className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    Reports Made By This User (
                    {tabData.by_user?.length || 0})
                  </h3>
                </div>
                <div className="divide-y max-h-[250px] overflow-y-auto">
                  {(tabData.by_user || []).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      No reports made
                    </p>
                  ) : (
                    (tabData.by_user || []).map((r: any) => (
                      <div key={r.id} className="px-5 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              r.status === "resolved"
                                ? "bg-green-100 text-green-700"
                                : r.status === "dismissed"
                                  ? "bg-gray-100 text-gray-500"
                                  : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {r.status}
                          </span>
                          <span className="text-xs text-gray-600 capitalize">
                            {r.reason.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-auto">
                            {timeAgo(r.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          Against:{" "}
                          {r.reported_user?.display_name ||
                            r.reported_user?.email ||
                            "Unknown"}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ─── Meetings Tab ─────────────────────────────── */}
      {activeTab === "meetings" && (
        <div>
          {tabLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#1f419a]" />
            </div>
          ) : tabData ? (
            <div className="space-y-6">
              {/* Meeting Status Counts */}
              <div className="flex flex-wrap gap-3">
                {Object.entries(
                  (tabData.counts?.by_status as Record<string, number>) || {}
                ).map(([status, count]) => (
                  <div
                    key={status}
                    className={`rounded-xl px-4 py-2 border text-sm font-medium ${
                      status === "completed"
                        ? "bg-green-50 border-green-200 text-green-700"
                        : status === "confirmed"
                          ? "bg-blue-50 border-blue-200 text-blue-700"
                          : status === "cancelled"
                            ? "bg-red-50 border-red-200 text-red-700"
                            : "bg-gray-50 border-gray-200 text-gray-700"
                    }`}
                  >
                    {status}: {count}
                  </div>
                ))}
                <div className="rounded-xl px-4 py-2 bg-white border text-sm font-bold text-gray-900">
                  Total: {tabData.counts?.total || 0}
                </div>
              </div>

              {/* Meetings List */}
              <div className="bg-white rounded-xl shadow-sm border">
                <div className="px-5 py-3 border-b flex items-center gap-2">
                  <Video className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    Meeting History
                  </h3>
                </div>
                <div className="divide-y max-h-[400px] overflow-y-auto">
                  {(tabData.meetings || []).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      No meetings found
                    </p>
                  ) : (
                    (tabData.meetings || []).map((m: any) => (
                      <div
                        key={m.id}
                        className="px-5 py-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {m.title || "Meeting"}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                m.status === "completed"
                                  ? "bg-green-100 text-green-700"
                                  : m.status === "confirmed"
                                    ? "bg-blue-100 text-blue-700"
                                    : m.status === "cancelled"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {m.status}
                            </span>
                            {m.scheduled_date && (
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(
                                  m.scheduled_date
                                ).toLocaleDateString()}
                                {m.scheduled_time &&
                                  ` at ${m.scheduled_time}`}
                              </span>
                            )}
                            {m.duration_minutes && (
                              <span className="text-xs text-gray-400">
                                {m.duration_minutes}min
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400">
                          {timeAgo(m.created_at)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
