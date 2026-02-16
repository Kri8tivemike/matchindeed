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

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  UserCog,
  Plus,
  Shield,
  Settings,
  Loader2,
  RefreshCw,
} from "lucide-react";

type SubAdmin = {
  id: string;
  email: string;
  role: string;
  account_status: string;
  display_name: string | null;
};

export default function AdminSubAdminsPage() {
  const [subAdmins, setSubAdmins] = useState<SubAdmin[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchSubAdmins();
  }, []);

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
    </div>
  );
}
