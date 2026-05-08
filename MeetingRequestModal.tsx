"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  X,
  Calendar,
  Clock,
  Video,
  AlertCircle,
  Check,
  Loader2,
  CreditCard,
  Crown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ToastProvider";
import {
  getDateKeyInTimeZone,
  getSafeTimeZone,
  getTimeLabelInTimeZone,
  getDateLabelInTimeZone,
} from "@/lib/timezones";

/**
 * Availability slot type
 */
type AvailabilitySlot = {
  id: string;
  slot_date: string;
  slot_time: string;
  scheduled_at: string;
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

type MeetingRequest = Record<string, unknown>;

type TierConfig = {
  tier: string;
  can_one_on_one_to_basic: boolean;
  can_one_on_one_to_standard: boolean;
  can_one_on_one_to_premium: boolean;
  can_one_on_one_to_vip: boolean;
  extra_charge_one_on_one_to_premium: boolean;
  extra_charge_one_on_one_to_vip: boolean;
};

type StarterTrialInfo = {
  has_trial?: boolean;
  eligible?: boolean;
  has_active_slot?: boolean;
  consumed?: boolean;
  upgrade_required?: boolean;
};

const SEND_REQUEST_COST_BY_TIER: Record<string, number> = {
  basic: 6,
  standard: 6,
  premium: 10,
  vip: 0,
};

function canUseFreeStarterRequest(starterTrial: StarterTrialInfo | null | undefined) {
  return Boolean(
    starterTrial?.eligible &&
      !starterTrial?.consumed &&
      !starterTrial?.has_active_slot
  );
}

function getStarterTrialBlockedMessage(
  starterTrial: StarterTrialInfo | null | undefined
) {
  if (starterTrial?.has_active_slot) {
    return "Your free starter access is already tied to an active calendar slot. Remove that slot first or subscribe to request a meeting.";
  }

  if (starterTrial?.upgrade_required || starterTrial?.consumed) {
    return "Your free starter access has already been used. Subscribe to request more meetings.";
  }

  return "Subscribe to a plan to request video meetings.";
}

function getMeetingRequestErrorText(
  status: number,
  payload?: { error?: string; message?: string; code?: string }
) {
  const raw = (payload?.message || payload?.error || "").trim();
  const normalized = raw.toLowerCase();

  if (!raw || normalized === "internal server error") {
    if (status === 409) {
      return "That time is no longer available. Please pick another slot.";
    }

    if (status === 402) {
      return "You do not have enough credits to request this meeting.";
    }

    if (status >= 500) {
      return "We couldn't complete this meeting request right now. Please refresh and try again.";
    }

    return "Failed to request meeting. Please try again.";
  }

  return raw;
}

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
  onSuccess?: (meeting: MeetingRequest) => void;
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
  const router = useRouter();
  const { toast } = useToast();
  const viewerTimeZone = getSafeTimeZone(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  // Available slots from target user
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [hostTimeZone, setHostTimeZone] = useState("UTC");
  // Loading states
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Selected slot
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  // User's credits
  const [credits, setCredits] = useState<{ available: number; required: number } | null>(null);
  // Error/success messages
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [meetingType, setMeetingType] = useState<"group" | "one_on_one">("one_on_one");
  const [requesterPlanLabel, setRequesterPlanLabel] = useState("Basic");
  // Tier permission check result
  const [tierPermission, setTierPermission] = useState<{
    allowed: boolean;
    message: string;
    extra_charge: boolean;
  } | null>(null);
  const [starterTrial, setStarterTrial] = useState<StarterTrialInfo | null>(null);
  const [requesterOfflineForMeetings, setRequesterOfflineForMeetings] = useState(false);
  const [targetUnavailableForMeetings, setTargetUnavailableForMeetings] = useState(false);
  const [enablingProfile, setEnablingProfile] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  const toastRef = useRef(toast);
  const routerRef = useRef(router);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const handleClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    onCloseRef.current();
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, [handleClose]);

  /**
   * Fetch target user's availability and check permissions
   */
  useEffect(() => {
    if (!isOpen) return;
    let isActive = true;

    const fetchData = async () => {
      if (!isActive) return;
      setLoadingSlots(true);
      setMessage(null);
      setSelectedSlot(null);
      setSlots([]);
      setHostTimeZone("UTC");
      setCredits(null);
      setTierPermission(null);
      setRequesterPlanLabel("Basic");
      setStarterTrial(null);
      setRequesterOfflineForMeetings(false);
      setTargetUnavailableForMeetings(false);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!isActive) return;
        if (!user) {
          setMessage({ type: "error", text: "Please log in to request meetings." });
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isActive) return;

        // Get current user's account, membership and credits
        const [{ data: accountData }, { data: membershipData }, { data: creditsData }] =
          await Promise.all([
            supabase
              .from("accounts")
              .select("tier, profile_visible, calendar_enabled")
              .eq("id", user.id)
              .single(),
            supabase
              .from("memberships")
              .select("tier, status, expires_at")
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("credits")
              .select("total, used, rollover")
              .eq("user_id", user.id)
              .single(),
          ]);
        if (!isActive) return;

        const hasActiveMembership =
          Boolean(membershipData) &&
          membershipData?.status === "active" &&
          (!membershipData?.expires_at ||
            new Date(membershipData.expires_at) > new Date());
        let starterTrialData: StarterTrialInfo | null = null;
        let canUseStarterRequest = false;

        if (!hasActiveMembership) {
          const starterTrialRes = await fetch("/api/calendar", {
            headers: {
              Authorization: `Bearer ${session?.access_token || ""}`,
            },
          });
          if (!isActive) return;

          const starterTrialPayload = await starterTrialRes
            .json()
            .catch(() => ({}));
          starterTrialData = (starterTrialPayload?.starter_trial ||
            null) as StarterTrialInfo | null;
          setStarterTrial(starterTrialData);

          if (!starterTrialRes.ok) {
            setMessage({
              type: "error",
              text:
                starterTrialPayload?.message ||
                "We couldn't verify your starter access right now. Please refresh and try again.",
            });
            return;
          }

          canUseStarterRequest = canUseFreeStarterRequest(starterTrialData);

          if (!canUseStarterRequest) {
            onCloseRef.current();
            toastRef.current.info(getStarterTrialBlockedMessage(starterTrialData));
            routerRef.current.push(
              starterTrialData?.has_active_slot
                ? "/dashboard/calendar"
                : "/dashboard/profile/subscription?source=request_meeting"
            );
            return;
          }
        }

        const requesterTier = (
          membershipData?.tier ||
          accountData?.tier ||
          "basic"
        ).toLowerCase();
        const nextRequesterPlanLabel =
          requesterTier === "basic" && Boolean(starterTrialData?.has_trial)
            ? "Free plan"
            : requesterTier.charAt(0).toUpperCase() + requesterTier.slice(1);
        setRequesterPlanLabel(nextRequesterPlanLabel);
        setRequesterOfflineForMeetings(
          accountData?.profile_visible === false ||
          accountData?.calendar_enabled === false
        );

        // Get tier config to check permissions
        const requestMeetingType: "group" | "one_on_one" =
          requesterTier === "basic" ? "group" : "one_on_one";
        setMeetingType(requestMeetingType);

        const { data: tierConfig } = await supabase
          .from("account_tier_config")
          .select("*")
          .eq("tier", requesterTier)
          .single();
        if (!isActive) return;

        if (tierConfig) {
          // Check if can contact target tier
          const permission = checkTierPermission(
            tierConfig,
            targetUser.tier,
            requestMeetingType,
            nextRequesterPlanLabel
          );
          setTierPermission(permission);

          // Calculate required credits
          const baseCredits =
            SEND_REQUEST_COST_BY_TIER[requesterTier] ||
            SEND_REQUEST_COST_BY_TIER.basic;
          const requiredCredits = canUseStarterRequest
            ? 0
            : baseCredits + (permission.extra_charge ? 2 : 0);
          const availableCredits = creditsData
            ? (creditsData.total || 0) - (creditsData.used || 0) + (creditsData.rollover || 0)
            : 0;
          setCredits({ available: availableCredits, required: requiredCredits });

          // Do not fetch availability when this request is not permitted for the current tier.
          if (!permission.allowed) {
            setSlots([]);
            return;
          }
        } else {
          setMessage({ type: "error", text: "Unable to load plan permissions." });
          return;
        }

        const availabilityRes = await fetch(
          `/api/meetings/availability?target_user_id=${encodeURIComponent(targetUser.id)}`,
          {
            headers: {
              Authorization: `Bearer ${session?.access_token || ""}`,
            },
          }
        );
        if (!isActive) return;

        if (!availabilityRes.ok) {
          const errorData = await availabilityRes.json().catch(() => ({}));
          console.error("Error fetching slots:", errorData);
          setTargetUnavailableForMeetings(
            errorData?.code === "target_unavailable"
          );
          setMessage({
            type: "error",
            text:
              errorData?.error ||
              errorData?.message ||
              "Failed to load availability.",
          });
        } else {
          const availabilityData = await availabilityRes.json();
          setHostTimeZone(getSafeTimeZone(availabilityData.host_timezone));
          setSlots(availabilityData.slots || []);
        }
      } catch (error) {
        if (!isActive) return;
        console.error("Error fetching data:", error);
        setMessage({ type: "error", text: "An error occurred. Please try again." });
      } finally {
        if (isActive) {
          setLoadingSlots(false);
        }
      }
    };

    fetchData();
    return () => {
      isActive = false;
    };
  }, [isOpen, targetUser.id, targetUser.tier]);

  /**
   * Check tier permissions
   */
  function checkTierPermission(
    config: TierConfig,
    targetTier: string,
    requestType: "group" | "one_on_one",
    currentRequesterPlanLabel = "Basic"
  ) {
    const requesterTier = (config.tier || "basic").toLowerCase();
    const normalizedTargetTier = (targetTier || "basic").toLowerCase();

    if (requesterTier === "vip") {
      return { allowed: true, message: "", extra_charge: false };
    }
    if (requesterTier === "basic") {
      if (normalizedTargetTier !== "basic") {
        return {
          allowed: false,
          message: `${currentRequesterPlanLabel} accounts can only request meetings with Basic users.`,
          extra_charge: false,
        };
      }
      return { allowed: true, message: "", extra_charge: false };
    }
    if (
      requesterTier === "standard" &&
      requestType === "one_on_one" &&
      !["basic", "standard"].includes(normalizedTargetTier)
    ) {
      return {
        allowed: false,
        message:
          "Standard accounts can only request private meetings with Basic or Standard users.",
        extra_charge: false,
      };
    }
    if (
      requesterTier === "premium" &&
      requestType === "one_on_one" &&
      normalizedTargetTier === "vip"
    ) {
      return {
        allowed: false,
        message:
          "Premium accounts can only request private meetings with Basic, Standard, or Premium users.",
        extra_charge: false,
      };
    }
    if (requestType === "group") {
      return { allowed: true, message: "", extra_charge: false };
    }

    switch (normalizedTargetTier) {
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
          message: config.can_one_on_one_to_vip ? "" : "Only VIP users can request meetings with VIP members.",
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
    return slots.filter(
      (slot) =>
        getDateKeyInTimeZone(slot.scheduled_at, viewerTimeZone) === dateStr
    );
  };

  /**
   * Get unique dates that have slots
   */
  const datesWithSlots = [
    ...new Set(
      slots.map((slot) => getDateKeyInTimeZone(slot.scheduled_at, viewerTimeZone))
    ),
  ];

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

    if (!canUseFreeStarterRequest(starterTrial) && credits && credits.available < credits.required) {
      setMessage({
        type: "error",
        text: `Insufficient credits. You need ${credits.required} credit(s).`,
      });
      return;
    }

    if (requesterOfflineForMeetings) {
      setMessage({
        type: "error",
        text: "Turn your profile back on to request this meeting.",
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
          slot_id: selectedSlot.id,
          slot_date: selectedSlot.slot_date,
          slot_time: selectedSlot.slot_time,
          type: meetingType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (
          data?.code === "starter_trial_slot_in_use" ||
          data?.error === "starter_trial_slot_in_use"
        ) {
          handleClose();
          toast.info(
            data?.message ||
              "Your free starter access is already tied to an active calendar slot."
          );
          router.push("/dashboard/calendar");
          return;
        }
        if (data?.code === "subscription_required" || data?.requires_upgrade === true) {
          handleClose();
          toast.info(
            data?.message ||
              "Upgrade your subscription to request video meetings."
          );
          router.push("/dashboard/profile/subscription?source=request_meeting");
          return;
        }
        if (data?.code === "profile_unavailable") {
          setRequesterOfflineForMeetings(true);
        }
        if (data?.code === "target_unavailable") {
          setTargetUnavailableForMeetings(true);
        }
        setMessage({
          type: "error",
          text: getMeetingRequestErrorText(response.status, data),
        });
        return;
      }

      setMessage({
        type: "success",
        text: data?.starter_trial_consumed
          ? "Your free video meeting request has been sent. Subscribe after this meeting for more requests or availability."
          : "Meeting request sent!",
      });
      
      // Update credits display
      if (credits && credits.required > 0) {
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
      closeTimerRef.current = setTimeout(() => {
        handleClose();
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
    return getDateLabelInTimeZone(`${dateStr}T12:00:00Z`, viewerTimeZone);
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

  const hasInsufficientCredits = Boolean(
    !canUseFreeStarterRequest(starterTrial) &&
      credits &&
      credits.available < credits.required
  );
  const isFreePlanRequester = requesterPlanLabel === "Free plan";

  const handleBuyCredits = () => {
    handleClose();
    router.push("/dashboard/wallet?open=credits");
  };

  const handleEnableProfile = async () => {
    if (enablingProfile) return;

    setEnablingProfile(true);
    setMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage({
          type: "error",
          text: "Please log in to update your profile visibility.",
        });
        return;
      }

      const response = await fetch("/api/profile/visibility", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ calendar_enabled: true }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage({
          type: "error",
          text:
            data?.error ||
            "We couldn't turn your profile on right now. Please try again.",
        });
        return;
      }

      setRequesterOfflineForMeetings(false);
      setMessage({
        type: "success",
        text: "Your profile is now online for meeting requests.",
      });
      toast.success("Profile enabled for meeting requests.");
    } catch (error) {
      console.error("Error enabling profile visibility:", error);
      setMessage({
        type: "error",
        text: "We couldn't turn your profile on right now. Please try again.",
      });
    } finally {
      setEnablingProfile(false);
    }
  };

  const handleUpgradeSubscription = () => {
    handleClose();
    router.push("/dashboard/profile/subscription?source=request_meeting");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-2 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[96dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white p-4">
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
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Target User Info */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
              {targetUser.profile_photo_url ? (
                <Image
                  src={targetUser.profile_photo_url}
                  alt={targetUser.first_name || "User"}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                  unoptimized
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
                  {isFreePlanRequester
                    ? "You're on the free plan, which currently gives you Basic access only. Upgrade your subscription to contact this user."
                    : "Upgrade your subscription to contact this user."}
                </p>
                <button
                  type="button"
                  onClick={handleUpgradeSubscription}
                  className="mt-3 inline-flex items-center rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                >
                  Upgrade subscription
                </button>
              </div>
            </div>
          )}

          {/* Credits Info */}
          {credits && tierPermission?.allowed && (
            <div className="rounded-xl border border-[#1f419a]/20 bg-gradient-to-r from-[#1f419a]/10 to-[#2a44a3]/10 p-3">
              {canUseFreeStarterRequest(starterTrial) ? (
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-semibold text-[#1f419a]">
                      Free starter request available
                    </p>
                    <p className="text-sm text-gray-700">
                      This one video meeting request will not charge credits. After it is sent, subscribe for more requests or availability.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2">
                    <CreditCard className="h-5 w-5 text-[#1f419a]" />
                    <span className="text-sm text-gray-700">
                      Cost: <span className="font-bold text-[#1f419a]">{credits.required} credit(s)</span>
                      <span className="ml-1 text-xs text-gray-500">
                        ({meetingType === "group" ? "Group" : "Private"} request)
                      </span>
                      {tierPermission.extra_charge && (
                        <span className="ml-1 text-xs text-amber-600">(includes VIP fee)</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <span className={`text-sm font-semibold ${credits.available >= credits.required ? "text-green-600" : "text-red-600"}`}>
                      You have: {credits.available}
                    </span>
                    <button
                      type="button"
                      onClick={handleBuyCredits}
                      className="inline-flex items-center rounded-full border border-[#1f419a]/30 bg-white px-3 py-1 text-xs font-semibold text-[#1f419a] transition-colors hover:bg-[#eef2ff]"
                    >
                      Buy credits
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {hasInsufficientCredits && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-red-800">Not enough credits to request this meeting.</p>
                  <p className="mt-1 text-xs text-red-700">
                    Top up credits to continue instantly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleBuyCredits}
                  className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Buy now
                </button>
              </div>
            </div>
          )}

          {requesterOfflineForMeetings && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Your profile is offline for meeting requests.
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    Turn it back on here to continue without leaving this screen.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleEnableProfile}
                  disabled={enablingProfile}
                  className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {enablingProfile ? "Turning on..." : "Turn profile on"}
                </button>
              </div>
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
          {!tierPermission?.allowed && tierPermission ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Meeting availability is hidden until your subscription allows this request.
            </div>
          ) : loadingSlots ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#1f419a]" />
              <span className="ml-2 text-gray-500">Loading availability...</span>
            </div>
          ) : targetUnavailableForMeetings ? (
            <div className="text-center py-8">
              <AlertCircle className="mx-auto mb-3 h-12 w-12 text-red-200" />
              <p className="text-gray-600 font-medium">Bookings unavailable</p>
              <p className="text-sm text-gray-400">
                This user has temporarily turned off new meeting requests.
              </p>
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">No available slots</p>
              <p className="text-sm text-gray-400">
              This user hasn&apos;t set any availability yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="font-medium text-gray-900 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#1f419a]" />
                  Available Times
                </h4>
                <p className="text-[11px] leading-relaxed text-gray-500 sm:text-xs">
                  Your time zone is {viewerTimeZone}, while {targetUser.first_name || "the other user"} is {hostTimeZone}, both automatically aligned to each user&apos;s local country time.
                </p>
              </div>

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
                          {getTimeLabelInTimeZone(
                            slot.scheduled_at,
                            viewerTimeZone
                          )}
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
        <div className="sticky bottom-0 border-t border-gray-100 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button
            onClick={handleClose}
            className="flex-1 rounded-xl border border-gray-300 py-3 text-gray-700 font-medium transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={(
              !selectedSlot ||
              submitting ||
              !tierPermission?.allowed ||
              hasInsufficientCredits ||
              requesterOfflineForMeetings ||
              enablingProfile
            ) as boolean}






            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1f419a] to-[#2a44a3] py-3 text-white font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  );
}
