"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/dashboard/Sidebar";
import NotificationBell from "@/components/NotificationBell";
import {
  Loader2,
  ArrowLeft,
  AlertCircle,
  Video,
  Calendar,
  Clock,
  ClipboardCheck,
  User,
  CheckCircle,
  MessageSquare,
  ShieldAlert,
  Send,
} from "lucide-react";

/**
 * Participant info for display
 */
type ParticipantInfo = {
  user_id: string;
  role: "host" | "guest";
  name: string;
  photo: string | null;
  tier: string;
};

/**
 * MeetingConcludePage - Host submits the meeting conclusion report.
 *
 * Per client requirements:
 * - Host has the final say about the meeting
 * - Host writes comments about each participant
 * - Host determines outcome, fault, and charge decision
 * - Results submitted to a dedicated page with host name
 * - MatchIndeed checks and finalizes to enable/disable charges
 * - Investigation notices sent for fault cases (1-2 business days)
 */
export default function MeetingConcludePage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  // Meeting & participant data
  const [meeting, setMeeting] = useState<any>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  // Page states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Already finalized
  const [alreadyFinalized, setAlreadyFinalized] = useState(false);

  // Form state
  const [form, setForm] = useState({
    outcome: "completed",
    fault: "no_fault",
    charge_decision: "capture",
    // Host writes a comment about each user (saved to their profile for admin reference)
    host_comment_user1: "",
    host_comment_user2: "",
    // General notes
    general_notes: "",
  });

  /**
   * Fetch meeting data on mount
   */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }
        setCurrentUser(user);

        // Fetch meeting with participants
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
                display_name,
                tier,
                email
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

        // Verify user is the host or an admin
        const { data: account } = await supabase
          .from("accounts")
          .select("role")
          .eq("id", user.id)
          .single();

        const isAdmin =
          account?.role &&
          ["admin", "superadmin", "moderator"].includes(account.role);
        const isHost = meetingData.host_id === user.id;

        if (!isHost && !isAdmin) {
          setError(
            "Only the meeting host or an admin can submit the conclusion report."
          );
          setLoading(false);
          return;
        }

        // Check if already finalized
        if (meetingData.finalized_at) {
          setAlreadyFinalized(true);
        }

        // Meeting must be confirmed or completed
        if (
          !["confirmed", "completed"].includes(meetingData.status) &&
          !meetingData.finalized_at
        ) {
          setError(
            `This meeting has status "${meetingData.status}" and cannot be concluded yet. The meeting must be confirmed or completed first.`
          );
          setLoading(false);
          return;
        }

        setMeeting(meetingData);

        // Build participant info
        const participantList: ParticipantInfo[] = [];
        for (const p of meetingData.meeting_participants || []) {
          // Get profile details
          const { data: profile } = await supabase
            .from("user_profiles")
            .select("first_name, last_name, profile_photo_url")
            .eq("user_id", p.user_id)
            .single();

          const name = profile
            ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
            : p.user?.display_name || p.user?.email?.split("@")[0] || "User";

          participantList.push({
            user_id: p.user_id,
            role: p.role,
            name,
            photo: profile?.profile_photo_url || null,
            tier: p.user?.tier || "basic",
          });
        }

        setParticipants(participantList);
      } catch (err: any) {
        console.error("Error fetching meeting data:", err);
        setError("Failed to load meeting details.");
      } finally {
        setLoading(false);
      }
    };

    if (meetingId) {
      fetchData();
    }
  }, [meetingId, router]);

  /**
   * Submit the conclusion report
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("Please log in to submit the conclusion.");
        setSubmitting(false);
        return;
      }

      // Combine host comments into the notes field
      const combinedNotes = [
        form.general_notes && `General: ${form.general_notes}`,
        participants[0] &&
          form.host_comment_user1 &&
          `Comment on ${participants[0].name} (${participants[0].role}): ${form.host_comment_user1}`,
        participants[1] &&
          form.host_comment_user2 &&
          `Comment on ${participants[1].name} (${participants[1].role}): ${form.host_comment_user2}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const response = await fetch("/api/meetings/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          meeting_id: meetingId,
          outcome: form.outcome,
          fault: form.fault,
          charge_decision: form.charge_decision,
          notes: combinedNotes,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to submit conclusion.");
        setSubmitting(false);
        return;
      }

      setSubmitted(true);

      // Redirect after delay
      setTimeout(() => {
        router.push("/dashboard/meetings");
      }, 3000);
    } catch (err: any) {
      console.error("Error submitting conclusion:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- LOADING ----------
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

  // ---------- ERROR ----------
  if (error && !meeting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg ring-1 ring-black/5 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="h-6 w-6 text-red-600" />
            <h2 className="text-lg font-bold text-gray-900">Error</h2>
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

  // ---------- MAIN PAGE ----------
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

              {/* SUCCESS STATE */}
              {submitted && (
                <div className="rounded-2xl bg-white shadow-lg ring-1 ring-black/5 overflow-hidden">
                  <div className="p-8 bg-gradient-to-r from-green-50 to-emerald-50 text-center">
                    <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      Conclusion Submitted
                    </h2>
                    <p className="text-gray-600 mb-4">
                      Your meeting conclusion report has been submitted. Both
                      participants have been notified.
                      {form.charge_decision === "pending_review" &&
                        " The charges are now under review by MatchIndeed (1-2 business days)."}
                    </p>
                    <p className="text-sm text-gray-400">
                      Redirecting to meetings...
                    </p>
                  </div>
                </div>
              )}

              {/* ALREADY FINALIZED STATE */}
              {alreadyFinalized && !submitted && (
                <div className="rounded-2xl bg-white shadow-lg ring-1 ring-black/5 overflow-hidden">
                  <div className="p-8 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center gap-3 mb-4">
                      <ClipboardCheck className="h-8 w-8 text-blue-500" />
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">
                          Already Concluded
                        </h2>
                        <p className="text-gray-500">
                          This meeting was finalized on{" "}
                          {new Date(
                            meeting.finalized_at
                          ).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-gray-600">
                      {meeting.outcome && (
                        <p>
                          <strong>Outcome:</strong>{" "}
                          {meeting.outcome.split("_").join(" ")}
                        </p>
                      )}
                      {meeting.fault_determination && (
                        <p>
                          <strong>Fault:</strong>{" "}
                          {meeting.fault_determination.split("_").join(" ")}
                        </p>
                      )}
                      {meeting.charge_status && (
                        <p>
                          <strong>Charge Status:</strong>{" "}
                          {meeting.charge_status.split("_").join(" ")}
                        </p>
                      )}
                      {meeting.host_notes && (
                        <div className="mt-4 p-3 rounded-lg bg-white border border-gray-200">
                          <p className="text-xs font-medium text-gray-500 mb-1">
                            Host Notes:
                          </p>
                          <p className="text-sm text-gray-700 whitespace-pre-line">
                            {meeting.host_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* CONCLUSION FORM */}
              {!submitted && !alreadyFinalized && (
                <>
                  {/* Meeting Info Header */}
                  <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                        <ClipboardCheck className="h-7 w-7 text-white" />
                      </div>
                      <div className="flex-1">
                        <h1 className="text-2xl font-bold text-gray-900">
                          Meeting Conclusion Report
                        </h1>
                        <p className="text-gray-500 mt-1">
                          Submit your assessment of the meeting and determine
                          charges.
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
                            <span className="flex items-center gap-1">
                              <Video className="h-4 w-4" />
                              {meeting.type === "one_on_one"
                                ? "1-on-1"
                                : "Group"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Participants */}
                  <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <User className="h-5 w-5 text-[#1f419a]" />
                      Participants
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {participants.map((p, idx) => (
                        <div
                          key={p.user_id}
                          className="p-4 rounded-xl bg-gray-50 border border-gray-200"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                              {p.photo ? (
                                <img
                                  src={p.photo}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="h-5 w-5 text-gray-400" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {p.name}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                                  {p.role === "host"
                                    ? "Host (Calendar Owner)"
                                    : "Guest (Requester)"}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                                  {p.tier.charAt(0).toUpperCase() +
                                    p.tier.slice(1)}
                                </span>
                              </div>
                            </div>
                          </div>
                          {/* Comment textarea for this user */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              <MessageSquare className="h-3 w-3 inline mr-1" />
                              Comment on {p.name}
                            </label>
                            <textarea
                              value={
                                idx === 0
                                  ? form.host_comment_user1
                                  : form.host_comment_user2
                              }
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  [idx === 0
                                    ? "host_comment_user1"
                                    : "host_comment_user2"]: e.target.value,
                                })
                              }
                              placeholder={`Write your observations about ${p.name}...`}
                              rows={3}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1f419a] focus:border-transparent resize-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Conclusion Form */}
                  <form
                    onSubmit={handleSubmit}
                    className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-black/5 space-y-6"
                  >
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-amber-500" />
                      Meeting Assessment
                    </h3>

                    {/* Outcome */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Meeting Outcome
                      </label>
                      <select
                        value={form.outcome}
                        onChange={(e) =>
                          setForm({ ...form, outcome: e.target.value })
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1f419a] focus:border-transparent"
                      >
                        <option value="completed">
                          Completed Successfully
                        </option>
                        <option value="no_show">
                          No Show — Participant did not appear
                        </option>
                        <option value="early_leave">
                          Early Leave — Untimely/unexpected departure
                        </option>
                        <option value="network_disconnect">
                          Network Disconnection — Technical issue
                        </option>
                      </select>
                    </div>

                    {/* Fault */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Fault Determination
                      </label>
                      <select
                        value={form.fault}
                        onChange={(e) =>
                          setForm({ ...form, fault: e.target.value })
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1f419a] focus:border-transparent"
                      >
                        <option value="no_fault">
                          No Fault — Meeting went smoothly
                        </option>
                        <option value="requester_fault">
                          Requester (Guest) at fault — left early, no show, or disruption
                        </option>
                        <option value="accepter_fault">
                          Accepter (Host side) at fault — left early, no show, or disruption
                        </option>
                        <option value="both_fault">
                          Both parties at fault
                        </option>
                      </select>

                      {/* Fault explanation */}
                      {form.fault !== "no_fault" && (
                        <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                          <p className="text-xs text-amber-800">
                            {form.fault === "requester_fault" && (
                              <>
                                <strong>Requester at fault:</strong> If the
                                person who sent the meeting request left for
                                any reason and didn&apos;t return within 4 minutes,
                                charges apply to them.
                              </>
                            )}
                            {form.fault === "accepter_fault" && (
                              <>
                                <strong>Accepter at fault:</strong> If the
                                person who accepted the meeting left
                                untimely, unexpectedly, or didn&apos;t show up,
                                they may be charged. If there is evidence,
                                the requester can get a refund after 1-2 days
                                investigation.
                              </>
                            )}
                            {form.fault === "both_fault" && (
                              <>
                                <strong>Both at fault:</strong> Both parties
                                contributed to the issue. Submit for
                                MatchIndeed review to determine appropriate
                                charges.
                              </>
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Charge Decision */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Charge Decision
                      </label>
                      <select
                        value={form.charge_decision}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            charge_decision: e.target.value,
                          })
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1f419a] focus:border-transparent"
                      >
                        <option value="capture">
                          Capture Charges — Requester pays (no refund)
                        </option>
                        <option value="refund">
                          Issue Refund — Return credits to requester
                        </option>
                        <option value="pending_review">
                          Submit for MatchIndeed Review (1-2 business days)
                        </option>
                      </select>
                      <p className="text-xs text-gray-500 mt-2">
                        {form.charge_decision === "capture"
                          ? "Credits will be permanently deducted from the requester."
                          : form.charge_decision === "refund"
                          ? "Credits will be returned to the requester's account."
                          : "MatchIndeed will review the evidence and determine charges. Both parties will receive an investigation notice."}
                      </p>
                    </div>

                    {/* General Notes */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        General Notes / Meeting Summary
                      </label>
                      <textarea
                        value={form.general_notes}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            general_notes: e.target.value,
                          })
                        }
                        placeholder="Describe the overall meeting conclusion, key observations, any issues encountered..."
                        rows={4}
                        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1f419a] focus:border-transparent resize-none"
                      />
                    </div>

                    {/* Investigation notice preview */}
                    {form.fault !== "no_fault" &&
                      form.charge_decision === "pending_review" && (
                        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                          <p className="text-xs font-medium text-blue-900 mb-1">
                            Investigation Notice (will be sent to both
                            parties):
                          </p>
                          <p className="text-xs text-blue-800 italic">
                            &ldquo;Dear [User Name], In your previous video
                            dating meeting held on{" "}
                            {meeting &&
                              new Date(
                                meeting.scheduled_at
                              ).toLocaleDateString()}
                            , the meeting will be reviewed to determine if
                            there is irregularity and inconsistency which
                            determines the charges. This review may take 1-2
                            business days.&rdquo;
                          </p>
                        </div>
                      )}

                    {/* Error */}
                    {error && (
                      <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    )}

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold hover:from-amber-600 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Submitting Conclusion...
                        </>
                      ) : (
                        <>
                          <Send className="h-5 w-5" />
                          Submit Meeting Conclusion
                        </>
                      )}
                    </button>

                    <p className="text-xs text-gray-400 text-center">
                      This report will be submitted to MatchIndeed and saved
                      to the meeting record. Both participants will be
                      notified of the outcome.
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
      </div>
    );
}
