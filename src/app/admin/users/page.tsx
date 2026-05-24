"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { adminPath } from "@/lib/admin/path";
import Image from "next/image";
import {
  formatAdminRoleLabel,
  getDisplayAdminRole,
} from "@/lib/admin/growth-manager";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Ban,
  AlertTriangle,
  Shield,
  Loader2,
  Crown,
  CheckCircle,
  XCircle,
  Trash2,
} from "lucide-react";

/**
 * User type for list display
 */
type UserListItem = {
  id: string;
  email: string;
  display_name: string | null;
  tier: string;
  role: string;
  account_status: string;
  email_verified: boolean;
  created_at: string;
  profile?: {
    first_name: string | null;
    profile_photo_url: string | null;
  };
};

type UserListQueryRow = {
  id: string;
  email: string;
  display_name: string | null;
  tier: string;
  role: string;
  account_status: string;
  email_verified: boolean;
  created_at: string;
  user_profiles:
    | {
        first_name: string | null;
        profile_photo_url: string | null;
      }
    | {
        first_name: string | null;
        profile_photo_url: string | null;
      }[]
    | null;
};

/**
 * Filter options
 */
type FilterOptions = {
  tier: string;
  status: string;
  role: string;
  verified: string;
};

/**
 * AdminUsersPage - User management list
 * 
 * Features:
 * - Paginated user list
 * - Search by name/email
 * - Filter by tier, status, role, verification
 * - Quick actions (view, suspend, ban)
 */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterOptions>({
    tier: "all",
    status: "all",
    role: "all",
    verified: "all",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const pageSize = 20;
  const totalPages = Math.ceil(totalUsers / pageSize);

  /**
   * Fetch users with filters and pagination
   */
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      // Build query
      let query = supabase
        .from("accounts")
        .select(`
          id,
          email,
          display_name,
          tier,
          role,
          account_status,
          email_verified,
          created_at,
          user_profiles (
            first_name,
            profile_photo_url
          )
        `, { count: "exact" });

      // Apply filters
      if (filters.tier !== "all") {
        query = query.eq("tier", filters.tier);
      }
      if (filters.status !== "all") {
        query = query.eq("account_status", filters.status);
      }
      if (filters.role !== "all") {
        query = query.eq("role", filters.role);
      }
      if (filters.verified !== "all") {
        query = query.eq("email_verified", filters.verified === "verified");
      }

      // Apply search
      if (debouncedSearchQuery) {
        query = query.or(
          `email.ilike.%${debouncedSearchQuery}%,display_name.ilike.%${debouncedSearchQuery}%`
        );
      }

      // Apply pagination
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      
      query = query
        .order("created_at", { ascending: false })
        .range(from, to);

      const { data, count, error } = await query;

      if (error) {
        console.error("Error fetching users:", error);
        return;
      }

      const rows = (data as UserListQueryRow[] | null) || [];
      const adminRows = rows.filter((user) => user.role === "admin");
      const adminPermissionsByUser: Record<string, { permissions?: string[] }> = {};

      if (adminRows.length > 0) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          const permissionsResponse = await fetch("/api/admin/permissions", {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

          if (permissionsResponse.ok) {
            const permissionsData = (await permissionsResponse.json()) as {
              by_user?: Record<string, { permissions?: string[] }>;
            };
            Object.assign(adminPermissionsByUser, permissionsData.by_user || {});
          }
        }
      }

      // Transform data
      const transformedUsers: UserListItem[] = rows.map((user) => ({
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        tier: user.tier,
        role: getDisplayAdminRole(
          user.role,
          adminPermissionsByUser[user.id]?.permissions
        ),
        account_status: user.account_status,
        email_verified: user.email_verified,
        created_at: user.created_at,
        profile: Array.isArray(user.user_profiles)
          ? user.user_profiles[0] || undefined
          : user.user_profiles || undefined,
      }));

      setUsers(transformedUsers);
      setTotalUsers(count || 0);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage, debouncedSearchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Keep only currently visible users selected when the page/filter changes.
  useEffect(() => {
    setSelectedUserIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(users.map((u) => u.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visibleIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [users]);

  /**
   * Handle user action (suspend, ban, warn)
   */
  const handleUserAction = async (userId: string, action: "suspend" | "ban" | "activate") => {
    setActionLoading(userId);
    try {
      let newStatus: string;
      switch (action) {
        case "suspend":
          newStatus = "suspended";
          break;
        case "ban":
          newStatus = "banned";
          break;
        case "activate":
          newStatus = "active";
          break;
        default:
          return;
      }

      const { error } = await supabase
        .from("accounts")
        .update({ account_status: newStatus })
        .eq("id", userId);

      if (error) {
        console.error("Error updating user:", error);
        return;
      }

      // Log admin action
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("admin_logs").insert({
          admin_id: user.id,
          target_user_id: userId,
          action: `user_${action}`,
          meta: { new_status: newStatus },
        });
      }

      // Refresh list
      fetchUsers();
      setActionMenuId(null);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (users.length === 0) return;
    const allSelected = users.every((u) => selectedUserIds.has(u.id));
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        users.forEach((u) => next.delete(u.id));
      } else {
        users.forEach((u) => next.add(u.id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const userIds = Array.from(selectedUserIds);
    if (userIds.length === 0) return;

    const confirmed = window.confirm(
      `Delete ${userIds.length} selected account${userIds.length > 1 ? "s" : ""}? This will disable login for those users.`
    );
    if (!confirmed) return;

    const note = window.prompt("Optional note for bulk deletion:", "");

    setBulkDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Admin session missing");
      }

      const res = await fetch("/api/admin/user-actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "bulk_delete_users",
          user_ids: userIds,
          reason: note || undefined,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Bulk delete failed");
      }

      const deleted = typeof payload?.deleted_count === "number" ? payload.deleted_count : 0;
      const skipped = typeof payload?.skipped_count === "number" ? payload.skipped_count : 0;
      const failed = typeof payload?.failed_count === "number" ? payload.failed_count : 0;
      window.alert(
        `Bulk delete completed.\nDeleted: ${deleted}\nSkipped: ${skipped}\nFailed: ${failed}`
      );

      setSelectedUserIds(new Set());
      fetchUsers();
    } catch (error) {
      console.error("Error bulk deleting users:", error);
      window.alert(error instanceof Error ? error.message : "Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  };

  /**
   * Handle deletion workflow actions via admin API
   */
  const handleDeletionRequestAction = async (
    userId: string,
    action: "approve_deletion_request" | "reject_deletion_request"
  ) => {
    const isApprove = action === "approve_deletion_request";
    const confirmed = window.confirm(
      isApprove
        ? "Approve deletion request and disable this user's login?"
        : "Reject deletion request and reactivate this user?"
    );
    if (!confirmed) return;

    const note = window.prompt(
      isApprove
        ? "Optional note for deletion approval:"
        : "Optional note for rejection:",
      ""
    );

    setActionLoading(userId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Admin session missing");
      }

      const res = await fetch("/api/admin/user-actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action,
          user_id: userId,
          reason: note || undefined,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to process deletion request");
      }

      fetchUsers();
      setActionMenuId(null);
    } catch (error) {
      console.error("Error processing deletion request:", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Failed to process deletion request"
      );
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Get tier badge color
   */
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

  /**
   * Get status badge
   */
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700";
      case "suspended":
        return "bg-amber-100 text-amber-700";
      case "banned":
        return "bg-red-100 text-red-700";
      case "deactivated":
        return "bg-gray-100 text-gray-700";
      case "deletion_requested":
        return "bg-orange-100 text-orange-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const formatStatusLabel = (status: string) =>
    status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());

  const allVisibleSelected =
    users.length > 0 && users.every((user) => selectedUserIds.has(user.id));

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500">{totalUsers.toLocaleString()} total users</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none"
            />
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
              showFilters
                ? "border-[#1f419a] bg-[#1f419a]/10 text-[#1f419a]"
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Filter className="h-5 w-5" />
            Filters
          </button>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
            {/* Tier Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
              <select
                value={filters.tier}
                onChange={(e) => setFilters({ ...filters, tier: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
              >
                <option value="all">All Tiers</option>
                <option value="basic">Basic</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
                <option value="vip">VIP</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="banned">Banned</option>
                <option value="deactivated">Deactivated</option>
                <option value="deletion_requested">Deletion Requested</option>
              </select>
            </div>

            {/* Role Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={filters.role}
                onChange={(e) => setFilters({ ...filters, role: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
              >
                <option value="all">All Roles</option>
                <option value="user">User</option>
                <option value="coordinator">Coordinator</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </div>

            {/* Verified Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verified</label>
              <select
                value={filters.verified}
                onChange={(e) => setFilters({ ...filters, verified: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
              >
                <option value="all">All</option>
                <option value="verified">Verified</option>
                <option value="unverified">Unverified</option>
              </select>
            </div>
          </div>
        )}

      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No users found</p>
          </div>
        ) : (
          <>
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[1120px]">
                <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-100 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        aria-label={allVisibleSelected ? "Deselect all users" : "Select all users"}
                        className="h-4 w-4 rounded border-gray-300 text-[#1f419a] focus:ring-[#1f419a]"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tier
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.has(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                          aria-label={
                            selectedUserIds.has(user.id)
                              ? `Deselect ${user.email}`
                              : `Select ${user.email}`
                          }
                          className="h-4 w-4 rounded border-gray-300 text-[#1f419a] focus:ring-[#1f419a]"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                            {user.profile?.profile_photo_url ? (
                              <Image
                                src={user.profile.profile_photo_url}
                                alt=""
                                width={40}
                                height={40}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            ) : (
                              <span className="text-sm font-medium text-gray-500">
                                {(user.profile?.first_name || user.email)[0].toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {user.profile?.first_name || user.display_name || "—"}
                            </p>
                            <p className="text-sm text-gray-500 flex items-center gap-1">
                              {user.email}
                              {user.email_verified ? (
                                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-gray-400" />
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getTierBadge(user.tier)}`}>
                          <Crown className="h-3 w-3" />
                          {user.tier.charAt(0).toUpperCase() + user.tier.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(user.account_status)}`}>
                          {formatStatusLabel(user.account_status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.role !== "user" && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            <Shield className="h-3 w-3" />
                            {formatAdminRoleLabel(user.role)}
                          </span>
                        )}
                        {user.role === "user" && (
                          <span className="text-sm text-gray-500">User</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="relative">
                          <button
                            onClick={() => setActionMenuId(actionMenuId === user.id ? null : user.id)}
                            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <MoreHorizontal className="h-5 w-5 text-gray-500" />
                          </button>

                          {/* Action Menu */}
                          {actionMenuId === user.id && (
                            <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-10">
                              <Link
                                href={adminPath(`/users/${user.id}`)}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Eye className="h-4 w-4" />
                                View Details
                              </Link>
                              
                              {user.account_status === "active" && (
                                <>
                                  <button
                                    onClick={() => handleUserAction(user.id, "suspend")}
                                    disabled={actionLoading === user.id}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                                  >
                                    <AlertTriangle className="h-4 w-4" />
                                    Suspend
                                  </button>
                                  <button
                                    onClick={() => handleUserAction(user.id, "ban")}
                                    disabled={actionLoading === user.id}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    <Ban className="h-4 w-4" />
                                    Ban User
                                  </button>
                                </>
                              )}

                              {(user.account_status === "suspended" || user.account_status === "banned") && (
                                <button
                                  onClick={() => handleUserAction(user.id, "activate")}
                                  disabled={actionLoading === user.id}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-600 hover:bg-green-50 disabled:opacity-50"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                  Activate
                                </button>
                              )}

                              {user.account_status === "deletion_requested" && (
                                <>
                                  <button
                                    onClick={() =>
                                      handleDeletionRequestAction(
                                        user.id,
                                        "approve_deletion_request"
                                      )
                                    }
                                    disabled={actionLoading === user.id}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Approve Delete
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDeletionRequestAction(
                                        user.id,
                                        "reject_deletion_request"
                                      )
                                    }
                                    disabled={actionLoading === user.id}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-600 hover:bg-green-50 disabled:opacity-50"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                    Reject Request
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Showing {(currentPage - 1) * pageSize + 1} to{" "}
                  {Math.min(currentPage * pageSize, totalUsers)} of {totalUsers}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating bulk action bar so actions remain visible while scrolling */}
      {selectedUserIds.size > 0 && (
        <div className="fixed inset-x-3 bottom-4 z-50 sm:inset-x-auto sm:right-6">
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-white px-4 py-3 shadow-2xl sm:min-w-[360px]">
            <div className="text-sm font-semibold text-gray-900">
              {selectedUserIds.size} selected
            </div>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setSelectedUserIds(new Set())}
                disabled={bulkDeleting}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
