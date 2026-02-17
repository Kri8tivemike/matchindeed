"use client";

/**
 * AdminHostsPage - Host/Coordinator Management
 *
 * Features per client request:
 * - Register hosts with name, phone, 2FA
 * - Enable/disable host functions
 * - View host reports
 * - Manage host permissions
 * - Host Profiles: Create host_profiles for users who run meetings and earn commission
 */

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase";
import {
  UserCheck,
  Plus,
  Edit,
  Trash2,
  Eye,
  Loader2,
  RefreshCw,
  Shield,
  Phone,
  Mail,
  DollarSign,
} from "lucide-react";

type Coordinator = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  enabled: boolean;
  permissions: any;
  created_at: string;
};

type HostProfile = {
  id: string;
  user_id: string;
  host_type: "basic" | "premium" | "vip";
  commission_rate: number;
  is_active: boolean;
  created_at: string;
};

export default function AdminHostsPage() {
  const { toast } = useToast();
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [hostProfiles, setHostProfiles] = useState<HostProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [hostsLoading, setHostsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddHostModal, setShowAddHostModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [hostFormData, setHostFormData] = useState({
    userEmail: "",
    hostType: "basic" as "basic" | "premium" | "vip",
    commissionRate: 10,
  });

  const fetchCoordinators = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("meeting_coordinators")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error:", error);
        return;
      }

      setCoordinators(data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHostProfiles = async () => {
    setHostsLoading(true);
    try {
      const { data, error } = await supabase
        .from("host_profiles")
        .select("id, user_id, host_type, commission_rate, is_active, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching host profiles:", error);
        return;
      }
      setHostProfiles(data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setHostsLoading(false);
    }
  };

  useEffect(() => {
    fetchCoordinators();
    fetchHostProfiles();
  }, []);

  const handleAddHostProfile = async () => {
    try {
      const { data: account } = await supabase
        .from("accounts")
        .select("id")
        .eq("email", hostFormData.userEmail.trim())
        .single();

      if (!account) {
        toast.error("No account found with that email. User must register first.");
        return;
      }

      const { error } = await supabase.from("host_profiles").insert({
        user_id: account.id,
        host_type: hostFormData.hostType,
        commission_rate: hostFormData.commissionRate,
        is_active: true,
      });

      if (error) throw error;

      setHostFormData({ userEmail: "", hostType: "basic", commissionRate: 10 });
      setShowAddHostModal(false);
      fetchHostProfiles();
      toast.success("Host profile created! User can now access /host/dashboard");
    } catch (error: unknown) {
      console.error("Error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create host profile"
      );
    }
  };

  const handleAddCoordinator = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("meeting_coordinators")
        .insert({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          enabled: true,
          created_by: user?.id,
        });

      if (error) throw error;

      setFormData({ name: "", email: "", phone: "" });
      setShowAddModal(false);
      fetchCoordinators();
      toast.success("Coordinator added successfully!");
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to add coordinator");
    }
  };

  const handleToggleEnabled = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("meeting_coordinators")
        .update({ enabled: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      fetchCoordinators();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hosts/Coordinators</h1>
          <p className="text-gray-500">Manage meeting coordinators and hosts</p>
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
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
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
        )}
      </div>

      {/* Host Profiles Section - Phase 5 host system */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-green-600" />
              Host Profiles (Earnings)
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              Users with host profiles can access /host/dashboard to run meetings and earn commission
            </p>
          </div>
          <button
            onClick={() => setShowAddHostModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
          >
            <Plus className="w-4 h-4" />
            Add Host
          </button>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {hostsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : hostProfiles.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              No host profiles yet. Add a host by entering an existing user&apos;s email.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Commission</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hostProfiles.map((hp) => (
                  <tr key={hp.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono text-sm">{hp.user_id.substring(0, 8)}...</td>
                    <td className="px-6 py-4 capitalize">{hp.host_type}</td>
                    <td className="px-6 py-4">{hp.commission_rate}%</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        hp.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                      }`}>
                        {hp.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-4">Add Coordinator</h3>
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

      {showAddHostModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-4">Add Host Profile</h3>
            <p className="text-sm text-gray-500 mb-4">
              User must have an existing account. They will get access to /host/dashboard.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">User Email</label>
                <input
                  type="email"
                  value={hostFormData.userEmail}
                  onChange={(e) => setHostFormData({ ...hostFormData, userEmail: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Host Type</label>
                <select
                  value={hostFormData.hostType}
                  onChange={(e) => setHostFormData({ ...hostFormData, hostType: e.target.value as "basic" | "premium" | "vip" })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                >
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Commission Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={hostFormData.commissionRate}
                  onChange={(e) => setHostFormData({ ...hostFormData, commissionRate: parseFloat(e.target.value) || 10 })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#1f419a] outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddHostModal(false)}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddHostProfile}
                  className="flex-1 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
                >
                  Add Host
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
