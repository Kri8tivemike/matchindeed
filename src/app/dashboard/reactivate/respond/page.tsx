"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

type ReactivationResponsePayload = {
  request_id: string;
  status: string;
  reason_code: number | null;
  reason_text: string | null;
  created_at: string;
  expires_at: string;
  requester: {
    id: string;
    email: string | null;
    display_name: string | null;
  } | null;
  can_respond: boolean;
  expired: boolean;
};

export default function ReactivationRespondPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestId = searchParams.get("request_id");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [requestData, setRequestData] =
    useState<ReactivationResponsePayload | null>(null);
  const [responseType, setResponseType] = useState<"allow" | "object">("allow");
  const [reasonText, setReasonText] = useState("");

  const requesterName = useMemo(() => {
    if (!requestData?.requester) return "Your previous match";
    return (
      requestData.requester.display_name ||
      requestData.requester.email ||
      "Your previous match"
    );
  }, [requestData]);

  useEffect(() => {
    const loadRequest = async () => {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push("/login");
          return;
        }

        if (!requestId) {
          setError("Missing request_id in the URL.");
          return;
        }

        const response = await fetch(
          `/api/profile/reactivate/respond?request_id=${encodeURIComponent(
            requestId
          )}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load request details.");
        }

        setRequestData(payload as ReactivationResponsePayload);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load request.");
      } finally {
        setLoading(false);
      }
    };

    void loadRequest();
  }, [requestId, router]);

  const submitResponse = async () => {
    if (!requestData?.request_id) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const response = await fetch("/api/profile/reactivate/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          request_id: requestData.request_id,
          response: responseType,
          reason_text: reasonText.trim() || undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to submit response.");
      }

      setSuccess("Your response has been submitted. MatchIndeed admin will review it.");
      setRequestData((prev) =>
        prev
          ? {
              ...prev,
              status: "partner_responded",
              can_respond: false,
            }
          : prev
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit response.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading request...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Reactivation Response</h1>
        <p className="mt-2 text-sm text-gray-600">
          {requesterName} asked to reactivate your match connection.
        </p>

        {requestData ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Reason:</span>{" "}
                {requestData.reason_text || "No reason provided"}
              </p>
              <p className="mt-2 text-sm text-gray-700">
                <span className="font-semibold">Deadline:</span>{" "}
                {new Date(requestData.expires_at).toLocaleString("en-US")}
              </p>
              <p className="mt-2 text-sm text-gray-700">
                <span className="font-semibold">Status:</span>{" "}
                {requestData.status.replaceAll("_", " ")}
              </p>
            </div>

            {requestData.can_respond ? (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Your response
                  </label>
                  <select
                    value={responseType}
                    onChange={(event) =>
                      setResponseType(event.target.value as "allow" | "object")
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="allow">Allow reactivation</option>
                    <option value="object">Object to reactivation</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Optional note
                  </label>
                  <textarea
                    value={reasonText}
                    onChange={(event) => setReasonText(event.target.value)}
                    className="h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Optional context for admin review..."
                  />
                </div>

                <button
                  type="button"
                  onClick={submitResponse}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1f419a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Response"
                  )}
                </button>
              </>
            ) : (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                This request is no longer open for partner response.
              </div>
            )}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <p>{error}</p>
          </div>
        ) : null}

        {success ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            <p>{success}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
