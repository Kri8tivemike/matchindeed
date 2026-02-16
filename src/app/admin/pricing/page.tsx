"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  DollarSign,
  Save,
  AlertCircle,
  CheckCircle,
  Loader2,
  Crown,
  RefreshCw,
  History,
} from "lucide-react";

/**
 * Pricing tier data
 */
type PricingTier = {
  tier_id: string;
  price_ngn: number;
  price_usd: number;
  price_gbp: number;
  updated_at: string;
};

/**
 * AdminPricingPage - Manage subscription pricing
 * 
 * Features:
 * - Edit prices for all tiers (NGN, USD, GBP)
 * - Preview changes before saving
 * - Save with admin logging
 */
export default function AdminPricingPage() {
  const [pricing, setPricing] = useState<PricingTier[]>([]);
  const [originalPricing, setOriginalPricing] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  /**
   * Fetch current pricing
   */
  const fetchPricing = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_pricing")
        .select("*")
        .order("tier_id");

      if (error) {
        console.error("Error fetching pricing:", error);
        return;
      }

      // Ensure all tiers exist
      const tiers = ["basic", "standard", "premium", "vip"];
      const existingTiers = data?.map(p => p.tier_id) || [];
      const missingTiers = tiers.filter(t => !existingTiers.includes(t));

      // Create default pricing for missing tiers
      const defaultPricing: Record<string, { ngn: number; usd: number; gbp: number }> = {
        basic: { ngn: 10000, usd: 7, gbp: 5.5 },
        standard: { ngn: 31500, usd: 20, gbp: 16 },
        premium: { ngn: 63000, usd: 43, gbp: 34 },
        vip: { ngn: 1500000, usd: 1000, gbp: 800 },
      };

      if (missingTiers.length > 0) {
        const newPricing = missingTiers.map(tier => ({
          tier_id: tier,
          price_ngn: defaultPricing[tier].ngn,
          price_usd: defaultPricing[tier].usd,
          price_gbp: defaultPricing[tier].gbp,
        }));

        await supabase.from("subscription_pricing").insert(newPricing);
      }

      // Refetch to get all data
      const { data: allData } = await supabase
        .from("subscription_pricing")
        .select("*")
        .order("tier_id");

      const sortedData = (allData || []).sort((a, b) => {
        const order = { basic: 0, standard: 1, premium: 2, vip: 3 };
        return (order[a.tier_id as keyof typeof order] || 0) - (order[b.tier_id as keyof typeof order] || 0);
      });

      setPricing(sortedData);
      setOriginalPricing(JSON.parse(JSON.stringify(sortedData)));
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPricing();
  }, []);

  /**
   * Check if there are unsaved changes
   */
  useEffect(() => {
    const changed = JSON.stringify(pricing) !== JSON.stringify(originalPricing);
    setHasChanges(changed);
  }, [pricing, originalPricing]);

  /**
   * Update a specific tier's price
   */
  const updatePrice = (tierId: string, currency: "price_ngn" | "price_usd" | "price_gbp", value: number) => {
    setPricing(prev => prev.map(tier => 
      tier.tier_id === tierId 
        ? { ...tier, [currency]: value }
        : tier
    ));
  };

  /**
   * Save all pricing changes
   */
  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update each tier
      for (const tier of pricing) {
        const { error } = await supabase
          .from("subscription_pricing")
          .update({
            price_ngn: tier.price_ngn,
            price_usd: tier.price_usd,
            price_gbp: tier.price_gbp,
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          })
          .eq("tier_id", tier.tier_id);

        if (error) throw error;
      }

      // Log admin action
      if (user) {
        const originalTier = originalPricing.find(o => o.tier_id);
        await supabase.from("admin_logs").insert({
          admin_id: user.id,
          action: "pricing_update",
          meta: { 
            old_pricing: originalPricing,
            new_pricing: pricing,
          },
        });
      }

      setOriginalPricing(JSON.parse(JSON.stringify(pricing)));
      setMessage({ type: "success", text: "Pricing updated successfully!" });
    } catch (error) {
      console.error("Error saving pricing:", error);
      setMessage({ type: "error", text: "Failed to save pricing changes." });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Reset to original pricing
   */
  const handleReset = () => {
    setPricing(JSON.parse(JSON.stringify(originalPricing)));
  };

  /**
   * Get tier display info
   */
  const getTierInfo = (tierId: string) => {
    switch (tierId) {
      case "basic":
        return { name: "Basic", color: "bg-gray-100 text-gray-700", icon: "⭐" };
      case "standard":
        return { name: "Standard", color: "bg-blue-100 text-blue-700", icon: "⭐⭐" };
      case "premium":
        return { name: "Premium", color: "bg-amber-100 text-amber-700", icon: "⭐⭐⭐" };
      case "vip":
        return { name: "VIP", color: "bg-purple-100 text-purple-700", icon: "👑" };
      default:
        return { name: tierId, color: "bg-gray-100 text-gray-700", icon: "" };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f419a]" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing Management</h1>
          <p className="text-gray-500">Configure subscription prices for all tiers</p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1f419a] text-white hover:bg-[#17357b] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Changes
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-6 flex items-center gap-3 p-4 rounded-xl ${
          message.type === "success" 
            ? "bg-green-50 text-green-700 border border-green-200" 
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.type === "success" ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          {message.text}
        </div>
      )}

      {/* Unsaved Changes Warning */}
      {hasChanges && (
        <div className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
          <AlertCircle className="h-5 w-5" />
          You have unsaved changes. Click "Save Changes" to apply them.
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {pricing.map((tier) => {
          const tierInfo = getTierInfo(tier.tier_id);
          const original = originalPricing.find(o => o.tier_id === tier.tier_id);
          
          return (
            <div
              key={tier.tier_id}
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-100"
            >
              {/* Tier Header */}
              <div className="flex items-center gap-3 mb-6">
                <span className="text-2xl">{tierInfo.icon}</span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{tierInfo.name}</h3>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${tierInfo.color}`}>
                    {tier.tier_id.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Price Inputs */}
              <div className="space-y-4">
                {/* NGN */}
                <div>
                  <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                    <span>Nigerian Naira (₦)</span>
                    {original && tier.price_ngn !== original.price_ngn && (
                      <span className="text-xs text-amber-600">
                        Changed from ₦{original.price_ngn.toLocaleString()}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₦</span>
                    <input
                      type="number"
                      value={tier.price_ngn}
                      onChange={(e) => updatePrice(tier.tier_id, "price_ngn", parseFloat(e.target.value) || 0)}
                      className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none"
                    />
                  </div>
                </div>

                {/* USD */}
                <div>
                  <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                    <span>US Dollar ($)</span>
                    {original && tier.price_usd !== original.price_usd && (
                      <span className="text-xs text-amber-600">
                        Changed from ${original.price_usd.toLocaleString()}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      value={tier.price_usd}
                      onChange={(e) => updatePrice(tier.tier_id, "price_usd", parseFloat(e.target.value) || 0)}
                      className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none"
                    />
                  </div>
                </div>

                {/* GBP */}
                <div>
                  <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1">
                    <span>British Pound (£)</span>
                    {original && tier.price_gbp !== original.price_gbp && (
                      <span className="text-xs text-amber-600">
                        Changed from £{original.price_gbp.toLocaleString()}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">£</span>
                    <input
                      type="number"
                      value={tier.price_gbp}
                      onChange={(e) => updatePrice(tier.tier_id, "price_gbp", parseFloat(e.target.value) || 0)}
                      className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#1f419a] focus:ring-2 focus:ring-[#1f419a]/20 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Last Updated */}
              {tier.updated_at && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
                  <History className="h-3.5 w-3.5" />
                  Last updated: {new Date(tier.updated_at).toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info Section */}
      <div className="mt-8 p-6 rounded-xl bg-gray-50 border border-gray-200">
        <h3 className="font-semibold text-gray-900 mb-3">Pricing Notes</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li>• Prices are per month for subscription plans</li>
          <li>• NGN prices are shown to users with Nigerian IP addresses</li>
          <li>• USD prices are shown to international users (default)</li>
          <li>• GBP prices are shown to users from the United Kingdom</li>
          <li>• Changes take effect immediately for new subscriptions</li>
          <li>• Existing subscriptions are not affected until renewal</li>
        </ul>
      </div>
    </div>
  );
}
