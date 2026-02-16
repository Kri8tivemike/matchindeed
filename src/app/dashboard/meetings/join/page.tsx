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
  User,
  Shield,
  ExternalLink,
  Loader2,
  ArrowLeft,
  Copy,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Camera,
  Mic,
  Wifi,
} from "lucide-react";

// ---------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------

type MeetingInfo = {
  meeting_id: string;
  video_link: string;
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

      // Fetch video link
      const res = await fetch(
        `/api/meetings/video-link?meeting_id=${meetingId}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to load meeting link");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setMeetingInfo(data);

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/dashboard/meetings"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Meetings
        </Link>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-[#1f419a] to-[#2a44a3] p-6 text-white text-center">
            <Video className="h-12 w-12 mx-auto mb-3 opacity-90" />
            <h1 className="text-2xl font-bold">Video Dating Meeting</h1>
            <p className="text-white/80 mt-1">
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
            <p className="text-white/70 text-sm">
              {meetingInfo?.scheduled_at
                ? new Date(meetingInfo.scheduled_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </p>
          </div>

          {/* Countdown */}
          <div className="text-center py-6 border-b border-gray-100">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-[#1f419a]" />
              <span className="text-sm text-gray-500 uppercase tracking-wider">
                {isMeetingTime ? "Meeting is ready" : "Starts in"}
              </span>
            </div>
            <p
              className={`text-3xl font-bold ${
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
            <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100">
              {partner.photo ? (
                <div className="h-14 w-14 rounded-full overflow-hidden ring-2 ring-gray-200 flex-shrink-0">
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
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[#1f419a] to-[#2a44a3] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {partner.name.charAt(0)}
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900">{partner.name}</p>
                <p className="text-sm text-gray-500 capitalize">
                  {partner.tier} member
                </p>
              </div>
            </div>
          )}

          {/* Pre-Meeting Checklist */}
          <div className="px-6 py-5">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm uppercase tracking-wider">
              Before You Join
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl text-sm">
                <Camera className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-green-800">Camera ready</span>
              </div>
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl text-sm">
                <Mic className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <span className="text-blue-800">Microphone on</span>
              </div>
              <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-xl text-sm">
                <Wifi className="h-4 w-4 text-purple-600 flex-shrink-0" />
                <span className="text-purple-800">Stable internet</span>
              </div>
            </div>
          </div>

          {/* Meeting Rules */}
          <div className="px-6 py-4 bg-amber-50/50 border-t border-amber-100">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800 space-y-1">
                <p className="font-medium">Meeting Etiquette</p>
                <p>
                  Be respectful and courteous. The host has the final say on
                  meeting outcomes. Leaving early or not showing up may result
                  in charges per our cancellation policy.
                </p>
              </div>
            </div>
          </div>

          {/* Meeting Link & Password */}
          {meetingInfo?.video_password && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Meeting Password:</span>
                <code className="bg-white px-3 py-1 rounded border border-gray-200 font-mono text-gray-900">
                  {meetingInfo.video_password}
                </code>
              </div>
            </div>
          )}

          {/* Join Button */}
          <div className="p-6 space-y-3">
            <button
              onClick={joinMeeting}
              disabled={!isMeetingTime}
              className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all ${
                isMeetingTime
                  ? "bg-gradient-to-r from-[#1f419a] to-[#2a44a3] text-white shadow-lg hover:shadow-xl hover:opacity-95"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              <Video className="h-5 w-5" />
              {isMeetingTime ? "Join Video Meeting" : "Waiting for meeting time..."}
              {isMeetingTime && <ExternalLink className="h-4 w-4" />}
            </button>

            {/* Copy link button */}
            <button
              onClick={copyLink}
              className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition"
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

            {meetingInfo?.is_fallback && (
              <p className="text-xs text-center text-gray-400">
                This is a development meeting link. In production, a Zoom
                meeting link will be generated automatically.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
