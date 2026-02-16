"use client";

import { useState } from "react";
import {
  AlertTriangle,
  X,
  Loader2,
  CreditCard,
  Ban,
} from "lucide-react";

/**
 * Props for the CancellationConfirmModal component
 */
type CancellationConfirmModalProps = {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Meeting ID to cancel */
  meetingId: string;
  /** Whether the meeting has been confirmed/approved */
  isConfirmed: boolean;
  /** Cancellation fee in cents */
  cancellationFeeCents: number;
  /** Whether credit will be refunded */
  creditRefunded: boolean;
  /** Callback on successful cancellation */
  onCanceled: (result: {
    cancellation_fee_applied: boolean;
    credit_refunded: boolean;
  }) => void;
};

/**
 * CancellationConfirmModal - Shows cancellation fee warning and requires
 * explicit user confirmation before proceeding with cancellation.
 *
 * Per client requirements:
 * - Cancellation fee notice must be visible before cancellation
 * - Whoever cancels is responsible for charges
 * - No credit refund for confirmed (admin-approved) meetings
 */
export default function CancellationConfirmModal({
  isOpen,
  onClose,
  meetingId,
  isConfirmed,
  cancellationFeeCents,
  creditRefunded,
  onCanceled,
}: CancellationConfirmModalProps) {
  // Cancellation reason
  const [reason, setReason] = useState("");
  // Processing state
  const [submitting, setSubmitting] = useState(false);
  // Error message
  const [error, setError] = useState<string | null>(null);

  /**
   * Format currency amount from cents for display
   */
  const formatFee = (cents: number): string => {
    return (cents / 100).toFixed(2);
  };

  /**
   * Submit the cancellation with confirmation
   */
  const handleConfirmCancel = async () => {
    setSubmitting(true);
    setError(null);

    try {
      // Dynamic import to avoid SSR issues
      const { supabase } = await import("@/lib/supabase");
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch("/api/meetings/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          meeting_id: meetingId,
          reason: reason || undefined,
          confirmed: true, // User has explicitly confirmed after seeing fees
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || data.message || "Failed to cancel meeting.");
        return;
      }

      // Success — notify parent
      onCanceled({
        cancellation_fee_applied: data.cancellation_fee_applied,
        credit_refunded: data.credit_refunded,
      });
    } catch (err) {
      console.error("Error canceling meeting:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-red-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-bold text-red-900">Cancel Meeting</h3>
              <p className="text-sm text-red-600">This action cannot be undone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg hover:bg-red-100 transition-colors"
          >
            <X className="h-5 w-5 text-red-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Fee Warning — Primary notice */}
          <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300">
            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-bold text-amber-900">
                  Cancellation Charges Apply
                </p>

                {cancellationFeeCents > 0 && (
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white border border-amber-200">
                    <span className="text-sm text-gray-700">Cancellation fee:</span>
                    <span className="text-sm font-bold text-red-600">
                      {formatFee(cancellationFeeCents)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-white border border-amber-200">
                  <span className="text-sm text-gray-700">Credit refund:</span>
                  <span className={`text-sm font-bold ${creditRefunded ? "text-green-600" : "text-red-600"}`}>
                    {creditRefunded ? "Yes" : "No refund"}
                  </span>
                </div>

                <p className="text-xs text-amber-800">
                  {isConfirmed
                    ? "This meeting has been confirmed. As the cancelling party, you will be charged the cancellation fee and no credits will be refunded."
                    : "By cancelling, you agree to the charges above. The cancellation fee will be deducted from your wallet."}
                </p>
              </div>
            </div>
          </div>

          {/* Policy reminder */}
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex items-start gap-2">
              <Ban className="h-4 w-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-600">
                <strong>Reminder:</strong> Per MatchIndeed policy, whoever cancels a meeting is responsible
                for all charges. If you believe there are extenuating circumstances, contact support after
                cancellation for review.
              </p>
            </div>
          </div>

          {/* Reason (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for cancellation (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you cancelling this meeting?"
              rows={3}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Keep Meeting
          </button>
          <button
            onClick={handleConfirmCancel}
            disabled={submitting}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4" />
                Confirm Cancel
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
