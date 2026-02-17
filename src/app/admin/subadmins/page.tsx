"use client";

/**
 * AdminSubAdminsPage - Sub-Admin Management
 *
 * Features per client request:
 * - Create sub-admin accounts
 * - Allocate menu permissions
 * - Setup 2FA
 * - Enable/disable sub-admin functions
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ToastProvider";
import {
  UserCog,
  Shield,
  Loader2,
  RefreshCw,
  Check,
  ChevronDown,
} from "lucide-react";
import { ALL_PERMISSIONS } from "@/lib/admin-permissions";

type SubAdmin = {
  id: string;
  email: string;
  role: string;
  account_status: string;
  display_name: string | null;
};

export default function AdminSubAdminsPage() {
  const { toast } = useToast();
  const [subAdmins, setSubAdmins] = useState<SubAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionsByRole, setPermissionsByRole] = useState<Record<string, string[]>>({});
  const [permsLoading, setPermsLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [savingPerms, setSavingPerms] = useState(false);

  const fetchSubAdmins = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .in("role", ["admin", "moderator"])
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error:", error);
        return;
      }

      setSubAdmins(data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = useCallback(async () => {
    setPermsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/admin/permissions", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPermissionsByRole(data.by_role || {});
      }
    } catch (err) {
      console.error("Error fetching permissions:", err);
    } finally {
      setPermsLoading(false);
    }
  }, []);

  const handleSavePermissions = async (role: string, perms: string[]) => {
    setSavingPerms(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to save permissions");
        return;
      }

      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ role, permissions: perms }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }
      setPermissionsByRole((prev) => ({ ...prev, [role]: perms }));
      setEditingRole(null);
      toast.success(`Permissions for ${role} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save permissions");
    } finally {
      setSavingPerms(false);
    }
  };

  useEffect(() => {
    fetchSubAdmins();
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sub-Admins</h1>
          <p className="text-gray-500">Manage sub-admin accounts and permissions</p>
        </div>
        <button
          onClick={() => fetchSubAdmins()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subAdmins.map((admin) => (
                <tr key={admin.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">{admin.display_name || "—"}</td>
                  <td className="px-6 py-4">{admin.email}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                      {admin.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      admin.account_status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                    }`}>
                      {admin.account_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/users/${admin.id}`}
                      className="px-3 py-1 rounded-lg text-sm border border-gray-200 hover:bg-gray-50"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Role Permissions Section */}
      <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Role Permissions</h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure which permissions each role has. Superadmin only.
          </p>
        </div>
        <div className="p-6">
          {permsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#1f419a]" />
            </div>
          ) : (
            <div className="space-y-6">
              {(["moderator", "admin"] as const).map((role) => (
                <div key={role} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900 capitalize">{role}</h3>
                    {editingRole === role ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingRole(null)}
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSavePermissions(role, permissionsByRole[role] || [])}
                          disabled={savingPerms}
                          className="px-3 py-1.5 text-sm rounded-lg bg-[#1f419a] text-white hover:bg-[#183882] disabled:opacity-50 flex items-center gap-1"
                        >
                          {savingPerms ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingRole(role)}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1"
                      >
                        <Shield className="h-4 w-4" />
                        Edit
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {ALL_PERMISSIONS.map((perm) => (
                      <label
                        key={perm}
                        className={`flex items-center gap-2 text-sm ${
                          editingRole === role ? "cursor-pointer" : "cursor-default opacity-75"
                        }`}
                      >
                        <input
                          id={`perm-${role}-${perm}`}
                          type="checkbox"
                          checked={(permissionsByRole[role] || []).includes(perm)}
                          disabled={editingRole !== role}
                          onChange={(e) => {
                            if (editingRole !== role) return;
                            const current = permissionsByRole[role] || [];
                            const next = e.target.checked
                              ? [...current, perm]
                              : current.filter((p) => p !== perm);
                            setPermissionsByRole((prev) => ({ ...prev, [role]: next }));
                          }}
                          className="rounded border-gray-300 text-[#1f419a] focus:ring-[#1f419a]"
                        />
                        <span className="text-gray-700">{perm.replace(/_/g, " ")}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
