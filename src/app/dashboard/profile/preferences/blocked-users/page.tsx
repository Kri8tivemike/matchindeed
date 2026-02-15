"use client";

/**
 * Blocked Users Management Page
 *
 * Allows users to view and manage their blocked users list.
 * Users can unblock someone to allow them to appear in feeds again.
 */

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Ban,
  Loader2,
  User,
  Trash2,
  Shield,
  Search,
  UserX,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type BlockedUser = {
  id: string;
  blocked_id: string;
  name: string;
  photo: string | null;
  reason: string | null;
  created_at: string;
};

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
export default function BlockedUsersPage() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  /**
   * Fetch the blocked users list from the API
   */
  const fetchBlockedUsers = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/profile/block", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setBlockedUsers(data.blocked_users || []);
      }
    } catch (err) {
      console.error("Error fetching blocked users:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlockedUsers();
  }, [fetchBlockedUsers]);

  /**
   * Unblock a user
   */
  const handleUnblock = async (blockedId: string, name: string) => {
    setUnblocking(blockedId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/profile/block?blocked_id=${blockedId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        setBlockedUsers((prev) => prev.filter((u) => u.blocked_id !== blockedId));
        setToast({ type: "success", text: `${name} has been unblocked.` });
      } else {
        setToast({ type: "error", text: "Failed to unblock user." });
      }
    } catch (err) {
      console.error("Error unblocking user:", err);
      setToast({ type: "error", text: "Something went wrong." });
    } finally {
      setUnblocking(null);
    }
  };

  /**
   * Format date for display
   */
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Filter by search
  const filteredUsers = search.trim()
    ? blockedUsers.filter((u) =>
        u.name.toLowerCase().includes(search.toLowerCase())
      )
    : blockedUsers;

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/matchindeed.svg" alt="Matchindeed" width={140} height={36} style={{ width: "auto", height: "auto" }} />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/profile/preferences/view"
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Preferences
            </Link>
            <NotificationBell />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 flex-shrink-0">
          <Sidebar active="preference" />
        </aside>

        {/* Content */}
        <section className="space-y-6">
          {/* Page Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <Ban className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Blocked Users</h1>
              <p className="text-sm text-gray-500">
                {blockedUsers.length} user{blockedUsers.length !== 1 ? "s" : ""} blocked
              </p>
            </div>
          </div>

          {/* Info Banner */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">How blocking works</p>
                <p className="mt-1 text-blue-600">
                  Blocked users cannot see your profile, send you messages, or appear in your feed.
                  Blocking is private — the blocked user won&apos;t be notified. You can unblock them at any time.
                </p>
              </div>
            </div>
          </div>

          {/* Search */}
          {blockedUsers.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search blocked users..."
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-[#1f419a] focus:outline-none"
              />
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
            </div>
          ) : filteredUsers.length === 0 ? (
            /* Empty State */
            <div className="rounded-2xl bg-white p-12 text-center shadow-sm ring-1 ring-black/5">
              <UserX className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900">
                {search.trim() ? "No results found" : "No blocked users"}
              </h3>
              <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
                {search.trim()
                  ? `No blocked users matching "${search}".`
                  : "You haven't blocked anyone yet. You can block users from their profile if needed."}
              </p>
            </div>
          ) : (
            /* Blocked Users List */
            <div className="space-y-3">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition-all hover:shadow-md"
                >
                  {/* Avatar */}
                  {user.photo ? (
                    <div className="h-12 w-12 rounded-full overflow-hidden ring-2 ring-gray-200 flex-shrink-0">
                      <Image
                        src={user.photo}
                        alt={user.name}
                        width={48}
                        height={48}
                        className="object-cover h-full w-full"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center flex-shrink-0">
                      <User className="h-6 w-6 text-gray-500" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{user.name}</div>
                    <div className="text-xs text-gray-500">
                      Blocked on {formatDate(user.created_at)}
                    </div>
                    {user.reason && (
                      <div className="mt-0.5 text-xs text-gray-400 truncate">
                        Reason: {user.reason}
                      </div>
                    )}
                  </div>

                  {/* Unblock Button */}
                  <button
                    type="button"
                    onClick={() => handleUnblock(user.blocked_id, user.name)}
                    disabled={unblocking === user.blocked_id}
                    className="flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all disabled:opacity-50"
                  >
                    {unblocking === user.blocked_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full px-6 py-3 text-sm font-medium text-white shadow-lg transition-all ${
            toast.type === "success"
              ? "bg-green-600"
              : "bg-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
