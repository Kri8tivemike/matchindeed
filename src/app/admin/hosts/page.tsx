"use client";

/**
 * AdminCoordinatorsPage - Coordinator Management
 *
 * Features per client request:
 * - Link existing user accounts as coordinators
 * - Enable/disable coordinator access
 * - Keep coordinator management separate from host/earnings features
 */

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Loader2,
} from "lucide-react";

type Coordinator = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  enabled: boolean;
  permissions: Record<string, unknown> | null;
  created_at: string;
  account?: {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    account_status: string;
  } | null;
};

export default function AdminCoordinatorsPage() {
  const { toast } = useToast();
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const fetchCoordinators = async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to load coordinators.");
        setCoordinators([]);
        return;
      }

      const response = await fetch("/api/admin/coordinators", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.error || "Failed to load coordinators.");
        setCoordinators([]);
        return;
      }

      setCoordinators(data.coordinators || []);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to load coordinators.");
      setCoordinators([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoordinators();
  }, []);

  const handleAddCoordinator = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to add a coordinator.");
        return;
      }

      const response = await fetch("/api/admin/coordinators", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.error || "Failed to add coordinator");
        return;
      }

      setFormData({ name: "", email: "", phone: "" });
      setShowAddModal(false);
      await fetchCoordinators();
      toast.success("Coordinator account linked successfully.");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to add coordinator");
    }
  };

  const handleToggleEnabled = async (id: string, currentStatus: boolean) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in again to update this coordinator.");
        return;
      }

      const response = await fetch("/api/admin/coordinators", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          coordinator_id: id,
          enabled: !currentStatus,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.error || "Failed to update coordinator.");
        return;
      }

      await fetchCoordinators();
      toast.success(currentStatus ? "Coordinator disabled." : "Coordinator enabled.");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to update coordinator.");
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coordinators</h1>
          <p className="text-gray-500">Manage meeting coordinators for admin-assigned video meetings</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1f419a] text-white hover:bg-[#17357b]"
        >
          <Plus className="h-4 w-4" />
          Add Coordinator
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
          </div>
        ) : (
          <div className="max-h-[55vh] overflow-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {coordinators.map((coord) => (
                <tr key={coord.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">{coord.name}</td>
                  <td className="px-6 py-4">{coord.email}</td>
                  <td className="px-6 py-4">{coord.phone || "—"}</td>
                  <td className="px-6 py-4">
                    {coord.account ? (
                      <div>
                        <p className="text-sm font-medium capitalize text-gray-900">
                          {coord.account.role}
                        </p>
                        <p className="text-xs text-gray-500">
                          {coord.account.account_status}
                        </p>
                      </div>
                    ) : (
                      <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                        Not linked
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      coord.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                    }`}>
                      {coord.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleToggleEnabled(coord.id, coord.enabled)}
                      className="px-3 py-1 rounded-lg text-sm border border-gray-200 hover:bg-gray-50"
                    >
                      {coord.enabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-4">Add Coordinator</h3>
            <p className="mb-4 text-sm text-gray-500">
              The coordinator must already have a user account. We will link that
              account and enable coordinator access.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCoordinator}
                  className="flex-1 py-2 rounded-lg bg-[#1f419a] text-white"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
