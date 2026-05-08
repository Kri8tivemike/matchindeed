"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, FileSignature, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type AgreementState = {
  id: string;
  agreement_text: string;
  status: string;
  user_signed: boolean;
  partner_signed: boolean;
  fully_signed: boolean;
  signed_at: string | null;
};

type SignatureModalProps = {
  isOpen: boolean;
  meetingId: string;
  partnerName: string;
  onClose: () => void;
  onSigned?: (params: {
    fullySigned: boolean;
    messagingEnabled: boolean;
    migrationPending: boolean;
  }) => void;
};

export default function SignatureModal({
  isOpen,
  meetingId,
  partnerName,
  onClose,
  onSigned,
}: SignatureModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [agreement, setAgreement] = useState<AgreementState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);

  const isReadyToSubmit = useMemo(() => {
    if (!agreement) return false;
    if (agreement.fully_signed) return false;
    if (agreement.user_signed) return false;
    return true;
  }, [agreement]);

  const loadAgreement = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLastActionMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Please log in again to sign this agreement.");
        return;
      }

      const response = await fetch(
        `/api/agreements?meeting_id=${encodeURIComponent(meetingId)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to load agreement.");
      }

      setAgreement(payload.agreement || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load agreement.");
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    if (!isOpen) return;
    void loadAgreement();
  }, [isOpen, loadAgreement]);

  const handleSignAgreement = async () => {
    if (!isReadyToSubmit) return;
    setSubmitting(true);
    setError(null);
    setLastActionMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Please log in again to sign this agreement.");
        return;
      }

      const response = await fetch("/api/agreements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meeting_id: meetingId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to sign agreement.");
      }

      setAgreement(payload.agreement || null);

      const fullySigned = !!payload.both_signed;
      const messagingEnabled = !!payload.messaging_enabled;
      const migrationPending = !!payload.migration_pending;

      if (fullySigned) {
        setLastActionMessage(
          "Agreement fully signed. Messaging is now enabled and both profiles are offline."
        );
      } else {
        setLastActionMessage(
          `Your signature is saved. Waiting for ${partnerName} to sign.`
        );
      }

      onSigned?.({
        fullySigned,
        messagingEnabled,
        migrationPending,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign agreement.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 p-6">
          <div className="flex items-center gap-3">
            <FileSignature className="h-6 w-6 text-[#1f419a]" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Relationship Agreement
              </h2>
              <p className="text-sm text-gray-600">
                Sign this to unlock messaging with {partnerName}.
              </p>
            </div>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading agreement...
            </div>
          ) : agreement ? (
            <>
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-700">
                  {agreement.agreement_text}
                </pre>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  Your signature:{" "}
                  <strong>{agreement.user_signed ? "Completed" : "Pending"}</strong>
                </p>
                <p>
                  Partner signature:{" "}
                  <strong>
                    {agreement.partner_signed ? "Completed" : "Pending"}
                  </strong>
                </p>
                {agreement.fully_signed && agreement.signed_at ? (
                  <p>
                    Fully signed on{" "}
                    <strong>
                      {new Date(agreement.signed_at).toLocaleString("en-US")}
                    </strong>
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              Agreement is not ready yet. Please try again in a moment.
            </p>
          )}

          {error ? (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {lastActionMessage ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4" />
              <p>{lastActionMessage}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 p-6">
          {isReadyToSubmit ? (
            <button
              type="button"
              onClick={handleSignAgreement}
              disabled={submitting}
              className="rounded-xl bg-[#1f419a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Signing..." : "Sign Agreement"}
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
