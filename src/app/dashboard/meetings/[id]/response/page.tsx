"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import MeetingResponseForm from "@/components/MeetingResponseForm";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import {
  Loader2,
  ArrowLeft,
  AlertCircle,
  Video,
  Calendar,
  Clock,
  CheckCircle,
} from "lucide-react";

/**
 * MeetingResponsePage - Full-page experience for submitting Yes/No response
 * after a completed video dating meeting.
 *
 * Per client requirements:
 * - Both parties say Yes → host enables date agreement form → messaging enabled
 * - Both parties say No → saved to dashboard and admin, profiles stay active
 * - Date and time come up automatically
 * - Each party has copy sent to their mail, dashboard, and admin keeps one
 */
export default function MeetingResponsePage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  const [meeting, setMeeting] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alreadyResponded, setAlreadyResponded] = useState(false);
  const [existingResponseData, setExistingResponseData] = useState<any>(null);
  // Whether the other party has also responded
  const [partnerResponse, setPartnerResponse] = useState<any>(null);

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
        setCurrentUser(user);

        // Fetch meeting details with participants and profiles
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

        // Check if meeting is completed
        if (meetingData.status !== "completed") {
          setError(
            "This meeting has not been completed yet. Responses can only be submitted after the meeting concludes."
          );
          setLoading(false);
          return;
        }

        // Verify user is a participant
        const participants = meetingData.meeting_participants || [];
        const myParticipation = participants.find(
          (p: any) => p.user_id === user.id
        );
        if (!myParticipation) {
          setError("You are not a participant in this meeting.");
          setLoading(false);
          return;
        }

        // Find partner (other participant)
        const partnerParticipant = participants.find(
          (p: any) => p.user_id !== user.id
        );

        if (!partnerParticipant) {
          setError("Partner not found for this meeting.");
          setLoading(false);
          return;
        }

        // Get partner's profile name
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

        // Check if user already responded
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

        // Check if partner has responded
        const { data: partnerResp } = await supabase
          .from("meeting_responses")
          .select("response, signed_at")
          .eq("meeting_id", meetingId)
          .eq("user_id", partnerParticipant.user_id)
          .single();

        if (partnerResp) {
          setPartnerResponse(partnerResp);
        }
      } catch (err: any) {
        console.error("Error fetching meeting:", err);
        setError(err.message || "Failed to load meeting details.");
      } finally {
        setLoading(false);
      }
    };

    if (meetingId) {
      fetchMeetingData();
    }
  }, [meetingId, router]);

  // ---------- LOADING STATE ----------
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

  // ---------- ERROR STATE ----------
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg ring-1 ring-black/5 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              Cannot Submit Response
            </h2>
          </div>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/dashboard/meetings"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1f419a] text-white font-medium hover:opacity-90 transition-opacity"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Meetings
          </Link>
        </div>
      </div>
    );
  }

  // ---------- ALREADY RESPONDED STATE ----------
  if (alreadyResponded && existingResponseData) {
    const bothResponded =
      existingResponseData && partnerResponse;
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
              <Image src="/matchindeed.svg" alt="Matchindeed" width={140} height={36} style={{ width: "auto", height: "auto" }} />
            </Link>
            <NotificationBell />
          </div>
        </header>

        <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
          <aside className="hidden md:block w-56 flex-shrink-0">
            <Sidebar active="appointments" />
          </aside>
          <section className="min-w-0 flex-1">
            <Link
              href="/dashboard/meetings"
              className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Meetings
            </Link>

            <div className="rounded-2xl bg-white shadow-lg ring-1 ring-black/5 overflow-hidden">
              {/* Status Header */}
              <div
                className={`p-6 ${
                  bothYes
                    ? "bg-gradient-to-r from-green-50 to-emerald-50"
                    : "bg-gradient-to-r from-gray-50 to-slate-50"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
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
                      {new Date(
                        existingResponseData.signed_at
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Match Status */}
                {bothResponded && (
                  <div
                    className={`p-4 rounded-xl border ${
                      bothYes
                        ? "bg-green-100 border-green-300"
                        : bothNo
                        ? "bg-gray-100 border-gray-300"
                        : "bg-amber-50 border-amber-200"
                    }`}
                  >
                    {bothYes ? (
                      <p className="text-sm font-medium text-green-800">
                        Both you and {partner?.name} accepted! Messaging has
                        been enabled between you.
                      </p>
                    ) : bothNo ? (
                      <p className="text-sm font-medium text-gray-700">
                        Both parties declined. Your profiles remain active
                        online.
                      </p>
                    ) : (
                      <p className="text-sm font-medium text-amber-800">
                        Responses don&apos;t match — one party accepted, the other
                        declined. Profiles remain active.
                      </p>
                    )}
                  </div>
                )}

                {!bothResponded && (
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                    <p className="text-sm text-blue-800">
                      Waiting for {partner?.name} to submit their response.
                      You&apos;ll be notified when they do.
                    </p>
                  </div>
                )}
              </div>

              {/* Your Signed Agreement */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Your Signed Agreement
                </h3>
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                  <p className="text-sm text-gray-700 italic leading-relaxed">
                    &ldquo;{existingResponseData.agreement_text}&rdquo;
                  </p>
                  <p className="text-xs text-gray-400 mt-3">
                    Signed:{" "}
                    {new Date(
                      existingResponseData.signed_at
                    ).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ---------- MAIN FORM STATE ----------
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/matchindeed.svg" alt="Matchindeed" width={140} height={36} style={{ width: "auto", height: "auto" }} />
          </Link>
          <NotificationBell />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden md:block w-56 flex-shrink-0">
          <Sidebar active="appointments" />
        </aside>

            {/* Content */}
            <div className="space-y-6">
              <Link
                href="/dashboard/meetings"
                className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Meetings
              </Link>

              {/* Meeting Info Card */}
              <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1f419a] to-[#2a44a3] flex items-center justify-center flex-shrink-0">
                    <Video className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h1 className="text-2xl font-bold text-gray-900">
                      Meeting Response
                    </h1>
                    <p className="text-gray-500 mt-1">
                      Submit your response for the meeting with{" "}
                      <strong className="text-gray-700">
                        {partner?.name}
                      </strong>
                    </p>
                    {meeting && (
                      <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(
                            meeting.scheduled_at
                          ).toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {new Date(
                            meeting.scheduled_at
                          ).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Partner avatar */}
                  {partner && (
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border-2 border-white shadow-md">
                        {partner.photo ? (
                          <img
                            src={partner.photo}
                            alt={partner.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-bold text-gray-400">
                            {partner.name?.[0] || "?"}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 text-center truncate max-w-[80px]">
                        {partner.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Response Form */}
              <MeetingResponseForm
                meetingId={meetingId}
                partnerName={partner?.name || "Partner"}
                meetingDate={meeting?.scheduled_at}
                onSuccess={() => {
                  // Short delay then redirect back to meetings
                  setTimeout(() => {
                    router.push("/dashboard/meetings");
                  }, 3000);
                }}
              />
            </div>
          </div>
      </div>
    );
}
