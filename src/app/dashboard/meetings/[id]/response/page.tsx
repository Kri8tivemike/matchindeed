"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  AlertCircle,
  Video,
  Calendar,
  Clock,
  CheckCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import MeetingResponseForm from "@/components/MeetingResponseForm";
import SignatureModal from "@/components/agreements/signature-modal";
import MatchConfirmationModal from "@/components/meetings/match-confirmation-modal";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";

type MeetingParticipant = {
  user_id: string;
  role: string;
  user?: {
    id: string;
    email: string;
    display_name: string | null;
    tier: string | null;
  } | null;
};

type MeetingData = {
  id: string;
  status: string;
  scheduled_at: string;
  meeting_participants: MeetingParticipant[] | null;
};

type PartnerData = {
  id: string;
  name: string;
  photo: string | null;
  tier: string;
  role: string;
};

type MeetingResponseData = {
  id?: string;
  response: string;
  agreement_text?: string | null;
  signed_at: string | null;
};

type AgreementData = {
  id: string;
  status: string;
  user_signed: boolean;
  partner_signed: boolean;
  fully_signed: boolean;
  signed_at: string | null;
};

type ResponseSubmitResult = {
  agreement_required?: boolean;
  both_responded?: boolean;
  response_outcome?: "both_yes" | "both_no" | "mismatch" | null;
};

