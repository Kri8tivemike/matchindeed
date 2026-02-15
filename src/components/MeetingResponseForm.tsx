"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Calendar,
  Clock,
  FileSignature,
  Heart,
  HeartOff,
  ShieldCheck,
} from "lucide-react";

/**
 * Props for MeetingResponseForm
 */
type MeetingResponseFormProps = {
  /** The meeting ID */
  meetingId: string;
  /** Partner's full name */
  partnerName: string;
  /** The meeting date string (ISO) */
  meetingDate?: string;
  /** Callback on successful submission */
  onSuccess?: () => void;
};

/**
 * MeetingResponseForm - Formal Yes/No agreement form after a video dating meeting.
 *
 * Per client requirements:
 * - Shows formal agreement text: "I, [Your Full Name], solemnly agree to [Partner's Full Name]
 *   in his/her request for a relationship after our video dating meeting."
 * - Date and time auto-populate
 * - User selects YES or NO
 * - Both parties receive a copy via dashboard and email
 * - If both say YES → messaging is enabled between them
 * - If either says NO → profiles stay active, form saved to dashboard + admin
 * - Admin keeps one copy
 */
export default function MeetingResponseForm({
  meetingId,
  partnerName,
  meetingDate,
  onSuccess,
}: MeetingResponseFormProps) {
  // User's selected response
  const [response, setResponse] = useState<"yes" | "no" | null>(null);
  // User's full name (auto-filled from profile)
  const [userFullName, setUserFullName] = useState<string>("");
  // Loading/submitting states
  const [loadingName, setLoadingName] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Error/success states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // The generated agreement text shown after selection
  const [agreementPreview, setAgreementPreview] = useState<string>("");

  // Current date/time for the form signature
  const now = new Date();
  const formattedDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  /**
   * Fetch user's full name from profile on mount
   */
  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("first_name, last_name")
          .eq("user_id", user.id)
          .single();

        if (profile) {
          const fullName =
            `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
            "User";
          setUserFullName(fullName);
        }
      } catch (err) {
        console.error("Error fetching user name:", err);
      } finally {
        setLoadingName(false);
      }
    };

    fetchUserName();
  }, []);

  /**
   * Update agreement preview when response changes
   */
  useEffect(() => {
    if (!response || !userFullName) {
      setAgreementPreview("");
      return;
    }

    if (response === "yes") {
      setAgreementPreview(
        `I, ${userFullName}, solemnly agree to ${partnerName} in his/her request for a relationship after our video dating meeting. Yes, I accept, and hereby request for further conversation which enables our messaging app for continued communication.`
      );
    } else {
      setAgreementPreview(
        `I, ${userFullName}, solemnly agree to ${partnerName} in his/her request for a relationship after our video dating meeting. NO, I do not accept.`
      );
    }
  }, [response, userFullName, partnerName]);

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!response) {
      setError("Please select Yes or No before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Please log in to submit your response.");
        return;
      }

      const res = await fetch("/api/meetings/response", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          meeting_id: meetingId,
          response,
          partner_name: partnerName,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to submit response");
      }

      setSuccess(true);

      // Redirect after a short delay
      if (onSuccess) {
        setTimeout(() => onSuccess(), 2500);
      }
    } catch (err: any) {
      console.error("Error submitting response:", err);
      setError(err.message || "Failed to submit response. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- SUCCESS STATE ----------
  if (success) {
    return (
      <div className="rounded-2xl bg-white shadow-lg ring-1 ring-black/5 overflow-hidden">
        <div
          className={`p-6 ${
            response === "yes"
              ? "bg-gradient-to-r from-green-50 to-emerald-50"
              : "bg-gradient-to-r from-gray-50 to-slate-50"
          }`}
        >
          <div className="flex items-start gap-4">
            {response === "yes" ? (
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                <Heart className="h-6 w-6 text-green-600" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <HeartOff className="h-6 w-6 text-gray-500" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {response === "yes"
                  ? "Response Submitted — Match Pending!"
                  : "Response Submitted"}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {response === "yes"
                  ? `Your acceptance has been recorded. If ${partnerName} also accepts, messaging will be enabled between you.`
                  : `Your response has been recorded. Your profile will remain active and visible.`}
              </p>
            </div>
          </div>

          {/* Signed Agreement Copy */}
          <div className="mt-6 p-4 bg-white rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <FileSignature className="h-4 w-4 text-gray-500" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Your Signed Agreement
              </span>
            </div>
            <p className="text-sm text-gray-700 italic leading-relaxed">
              &ldquo;{agreementPreview}&rdquo;
            </p>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
              <span>Signed: {formattedDate} at {formattedTime}</span>
              <span>Copy saved to your dashboard</span>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-500">
            A copy has been sent to your dashboard, to {partnerName}, and to the
            MatchIndeed admin for records. Redirecting...
          </p>
        </div>
      </div>
    );
  }

  // ---------- MAIN FORM ----------
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Agreement Card */}
      <div className="rounded-2xl bg-white shadow-lg ring-1 ring-black/5 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-[#1f419a]/5 to-[#2a44a3]/5 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#1f419a]/10 flex items-center justify-center">
              <FileSignature className="h-5 w-5 text-[#1f419a]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Post-Meeting Agreement
              </h3>
              <p className="text-sm text-gray-500">
                Please review and submit your response
              </p>
            </div>
          </div>

          {/* Meeting date info */}
          {meetingDate && (
            <div className="flex items-center gap-4 mt-4 p-3 rounded-lg bg-white border border-gray-200">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4 text-[#1f419a]" />
                <span>
                  {new Date(meetingDate).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="h-4 w-4 text-[#1f419a]" />
                <span>
                  {new Date(meetingDate).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Agreement Statement */}
        <div className="p-6">
          <div className="p-5 rounded-xl bg-blue-50 border border-blue-200 mb-6">
            <p className="text-sm font-medium text-blue-900 mb-2">
              Agreement Statement:
            </p>
            {loadingName ? (
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your details...
              </div>
            ) : (
              <p className="text-sm text-blue-800 leading-relaxed">
                &ldquo;I, <strong>{userFullName}</strong>, solemnly agree to{" "}
                <strong>{partnerName}</strong> in his/her request for a
                relationship after our video dating meeting.&rdquo;
              </p>
            )}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* YES / NO Selection */}
          <div className="space-y-3 mb-6">
            <label className="block text-sm font-semibold text-gray-700">
              Your Decision:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Yes Option */}
              <button
                type="button"
                onClick={() => {
                  setResponse("yes");
                  setError(null);
                }}
                className={`
                  p-6 rounded-2xl border-2 transition-all text-left
                  ${
                    response === "yes"
                      ? "border-green-500 bg-green-50 ring-2 ring-green-200"
                      : "border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/50"
                  }
                `}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      response === "yes"
                        ? "bg-green-100"
                        : "bg-gray-100"
                    }`}
                  >
                    <CheckCircle
                      className={`h-6 w-6 ${
                        response === "yes"
                          ? "text-green-600"
                          : "text-gray-400"
                      }`}
                    />
                  </div>
                  <div>
                    <span
                      className={`text-lg font-bold ${
                        response === "yes"
                          ? "text-green-900"
                          : "text-gray-700"
                      }`}
                    >
                      Yes, I Accept
                    </span>
                    <p className="text-sm text-gray-500 mt-1">
                      I agree and would like to continue the relationship.
                      Messaging will be enabled if both parties accept.
                    </p>
                  </div>
                </div>
              </button>

              {/* No Option */}
              <button
                type="button"
                onClick={() => {
                  setResponse("no");
                  setError(null);
                }}
                className={`
                  p-6 rounded-2xl border-2 transition-all text-left
                  ${
                    response === "no"
                      ? "border-red-500 bg-red-50 ring-2 ring-red-200"
                      : "border-gray-200 bg-white hover:border-red-300 hover:bg-red-50/50"
                  }
                `}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      response === "no"
                        ? "bg-red-100"
                        : "bg-gray-100"
                    }`}
                  >
                    <XCircle
                      className={`h-6 w-6 ${
                        response === "no"
                          ? "text-red-600"
                          : "text-gray-400"
                      }`}
                    />
                  </div>
                  <div>
                    <span
                      className={`text-lg font-bold ${
                        response === "no"
                          ? "text-red-900"
                          : "text-gray-700"
                      }`}
                    >
                      No, I Do Not Accept
                    </span>
                    <p className="text-sm text-gray-500 mt-1">
                      I do not wish to continue. My profile will remain active
                      online.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Agreement Preview */}
          {agreementPreview && (
            <div className="mb-6 p-4 rounded-xl bg-gray-50 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Agreement Preview
                </span>
              </div>
              <p className="text-sm text-gray-700 italic leading-relaxed">
                &ldquo;{agreementPreview}&rdquo;
              </p>
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                <span>Date: {formattedDate}</span>
                <span>Time: {formattedTime}</span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!response || submitting || loadingName}
            className={`
              w-full py-4 px-6 rounded-xl font-semibold text-white transition-all
              flex items-center justify-center gap-2
              ${
                response === "yes"
                  ? "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                  : response === "no"
                  ? "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700"
                  : "bg-gray-300 cursor-not-allowed"
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Submitting Your Response...
              </>
            ) : response === "yes" ? (
              <>
                <CheckCircle className="h-5 w-5" />
                Sign &amp; Submit — Yes, I Accept
              </>
            ) : response === "no" ? (
              <>
                <XCircle className="h-5 w-5" />
                Sign &amp; Submit — No, I Do Not Accept
              </>
            ) : (
              "Select Yes or No above"
            )}
          </button>

          {/* Footer notice */}
          <p className="mt-4 text-xs text-gray-400 text-center leading-relaxed">
            By submitting, you confirm this response. A signed copy will be
            saved to your dashboard, sent to {partnerName}&apos;s dashboard,
            emailed to both parties, and kept by MatchIndeed admin for records.
          </p>
        </div>
      </div>
    </form>
  );
}
