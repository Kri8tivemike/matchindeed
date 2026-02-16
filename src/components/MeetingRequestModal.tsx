"use client";

import { useState, useEffect } from "react";
import {
  X,
  Calendar,
  Clock,
  Video,
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CreditCard,
  Crown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Availability slot type
 */
type AvailabilitySlot = {
  id: string;
  slot_date: string;
  slot_time: string;
};

/**
 * User info for display
 */
type UserInfo = {
  id: string;
  first_name: string | null;
  profile_photo_url: string | null;
  tier: string;
};

/**
 * Props for the MeetingRequestModal component
 */
type MeetingRequestModalProps = {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Target user to request meeting with */
  targetUser: UserInfo;
  /** Callback when meeting is successfully requested */
  onSuccess?: (meeting: any) => void;
};

/**
 * MeetingRequestModal - Modal for requesting a video dating meeting
 * 
 * Shows target user's available slots and allows booking.
 * Checks tier permissions and credit balance before submitting.
 */
export default function MeetingRequestModal({
  isOpen,
  onClose,
  targetUser,
  onSuccess,
}: MeetingRequestModalProps) {
  // Available slots from target user
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  // Loading states
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Selected slot
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  // Current month being viewed
  const [currentMonth, setCurrentMonth] = useState(new Date());
  // User's credits
  const [credits, setCredits] = useState<{ available: number; required: number } | null>(null);
  // Error/success messages
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Tier permission check result
  const [tierPermission, setTierPermission] = useState<{
    allowed: boolean;
    message: string;
    extra_charge: boolean;
  } | null>(null);

  /**
   * Fetch target user's availability and check permissions
   */
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setLoadingSlots(true);
      setMessage(null);
      setSelectedSlot(null);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setMessage({ type: "error", text: "Please log in to request meetings." });
          return;
        }

        // Fetch target user's availability
        const { data: slotsData, error: slotsError } = await supabase
          .from("meeting_availability")
          .select("id, slot_date, slot_time")
          .eq("user_id", targetUser.id)
          .gte("slot_date", new Date().toISOString().split("T")[0])
          .order("slot_date", { ascending: true })
          .order("slot_time", { ascending: true });

        if (slotsError) {
          console.error("Error fetching slots:", slotsError);
          setMessage({ type: "error", text: "Failed to load availability." });
        } else {
          setSlots(slotsData || []);
        }

        // Get current user's account and credits
        const { data: accountData } = await supabase
          .from("accounts")
          .select("tier")
          .eq("id", user.id)
          .single();

        const { data: creditsData } = await supabase
          .from("credits")
          .select("total, used")
          .eq("user_id", user.id)
          .single();

        // Get tier config to check permissions
        if (accountData) {
          const { data: tierConfig } = await supabase
            .from("account_tier_config")
            .select("*")
            .eq("tier", accountData.tier)
            .single();

          if (tierConfig) {
            // Check if can contact target tier
            const permission = checkTierPermission(tierConfig, targetUser.tier);
            setTierPermission(permission);

            // Calculate required credits
            const requiredCredits = permission.extra_charge ? 2 : 1;
            const availableCredits = creditsData ? creditsData.total - creditsData.used : 0;
            setCredits({ available: availableCredits, required: requiredCredits });
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        setMessage({ type: "error", text: "An error occurred. Please try again." });
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchData();
  }, [isOpen, targetUser.id, targetUser.tier]);

  /**
   * Check tier permissions
   */
  function checkTierPermission(config: any, targetTier: string) {
    if (config.tier === "vip") {
      return { allowed: true, message: "", extra_charge: false };
    }

    switch (targetTier) {
      case "basic":
        return {
          allowed: config.can_one_on_one_to_basic,
          message: config.can_one_on_one_to_basic ? "" : "Your plan cannot contact Basic users",
          extra_charge: false,
        };
      case "standard":
        return {
          allowed: config.can_one_on_one_to_standard,
          message: config.can_one_on_one_to_standard ? "" : "Your plan cannot contact Standard users",
          extra_charge: false,
        };
      case "premium":
        return {
          allowed: config.can_one_on_one_to_premium,
          message: config.can_one_on_one_to_premium ? "" : "Upgrade to Premium to contact Premium users",
          extra_charge: config.extra_charge_one_on_one_to_premium,
        };
      case "vip":
        return {
          allowed: config.can_one_on_one_to_vip,
          message: config.can_one_on_one_to_vip ? "" : "Only Premium users can contact VIP members",
          extra_charge: config.extra_charge_one_on_one_to_vip,
        };
      default:
        return { allowed: false, message: "Unknown tier", extra_charge: false };
    }
  }

  /**
   * Get slots for a specific date
   */
  const getSlotsForDate = (dateStr: string): AvailabilitySlot[] => {
    return slots.filter((s) => s.slot_date === dateStr);
  };

  /**
   * Get unique dates that have slots
   */
  const datesWithSlots = [...new Set(slots.map((s) => s.slot_date))];

  /**
   * Submit meeting request
   */
  const handleSubmit = async () => {
    if (!selectedSlot) {
      setMessage({ type: "error", text: "Please select a time slot." });
      return;
    }

    if (tierPermission && !tierPermission.allowed) {
      setMessage({ type: "error", text: tierPermission.message });
      return;
    }

    if (credits && credits.available < credits.required) {
      setMessage({
        type: "error",
        text: `Insufficient credits. You need ${credits.required} credit(s).`,
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          target_user_id: targetUser.id,
          slot_date: selectedSlot.slot_date,
          slot_time: selectedSlot.slot_time,
          type: "one_on_one",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Failed to request meeting." });
        return;
      }

      setMessage({ type: "success", text: "Meeting request sent!" });
      
      // Update credits display
      if (credits) {
        setCredits({
          ...credits,
          available: credits.available - credits.required,
        });
      }

      // Call success callback
      if (onSuccess) {
        onSuccess(data.meeting);
      }

      // Close modal after short delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error("Error submitting request:", error);
      setMessage({ type: "error", text: "An error occurred. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Format date for display
   */
  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  /**
   * Get tier badge color
   */
  const getTierColor = (tier: string): string => {
    switch (tier) {
      case "vip":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "premium":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "standard":
        return "bg-blue-100 text-blue-700 border-blue-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1f419a] to-[#2a44a3] flex items-center justify-center">
              <Video className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Request Meeting</h3>
              <p className="text-sm text-gray-500">
                with {targetUser.first_name || "User"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Target User Info */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
              {targetUser.profile_photo_url ? (
                <img
                  src={targetUser.profile_photo_url}
                  alt={targetUser.first_name || "User"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold text-gray-400">
                  {targetUser.first_name?.[0] || "?"}
                </span>
              )}
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">
                {targetUser.first_name || "User"}
              </p>
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${getTierColor(targetUser.tier)}`}
              >
                <Crown className="h-3 w-3" />
                {targetUser.tier.charAt(0).toUpperCase() + targetUser.tier.slice(1)}
              </span>
            </div>
          </div>

          {/* Tier Permission Warning */}
          {tierPermission && !tierPermission.allowed && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">{tierPermission.message}</p>
                <p className="text-sm text-red-600 mt-1">
                  Upgrade your subscription to contact this user.
                </p>
              </div>
            </div>
          )}

          {/* Credits Info */}
          {credits && tierPermission?.allowed && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-[#1f419a]/10 to-[#2a44a3]/10 border border-[#1f419a]/20">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#1f419a]" />
                <span className="text-sm text-gray-700">
                  Cost: <span className="font-bold text-[#1f419a]">{credits.required} credit(s)</span>
                  {tierPermission.extra_charge && (
                    <span className="text-xs text-amber-600 ml-1">(includes VIP fee)</span>
                  )}
                </span>
              </div>
              <span className={`text-sm font-medium ${credits.available >= credits.required ? "text-green-600" : "text-red-600"}`}>
                You have: {credits.available}
              </span>
            </div>
          )}

          {/* Message Banner */}
          {message && (
            <div
              className={`flex items-center gap-3 p-3 rounded-xl ${
                message.type === "success"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {message.type === "success" ? (
                <Check className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              <span className="text-sm">{message.text}</span>
            </div>
          )}

          {/* Available Slots */}
          {loadingSlots ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#1f419a]" />
              <span className="ml-2 text-gray-500">Loading availability...</span>
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">No available slots</p>
              <p className="text-sm text-gray-400">
                This user hasn't set any availability yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#1f419a]" />
                Available Times
              </h4>

              {/* Group slots by date */}
              {datesWithSlots.slice(0, 7).map((dateStr) => (
                <div key={dateStr} className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    {formatDate(dateStr)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {getSlotsForDate(dateStr).map((slot) => {
                      const isSelected = selectedSlot?.id === slot.id;
                      return (
                        <button
                          key={slot.id}
                          onClick={() => setSelectedSlot(slot)}
                          disabled={!tierPermission?.allowed}
                          className={`
                            px-4 py-2 rounded-lg text-sm font-medium transition-all
                            ${isSelected
                              ? "bg-[#1f419a] text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-[#1f419a]/20"
                            }
                            ${!tierPermission?.allowed ? "opacity-50 cursor-not-allowed" : ""}
                          `}
                        >
                          <Clock className="h-3 w-3 inline mr-1" />
                          {slot.slot_time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {datesWithSlots.length > 7 && (
                <p className="text-sm text-gray-500 text-center">
                  + {datesWithSlots.length - 7} more dates available
                </p>
              )}
            </div>
          )}
        </div>

        {/* Cancellation Policy Notice */}
        {tierPermission?.allowed && selectedSlot && (
          <div className="px-4 pb-2">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-900">Cancellation Policy</p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Once this meeting is confirmed, <strong>cancellation will result in a fee</strong> charged
                    to the cancelling party. No credit refund will be issued for confirmed meetings.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={(
              !selectedSlot ||
              submitting ||
              !tierPermission?.allowed ||
              (credits && credits.available < credits.required)
            ) as boolean}






            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Video className="h-4 w-4" />
                Request Meeting
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