export default function MeetingResponsePage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [partner, setPartner] = useState<PartnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alreadyResponded, setAlreadyResponded] = useState(false);
  const [existingResponseData, setExistingResponseData] =
    useState<MeetingResponseData | null>(null);
  const [partnerResponse, setPartnerResponse] =
    useState<MeetingResponseData | null>(null);
  const [agreementData, setAgreementData] = useState<AgreementData | null>(null);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchOutcome, setMatchOutcome] = useState<
    "both_yes" | "both_no" | "mismatch" | null
  >(null);

  useEffect(() => {
    const fetchMeetingData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        const { data: meetingData, error: meetingError } = await supabase
          .from("meetings")
          .select(
            `
            *,
            meeting_participants (
              user_id,
              role,
              user:accounts!meeting_participants_user_id_fkey(
                id,
                email,
                display_name,
                tier
              )
            )
          `
          )
          .eq("id", meetingId)
          .single();

        if (meetingError || !meetingData) {
          setError("Meeting not found.");
          setLoading(false);
          return;
        }

        if (meetingData.status !== "completed") {
          setError(
            "This meeting has not been completed yet. Responses can only be submitted after the meeting concludes."
          );
          setLoading(false);
          return;
        }

        const participants = (meetingData as MeetingData).meeting_participants || [];
        const myParticipation = participants.find((p) => p.user_id === user.id);
        if (!myParticipation) {
          setError("You are not a participant in this meeting.");
          setLoading(false);
          return;
        }

        const partnerParticipant = participants.find((p) => p.user_id !== user.id);
        if (!partnerParticipant) {
          setError("Partner not found for this meeting.");
          setLoading(false);
          return;
        }

        const { data: partnerProfile } = await supabase
          .from("user_profiles")
          .select("first_name, last_name, profile_photo_url")
          .eq("user_id", partnerParticipant.user_id)
          .single();

        const partnerFullName = partnerProfile
          ? `${partnerProfile.first_name || ""} ${partnerProfile.last_name || ""}`.trim()
          : partnerParticipant.user?.display_name || "Partner";

        setMeeting(meetingData);
        setPartner({
          id: partnerParticipant.user_id,
          name: partnerFullName,
          photo: partnerProfile?.profile_photo_url || null,
          tier: partnerParticipant.user?.tier || "basic",
          role: partnerParticipant.role,
        });

        const { data: existingResponse } = await supabase
          .from("meeting_responses")
          .select("id, response, agreement_text, signed_at")
          .eq("meeting_id", meetingId)
          .eq("user_id", user.id)
          .single();

        if (existingResponse) {
          setAlreadyResponded(true);
          setExistingResponseData(existingResponse);
        }

        const { data: partnerResp } = await supabase
          .from("meeting_responses")
          .select("response, signed_at")
          .eq("meeting_id", meetingId)
          .eq("user_id", partnerParticipant.user_id)
          .single();

        if (partnerResp) {
          setPartnerResponse(partnerResp);
        }

        const bothResponded = !!existingResponse && !!partnerResp;
        const bothYes =
          bothResponded &&
          existingResponse?.response === "yes" &&
          partnerResp?.response === "yes";

        if (bothYes) {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session) {
            const agreementRes = await fetch(
              `/api/agreements?meeting_id=${encodeURIComponent(meetingId)}`,
              {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              }
            );
            if (agreementRes.ok) {
              const payload = await agreementRes.json();
              setAgreementData(payload.agreement || null);
            }
          }
        }
      } catch (err: unknown) {
        console.error("Error fetching meeting:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load meeting details."
        );
      } finally {
        setLoading(false);
      }
    };

    if (meetingId) {
      void fetchMeetingData();
    }
  }, [meetingId, router]);

  const renderModals = () => (
    <>
      <MatchConfirmationModal
        isOpen={showMatchModal}
        outcome={matchOutcome}
        partnerName={partner?.name || "your match"}
        showSignAgreementAction={matchOutcome === "both_yes"}
        onSignAgreement={() => {
          setShowMatchModal(false);
          setShowAgreementModal(true);
        }}
        onClose={() => setShowMatchModal(false)}
      />

      <SignatureModal
        isOpen={showAgreementModal}
        meetingId={meetingId}
        partnerName={partner?.name || "your match"}
        onClose={() => setShowAgreementModal(false)}
        onSigned={(params) => {
          if (params.fullySigned) {
            setAgreementData((prev) =>
              prev
                ? {
                    ...prev,
                    fully_signed: true,
                    user_signed: true,
                    partner_signed: true,
                    status: "signed",
                    signed_at: new Date().toISOString(),
                  }
                : prev
            );
          } else {
            setAgreementData((prev) =>
              prev ? { ...prev, user_signed: true } : prev
            );
          }
        }}
      />
    </>
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="h-6 w-6 animate-spin text-[#1f419a]" />
          Loading meeting details...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg ring-1 ring-black/5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Cannot Submit Response</h2>
          </div>
          <p className="mb-6 text-gray-600">{error}</p>
          <Link
            href="/dashboard/meetings"
            className="inline-flex items-center gap-2 rounded-xl bg-[#1f419a] px-4 py-2 font-medium text-white hover:opacity-90"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Meetings
          </Link>
        </div>
      </div>
    );
  }

  if (alreadyResponded && existingResponseData) {
    const bothResponded = !!existingResponseData && !!partnerResponse;
    const bothYes =
      bothResponded &&
      existingResponseData.response === "yes" &&
      partnerResponse?.response === "yes";
    const bothNo =
      bothResponded &&
      existingResponseData.response === "no" &&
      partnerResponse?.response === "no";

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={110} height={28} style={{ width: "auto", height: "auto" }} />
            </Link>
            <NotificationBell />
          </div>
        </header>

        <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
          <aside className="hidden w-56 flex-shrink-0 md:block">
            <Sidebar active="appointments" />
          </aside>
          <section className="min-w-0 flex-1">
            <Link
              href="/dashboard/meetings"
              className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Meetings
            </Link>

            <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5">
              <div
                className={`p-6 ${
                  bothYes
                    ? "bg-gradient-to-r from-green-50 to-emerald-50"
                    : "bg-gradient-to-r from-gray-50 to-slate-50"
                }`}
              >
                <div className="mb-4 flex items-center gap-3">
                  <CheckCircle
                    className={`h-8 w-8 ${
                      bothYes ? "text-green-600" : "text-gray-400"
                    }`}
                  />
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">
                      Response Already Submitted
                    </h1>
                    <p className="text-sm text-gray-500">
                      You submitted your response on{" "}
                      {existingResponseData.signed_at
                        ? new Date(existingResponseData.signed_at).toLocaleDateString()
                        : "an unknown date"}
                    </p>
                  </div>
                </div>

                {bothResponded ? (
                  <div
                    className={`rounded-xl border p-4 ${
                      bothYes
                        ? "border-green-300 bg-green-100"
                        : bothNo
                          ? "border-gray-300 bg-gray-100"
                          : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    {bothYes ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-green-800">
                          Both you and {partner?.name} accepted. Messaging unlocks
                          after both signatures on the relationship agreement.
                        </p>
                        <p className="text-xs text-green-700">
                          Agreement status:{" "}
                          {agreementData?.fully_signed
                            ? "Fully signed"
                            : agreementData?.user_signed
                              ? "You signed. Waiting for partner."
                              : "Pending your signature"}
                        </p>
                      </div>
                    ) : bothNo ? (
                      <p className="text-sm font-medium text-gray-700">
                        Both parties declined. Your profiles remain active online.
                      </p>
                    ) : (
                      <p className="text-sm font-medium text-amber-800">
                        Responses do not match. No match was created and profiles
                        remain active.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm text-blue-800">
                      Waiting for {partner?.name} to submit their response.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Your Signed Response
                </h3>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm italic leading-relaxed text-gray-700">
                    &ldquo;{existingResponseData.agreement_text}&rdquo;
                  </p>
                  <p className="mt-3 text-xs text-gray-400">
                    Signed:{" "}
                    {existingResponseData.signed_at
                      ? new Date(existingResponseData.signed_at).toLocaleString()
                      : "Unknown"}
                  </p>
                </div>

                {bothYes ? (
                  <button
                    type="button"
                    onClick={() => setShowAgreementModal(true)}
                    className="mt-4 rounded-xl bg-[#1f419a] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Review &amp; Sign Relationship Agreement
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </div>
        {renderModals()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/matchindeed-logo-black-font.png" alt="MatchIndeed" width={110} height={28} style={{ width: "auto", height: "auto" }} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-56 flex-shrink-0 md:block">
          <Sidebar active="appointments" />
        </aside>

        <div className="space-y-6">
          <Link
            href="/dashboard/meetings"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Meetings
          </Link>

          <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1f419a] to-[#2a44a3]">
                <Video className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900">Meeting Response</h1>
                <p className="mt-1 text-gray-500">
                  Submit your response for the meeting with{" "}
                  <strong className="text-gray-700">{partner?.name}</strong>
                </p>
                {meeting ? (
                  <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(meeting.scheduled_at).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {new Date(meeting.scheduled_at).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </span>
                  </div>
                ) : null}
              </div>

              {partner ? (
                <div className="flex flex-col items-center gap-1">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gray-200 shadow-md">
                    {partner.photo ? (
                      <Image
                        src={partner.photo}
                        alt={partner.name}
                        width={56}
                        height={56}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="text-lg font-bold text-gray-400">
                        {partner.name?.[0] || "?"}
                      </span>
                    )}
                  </div>
                  <span className="max-w-[80px] truncate text-center text-xs text-gray-500">
                    {partner.name}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <MeetingResponseForm
            meetingId={meetingId}
            partnerName={partner?.name || "Partner"}
            meetingDate={meeting?.scheduled_at}
            onSuccess={(result: ResponseSubmitResult) => {
              if (result?.both_responded) {
                setMatchOutcome(result.response_outcome || null);
                setShowMatchModal(true);

                if (result?.agreement_required) {
                  setShowAgreementModal(true);
                }
                return;
              }

              setTimeout(() => {
                router.push("/dashboard/meetings");
              }, 3000);
            }}
          />
        </div>
      </div>
      {renderModals()}
    </div>
  );
}
