import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getCalendarSlotPolicy,
  getUserTier,
} from "@/lib/calendar/slot-allocation";
import { expireStalePendingMeetingRequests } from "@/lib/meetings/pending-expiration";
import {
  getSafeTimeZone,
  getDateKeyInTimeZone,
  getTimeValueInTimeZone,
  zonedDateTimeToUtc,
} from "@/lib/timezones";
import {
  getMinimumRequestableMeetingStartDate,
  getMinimumRequestableMeetingStartIso,
} from "@/lib/meetings/request-availability";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TARGET_UNAVAILABLE_MESSAGE =
  "This user is not accepting new bookings right now. Please check back later or choose another available match. Thank you.";

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

async function getActiveMeetingCountsByTime(userId: string) {
  const { data: hostMeetings, error: hostError } = await supabase
    .from("meetings")
    .select("id, scheduled_at")
    .eq("host_id", userId)
    .in("status", ["pending", "confirmed"])
    .gte("scheduled_at", new Date().toISOString());

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

  const participantMeetingIds = Array.from(
    new Set((participantRows || []).map((row) => String(row.meeting_id)))
  );

  let participantMeetings: Array<{ id: string; scheduled_at: string | null }> = [];
  if (participantMeetingIds.length > 0) {
    const { data, error } = await supabase
      .from("meetings")
      .select("id, scheduled_at")
      .in("id", participantMeetingIds)
      .in("status", ["pending", "confirmed"])
      .gte("scheduled_at", new Date().toISOString());

    if (error) {
      throw error;
    }

    participantMeetings = (data || []) as Array<{ id: string; scheduled_at: string | null }>;
  }

  const counts = new Map<string, number>();
  const seenMeetingIds = new Set<string>();

  for (const meeting of [...((hostMeetings || []) as Array<{ id: string; scheduled_at: string | null }>), ...participantMeetings]) {
    if (!meeting.scheduled_at || seenMeetingIds.has(meeting.id)) {
      continue;
    }

    seenMeetingIds.add(meeting.id);
    counts.set(meeting.scheduled_at, (counts.get(meeting.scheduled_at) || 0) + 1);
  }

  return counts;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await expireStalePendingMeetingRequests(supabase);

    const targetUserId = String(
      request.nextUrl.searchParams.get("target_user_id") || ""
    ).trim();

    if (!targetUserId) {
      return NextResponse.json(
        { error: "target_user_id is required" },
        { status: 400 }
      );
    }

    const targetTier = await getUserTier(supabase, targetUserId);
    const slotPolicy = await getCalendarSlotPolicy(supabase, targetUserId, targetTier);

    const [
      { data: account },
      { data: calendarConfig },
      { data: slots, error: slotsError },
      activeMeetingCounts,
    ] =
      await Promise.all([
        supabase
          .from("accounts")
          .select("calendar_enabled, profile_visible, profile_status")
          .eq("id", targetUserId)
          .maybeSingle(),
        supabase
          .from("calendar_configurations")
          .select("timezone")
          .eq("user_id", targetUserId)
          .maybeSingle(),
        supabase
          .from("meeting_availability")
          .select("id, slot_date, slot_time, scheduled_at_utc")
          .eq("user_id", targetUserId)
          .order("scheduled_at_utc", { ascending: true, nullsFirst: false })
          .order("slot_date", { ascending: true })
          .order("slot_time", { ascending: true }),
        getActiveMeetingCountsByTime(targetUserId),
      ]);

    if (slotsError) {
      console.error("Error fetching meeting availability:", slotsError);
      return NextResponse.json(
        { error: "Failed to load availability" },
        { status: 500 }
      );
    }

    if (account?.calendar_enabled === false || account?.profile_visible === false) {
      return NextResponse.json(
        {
          error: TARGET_UNAVAILABLE_MESSAGE,
          code: "target_unavailable",
          host_timezone: getSafeTimeZone(calendarConfig?.timezone),
        },
        { status: 403 }
      );
    }

    const hostTimeZone = getSafeTimeZone(calendarConfig?.timezone);
    const minimumRequestableStart = getMinimumRequestableMeetingStartDate();

    const mappedSlots = (slots || [])
      .map((slot) => {
        const scheduledAt = zonedDateTimeToUtc(
          String(slot.slot_date),
          String(slot.slot_time),
          hostTimeZone
        );
        const scheduledAtIso =
          String(slot.scheduled_at_utc || "").trim() || scheduledAt?.toISOString();

        if (!scheduledAtIso) {
          return null;
        }

        return {
          id: String(slot.id),
          slot_date: getDateKeyInTimeZone(scheduledAtIso, hostTimeZone),
          slot_time: getTimeValueInTimeZone(scheduledAtIso, hostTimeZone, true),
          scheduled_at: scheduledAtIso,
        };
      })
      .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot))
      .filter((slot) => new Date(slot.scheduled_at) >= minimumRequestableStart)
      .filter((slot) => {
        const activeCount = activeMeetingCounts.get(slot.scheduled_at) || 0;
        return activeCount < slotPolicy.simultaneous_bookings_limit;
      })
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

    return NextResponse.json({
      slots: mappedSlots,
      host_timezone: hostTimeZone,
      minimum_requestable_start: getMinimumRequestableMeetingStartIso(),
    });
  } catch (error) {
    console.error("Error in GET /api/meetings/availability:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
