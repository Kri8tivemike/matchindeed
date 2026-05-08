"use client";

/**
 * MeetingJoinPage - Pre-meeting lobby / redirect page
 *
 * Shows meeting details and a countdown, then redirects the participant
 * to the video call (Zoom or fallback). Also displays meeting rules
 * and etiquette reminders.
 *
 * URL: /dashboard/meetings/join?id=meeting_id
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Video,
  Clock,
  Shield,
  ExternalLink,
  Loader2,
  ArrowLeft,
  Copy,
  CheckCircle,
  AlertTriangle,
  Camera,
  Mic,
  Wifi,
} from "lucide-react";

// ---------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------

type MeetingInfo = {
  meeting_id: string;
  video_link: string | null;
  video_password: string | null;
  zoom_meeting_id: string | null;
  scheduled_at: string;
  is_fallback: boolean;
};

type PartnerInfo = {
  name: string;
  photo: string | null;
  tier: string;
};

// ---------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------

export default function MeetingJoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const meetingId = searchParams.get("id");

  const [meetingInfo, setMeetingInfo] = useState<MeetingInfo | null>(null);
  const [partner, setPartner] = useState<PartnerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isMeetingTime, setIsMeetingTime] = useState(false);
  const [rulesAcked, setRulesAcked] = useState(false);
  const [ackLoading, setAckLoading] = useState(false);
  const [ackChecklist, setAckChecklist] = useState<string[]>([]);
  const canAccessMeetingRoom = Boolean(rulesAcked && meetingInfo?.video_link);

  /**
   * Fetch meeting video link and partner info
   */
  const fetchMeetingInfo = useCallback(async () => {
    if (!meetingId) {
      setError("No meeting ID provided");
      setLoading(false);
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // Fetch etiquette acknowledgment status
      const ackRes = await fetch(
        `/api/meetings/acknowledge-rules?meeting_id=${meetingId}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      let acknowledged = false;
      if (ackRes.ok) {
        const ackData = await ackRes.json();
        acknowledged = !!ackData.acknowledged;
        setRulesAcked(acknowledged);
        setAckChecklist(Array.isArray(ackData.checklist) ? ackData.checklist : []);
      }

      if (acknowledged) {
        // Fetch video link once rules are acknowledged
        const res = await fetch(
          `/api/meetings/video-link?meeting_id=${meetingId}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );

        if (!res.ok) {
          const errData = await res.json();
          if (res.status === 428 || errData?.error === "rules_not_acknowledged") {
            setRulesAcked(false);
          } else {
            setError(errData.error || "Failed to load meeting link");
            setLoading(false);
            return;
          }
        } else {
          const data = await res.json();
          setMeetingInfo(data);
        }
      } else {
        // Load meeting schedule metadata so user can still see meeting details before acknowledgment
        const { data: basicMeeting } = await supabase
          .from("meetings")
          .select(
            "id, scheduled_at, video_link, video_password, zoom_meeting_id, video_link_is_fallback"
          )
          .eq("id", meetingId)
          .single();

        if (basicMeeting) {
          setMeetingInfo({
            meeting_id: basicMeeting.id,
            video_link: null,
            video_password: null,
            zoom_meeting_id: null,
            scheduled_at: basicMeeting.scheduled_at,
            is_fallback: !!basicMeeting.video_link_is_fallback,
          });
        }
      }

      // Fetch partner info
      const { data: participants } = await supabase
        .from("meeting_participants")
        .select("user_id, role")
        .eq("meeting_id", meetingId);

      const partnerParticipant = participants?.find(
        (p) => p.user_id !== session.user.id
      );

      if (partnerParticipant) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("first_name, last_name, profile_photo_url, photos")
          .eq("user_id", partnerParticipant.user_id)
          .single();

        const { data: account } = await supabase
          .from("accounts")
          .select("tier")
          .eq("id", partnerParticipant.user_id)
          .single();

        setPartner({
          name: profile
            ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
              "Your Match"
            : "Your Match",
          photo:
            profile?.profile_photo_url ||
            (profile?.photos?.[0] ?? null),
          tier: account?.tier || "basic",
        });
      }
    } catch (err) {
      console.error("Error fetching meeting info:", err);
      setError("Failed to load meeting information");
    } finally {
      setLoading(false);
    }
  }, [meetingId, router]);

  useEffect(() => {
    fetchMeetingInfo();
  }, [fetchMeetingInfo]);

  // Countdown timer
  useEffect(() => {
    if (!meetingInfo?.scheduled_at) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const meetingTime = new Date(meetingInfo.scheduled_at).getTime();
      const diff = meetingTime - now;

      if (diff <= 0) {
        setCountdown("Meeting time!");
        setIsMeetingTime(true);
        return;
      }

      // Allow joining 10 minutes early
      if (diff <= 10 * 60 * 1000) {
        setIsMeetingTime(true);
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setCountdown(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setCountdown(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${minutes}m ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [meetingInfo?.scheduled_at]);

  /** Copy meeting link to clipboard */
  const copyLink = async () => {
    if (!meetingInfo?.video_link) return;
    try {
      await navigator.clipboard.writeText(meetingInfo.video_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  /** Open the video call */
  const joinMeeting = () => {
    if (!meetingInfo?.video_link) return;
    window.open(meetingInfo.video_link, "_blank", "noopener,noreferrer");
  };

  const acknowledgeRules = async () => {
    if (!meetingId) return;
    setAckLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const res = await fetch("/api/meetings/acknowledge-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ meeting_id: meetingId }),
      });

      if (!res.ok) {
        return;
      }

      const data = await res.json();
      setRulesAcked(!!data.acknowledged);
      if (Array.isArray(data.checklist)) {
        setAckChecklist(data.checklist);
      }
      await fetchMeetingInfo();
    } finally {
      setAckLoading(false);
    }
  };

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#1f419a]" />
          <p className="text-gray-600">Preparing your meeting room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Unable to Load Meeting
          </h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <Link
            href="/dashboard/meetings"
            className="inline-flex items-center gap-2 text-[#1f419a] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Meetings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40">
      <div className="mx-auto max-w-3xl px-3 py-4 sm:px-4 sm:py-6">
        {/* Back link */}
        <Link
          href="/dashboard/meetings"
          className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Meetings
        </Link>

        {/* Main Card */}
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_16px_50px_rgba(31,65,154,0.08)]">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-[#1f419a] to-[#2a44a3] px-5 py-5 text-center text-white sm:px-6 sm:py-6">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 backdrop-blur">
              <Video className="h-7 w-7 opacity-95" />
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">Video Dating Meeting</h1>
            <p className="mt-1 text-sm text-white/80 sm:text-base">
              {meetingInfo?.scheduled_at
                ? new Date(meetingInfo.scheduled_at).toLocaleDateString(
                    undefined,
                    {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    }
                  )
                : ""}
            </p>
            <p className="text-sm text-white/70">
              {meetingInfo?.scheduled_at
                ? new Date(meetingInfo.scheduled_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </p>
          </div>

          {/* Countdown */}
          <div className="border-b border-slate-100 px-5 py-5 text-center sm:px-6">
            <div className="mb-2 flex items-center justify-center gap-2">
              <Clock className="h-5 w-5 text-[#1f419a]" />
              <span className="text-xs uppercase tracking-[0.2em] text-gray-500 sm:text-sm">
                {isMeetingTime ? "Meeting is ready" : "Starts in"}
              </span>
            </div>
            <p
              className={`text-3xl font-bold tracking-tight sm:text-4xl ${
                isMeetingTime ? "text-green-600" : "text-gray-900"
              }`}
            >
              {countdown}
            </p>
            {!isMeetingTime && (
              <p className="text-xs text-gray-400 mt-1">
                You can join 10 minutes before the scheduled time
              </p>
            )}
          </div>

          {/* Partner Info */}
          {partner && (
            <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 sm:px-4">
              {partner.photo ? (
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full ring-2 ring-white shadow-sm sm:h-14 sm:w-14">
                  <Image
                    src={partner.photo}
                    alt={partner.name}
                    width={56}
                    height={56}
                    className="object-cover h-full w-full"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1f419a] to-[#2a44a3] text-lg font-bold text-white sm:h-14 sm:w-14">
                  {partner.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{partner.name}</p>
                <p className="text-sm text-gray-500 capitalize">
                  {partner.tier} member
                </p>
              </div>
              <button
                onClick={joinMeeting}
                disabled={!canAccessMeetingRoom}
                className={`hidden shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition lg:inline-flex ${
                  canAccessMeetingRoom
                    ? "bg-[#1f419a] text-white shadow-sm hover:bg-[#19357f]"
                    : "bg-white text-gray-400 ring-1 ring-gray-200"
                }`}
              >
                <Video className="h-4 w-4" />
                Join Meeting
              </button>
              </div>
            </div>
          )}

          {/* Pre-Meeting Checklist */}
          <div className="px-5 py-4 sm:px-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-900">
              Before You Join
            </h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-sm">
                <Camera className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-green-800">Camera ready</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm">
                <Mic className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <span className="text-blue-800">Microphone on</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-purple-50 px-3 py-2.5 text-sm">
                <Wifi className="h-4 w-4 text-purple-600 flex-shrink-0" />
                <span className="text-purple-800">Stable internet</span>
              </div>
            </div>
          </div>

          {/* Meeting Rules */}
          <div className="border-t border-amber-100 bg-amber-50/50 px-5 py-4 sm:px-6">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800 space-y-1">
                <p className="font-medium">Meeting Etiquette</p>
                <p>
                  Be respectful and courteous. The host has the final say on
                  meeting outcomes. Leaving early or not showing up may result
                  in charges per our cancellation policy.
                </p>
                {ackChecklist.length > 0 && (
                  <ul className="mt-2 list-disc pl-4 space-y-0.5 text-[11px]">
                    {ackChecklist.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="mt-3">
              <button
                onClick={acknowledgeRules}
                disabled={rulesAcked || ackLoading}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  rulesAcked
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                }`}
              >
                {ackLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : rulesAcked ? (
                  <CheckCircle className="h-3.5 w-3.5" />
                ) : (
                  <Shield className="h-3.5 w-3.5" />
                )}
                {rulesAcked
                  ? "Rules Acknowledged"
                  : "Acknowledge Rules to Join"}
              </button>
            </div>
          </div>

          {/* Meeting Link & Password */}
          {rulesAcked && meetingInfo?.video_password && (
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 sm:px-6">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-500">Meeting Password</span>
                <code className="rounded-lg border border-gray-200 bg-white px-3 py-1 font-mono text-gray-900">
                  {meetingInfo.video_password}
                </code>
              </div>
            </div>
          )}

          {/* Action Area */}
          <div className="space-y-3 p-5 pb-24 sm:p-6 sm:pb-6">
            <button
              onClick={joinMeeting}
              disabled={!canAccessMeetingRoom}
              className={`flex w-full items-center justify-center gap-3 rounded-2xl py-3.5 text-base font-semibold transition-all lg:hidden ${
                canAccessMeetingRoom
                  ? "bg-gradient-to-r from-[#1f419a] to-[#2a44a3] text-white shadow-lg hover:shadow-xl hover:opacity-95"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              <Video className="h-5 w-5" />
              {canAccessMeetingRoom
                ? "Join Video Meeting"
                : rulesAcked
                  ? "Preparing meeting link..."
                  : "Acknowledge rules to join"}
              {canAccessMeetingRoom && <ExternalLink className="h-4 w-4" />}
            </button>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <button
                onClick={joinMeeting}
                disabled={!canAccessMeetingRoom}
                className={`hidden items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all lg:flex ${
                  canAccessMeetingRoom
                    ? "bg-gradient-to-r from-[#1f419a] to-[#2a44a3] text-white shadow-md hover:opacity-95"
                    : "cursor-not-allowed bg-gray-100 text-gray-400"
                }`}
              >
                <Video className="h-4 w-4" />
                Join Meeting
                {canAccessMeetingRoom && <ExternalLink className="h-4 w-4" />}
              </button>

              <button
                onClick={copyLink}
                disabled={!canAccessMeetingRoom}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-medium transition ${
                  canAccessMeetingRoom
                    ? "border-gray-200 text-gray-600 hover:bg-gray-50"
                    : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400"
                }`}
              >
                {copied ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Link Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Meeting Link
                  </>
                )}
              </button>
            </div>

            {meetingInfo?.is_fallback && (
              <p className="text-xs text-center text-gray-400">
                This is a development meeting link. In production, a Zoom
                meeting link will be generated automatically.
              </p>
            )}
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-3xl gap-3">
            <button
              onClick={copyLink}
              disabled={!canAccessMeetingRoom}
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                canAccessMeetingRoom
                  ? "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  : "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400"
              }`}
            >
              {copied ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Link
                </>
              )}
            </button>
            <button
              onClick={joinMeeting}
              disabled={!canAccessMeetingRoom}
              className={`flex min-w-0 flex-[1.2] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                canAccessMeetingRoom
                  ? "bg-gradient-to-r from-[#1f419a] to-[#2a44a3] text-white shadow-lg"
                  : "cursor-not-allowed bg-gray-100 text-gray-400"
              }`}
            >
              <Video className="h-4 w-4" />
              Join Meeting
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
