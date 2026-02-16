"use client";

/**
 * ReportUserModal — User-facing modal for reporting another user
 *
 * Features:
 * - Predefined report reasons with icons
 * - Optional description text
 * - Duplicate report prevention
 * - Success/error feedback
 * - Accessible (escape to close, focus trap)
 *
 * Usage:
 *   <ReportUserModal
 *     isOpen={showReport}
 *     onClose={() => setShowReport(false)}
 *     reportedUserId="uuid"
 *     reportedUserName="John"
 *   />
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  X,
  Flag,
  AlertTriangle,
  ShieldAlert,
  UserX,
  Bug,
  MessageSquareWarning,
  Baby,
  Fingerprint,
  Megaphone,
  MoreHorizontal,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

type ReportReason = {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
};

type ReportUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  reportedUserId: string;
  reportedUserName?: string;
};

// ---------------------------------------------------------------
// Report Reasons
// ---------------------------------------------------------------

const REPORT_REASONS: ReportReason[] = [
  {
    value: "fake_profile",
    label: "Fake Profile",
    description: "This profile appears to be fake or uses stolen photos",
    icon: <UserX className="h-5 w-5" />,
  },
  {
    value: "harassment",
    label: "Harassment",
    description: "This user is harassing, bullying, or intimidating others",
    icon: <ShieldAlert className="h-5 w-5" />,
  },
  {
    value: "inappropriate_content",
    label: "Inappropriate Content",
    description: "Profile contains offensive or inappropriate material",
    icon: <Bug className="h-5 w-5" />,
  },
  {
    value: "scam",
    label: "Scam / Fraud",
    description: "This user is attempting to scam or defraud others",
    icon: <AlertTriangle className="h-5 w-5" />,
  },
  {
    value: "spam",
    label: "Spam",
    description: "This user is sending repetitive or promotional messages",
    icon: <Megaphone className="h-5 w-5" />,
  },
  {
    value: "underage",
    label: "Underage User",
    description: "This person appears to be under the minimum age",
    icon: <Baby className="h-5 w-5" />,
  },
  {
    value: "impersonation",
    label: "Impersonation",
    description: "This user is pretending to be someone else",
    icon: <Fingerprint className="h-5 w-5" />,
  },
  {
    value: "threats",
    label: "Threats / Violence",
    description: "This user has made threats or promoted violence",
    icon: <MessageSquareWarning className="h-5 w-5" />,
  },
  {
    value: "other",
    label: "Other",
    description: "Another reason not listed above",
    icon: <MoreHorizontal className="h-5 w-5" />,
  },
];

// ---------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------

export default function ReportUserModal({
  isOpen,
  onClose,
  reportedUserId,
  reportedUserName,
}: ReportUserModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error" | "duplicate">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedReason(null);
      setDescription("");
      setStatus("idle");
      setErrorMsg("");
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  /**
   * Submit the report
   */
  const handleSubmit = useCallback(async () => {
    if (!selectedReason || submitting) return;

    setSubmitting(true);
    setErrorMsg("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setStatus("error");
        setErrorMsg("Please log in to submit a report");
        return;
      }

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          reported_user_id: reportedUserId,
          reason: selectedReason,
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
      } else if (res.status === 409) {
        setStatus("duplicate");
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Failed to submit report");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedReason, description, reportedUserId, submitting]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-2xl max-w-md w-full overflow-hidden max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-bold text-gray-900">Report User</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Success State */}
          {status === "success" && (
            <div className="text-center py-8">
              <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Report Submitted
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Thank you for helping keep our community safe. Our team will
                review this report within 24–48 hours.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-[#1f419a] text-white font-medium hover:bg-[#17357b] transition"
              >
                Done
              </button>
            </div>
          )}

          {/* Duplicate State */}
          {status === "duplicate" && (
            <div className="text-center py-8">
              <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Already Reported
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                You&apos;ve already submitted a report for this user recently.
                Our team is reviewing it.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-medium hover:bg-gray-300 transition"
              >
                Close
              </button>
            </div>
          )}

          {/* Error State */}
          {status === "error" && (
            <div className="text-center py-8">
              <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Submission Failed
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                {errorMsg || "Something went wrong. Please try again."}
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="px-6 py-2.5 rounded-xl bg-[#1f419a] text-white font-medium hover:bg-[#17357b] transition"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Form State */}
          {status === "idle" && (
            <>
              {reportedUserName && (
                <p className="text-sm text-gray-600 mb-4">
                  Why are you reporting{" "}
                  <span className="font-semibold text-gray-900">
                    {reportedUserName}
                  </span>
                  ?
                </p>
              )}

              {/* Reason Selection */}
              <div className="space-y-2 mb-4">
                {REPORT_REASONS.map((reason) => (
                  <button
                    key={reason.value}
                    type="button"
                    onClick={() => setSelectedReason(reason.value)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition ${
                      selectedReason === reason.value
                        ? "border-red-300 bg-red-50 ring-1 ring-red-200"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className={`flex-shrink-0 mt-0.5 ${
                        selectedReason === reason.value
                          ? "text-red-600"
                          : "text-gray-400"
                      }`}
                    >
                      {reason.icon}
                    </span>
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          selectedReason === reason.value
                            ? "text-red-900"
                            : "text-gray-900"
                        }`}
                      >
                        {reason.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {reason.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Description (shown after selecting reason) */}
              {selectedReason && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Details{" "}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide any additional context that could help our team review this report..."
                    maxLength={500}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-red-300 focus:ring-1 focus:ring-red-200 outline-none resize-none h-24 text-sm"
                  />
                  <p className="text-xs text-gray-400 text-right mt-1">
                    {description.length}/500
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer (only show in form state) */}
        {status === "idle" && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedReason || submitting}
              className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Flag className="h-4 w-4" />
              )}
              Submit Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
