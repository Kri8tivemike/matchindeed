import type { SupabaseClient } from "@supabase/supabase-js";
import type { TierId } from "@/lib/subscription/config";
import {
  getCalendarSlotPolicy,
  getUserTier,
} from "@/lib/calendar/slot-allocation";
import { normalizeTier } from "@/lib/credits/config";
import { expireStalePendingMeetingRequests } from "@/lib/meetings/pending-expiration";

type MeetingRow = {
  id: string;
  status: string;
};

type ParticipantRow = {
  meeting_id: string;
};

type ParticipantInput = {
  userId: string;
  tier?: string | null;
};

export type BookingConflictResult = {
  allowed: boolean;
  status: number;
  code?: string;
  message?: string;
  participantId?: string;
  participantTier?: TierId;
  simultaneousLimit?: number;
  existingCount?: number;
};

async function getActiveMeetingIdsAtTime(
  supabase: SupabaseClient,
  userId: string,
  scheduledAtIso: string
) {
  const { data: hostMeetings, error: hostError } = await supabase
    .from("meetings")
    .select("id, status")
    .eq("host_id", userId)
    .eq("scheduled_at", scheduledAtIso)
    .in("status", ["pending", "confirmed"]);

  if (hostError) {
    throw hostError;
  }

  const { data: participantRows, error: participantError } = await supabase
    .from("meeting_participants")
    .select("meeting_id")
    .eq("user_id", userId)
    .neq("role", "host");

  if (participantError) {
    throw participantError;
  }

  const participantMeetingIds = ((participantRows || []) as ParticipantRow[]).map(
    (row) => row.meeting_id
  );

  if (participantMeetingIds.length === 0) {
    return (hostMeetings || []).map((meeting) => meeting.id);
  }

  const { data: participantMeetings, error: participantMeetingsError } =
    await supabase
      .from("meetings")
      .select("id, status")
      .in("id", participantMeetingIds)
      .eq("scheduled_at", scheduledAtIso)
      .in("status", ["pending", "confirmed"]);

  if (participantMeetingsError) {
    throw participantMeetingsError;
  }

  const ids = new Set<string>();
  for (const meeting of (hostMeetings || []) as MeetingRow[]) {
    ids.add(meeting.id);
  }
  for (const meeting of (participantMeetings || []) as MeetingRow[]) {
    ids.add(meeting.id);
  }
  return Array.from(ids);
}

export async function validateMeetingBookingConflicts(
  supabase: SupabaseClient,
  scheduledAtIso: string,
  participants: ParticipantInput[]
): Promise<BookingConflictResult> {
  await expireStalePendingMeetingRequests(supabase);

  for (const participant of participants) {
    const participantTier = participant.tier
      ? normalizeTier(participant.tier)
      : await getUserTier(supabase, participant.userId);
    const policy = await getCalendarSlotPolicy(
      supabase,
      participant.userId,
      participantTier
    );

    const existingMeetingIds = await getActiveMeetingIdsAtTime(
      supabase,
      participant.userId,
      scheduledAtIso
    );
    const existingCount = existingMeetingIds.length;
    if (existingCount === 0) {
      continue;
    }

    if (!policy.allow_multibooking) {
      return {
        allowed: false,
        status: 409,
        code: "booking_conflict",
        message:
          "One participant already has a meeting scheduled at this time.",
        participantId: participant.userId,
        participantTier,
        simultaneousLimit: 1,
        existingCount,
      };
    }

    if (existingCount >= policy.simultaneous_bookings_limit) {
      return {
        allowed: false,
        status: 409,
        code: "multibooking_limit_reached",
        message:
          "One participant has reached the maximum simultaneous booking limit.",
        participantId: participant.userId,
        participantTier,
        simultaneousLimit: policy.simultaneous_bookings_limit,
        existingCount,
      };
    }
  }

  return { allowed: true, status: 200 };
}
