"use client";

import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type MatchOutcome = "both_yes" | "both_no" | "mismatch" | null;

type MatchConfirmationModalProps = {
  isOpen: boolean;
  outcome: MatchOutcome;
  partnerName: string;
  showSignAgreementAction?: boolean;
  onSignAgreement?: () => void;
  onClose: () => void;
};

export default function MatchConfirmationModal({
  isOpen,
  outcome,
  partnerName,
  showSignAgreementAction = false,
  onSignAgreement,
  onClose,
}: MatchConfirmationModalProps) {
  if (!isOpen) {
    return null;
  }

  const isBothYes = outcome === "both_yes";
  const isBothNo = outcome === "both_no";

  const title = isBothYes
    ? "Mutual YES Confirmed"
    : isBothNo
      ? "Both Responses: No"
      : "Responses Did Not Match";

  const message = isBothYes
    ? `You and ${partnerName} selected YES. Sign your relationship agreement to enable messaging.`
    : isBothNo
      ? `You and ${partnerName} both selected NO. No match was created and profiles remain active.`
      : `You and ${partnerName} submitted different answers. No match was created and profiles remain active.`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 p-6">
          <div className="flex items-start gap-3">
            {isBothYes ? (
              <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" />
            ) : isBothNo ? (
              <XCircle className="mt-0.5 h-6 w-6 text-gray-500" />
            ) : (
              <AlertTriangle className="mt-0.5 h-6 w-6 text-amber-600" />
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 p-6">
          {isBothYes && showSignAgreementAction && onSignAgreement ? (
            <button
              type="button"
              onClick={onSignAgreement}
              className="rounded-xl bg-[#1f419a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Sign Agreement
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
