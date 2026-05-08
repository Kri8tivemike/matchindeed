import type { SupabaseClient } from "@supabase/supabase-js";
import type { TierId } from "@/lib/subscription/config";
import { normalizeTier } from "@/lib/credits/config";

type MeetingType = "group" | "one_on_one";

type MeetingRulesInput = {
  requesterTier?: string | null;
  targetTier?: string | null;
  meetingType?: string | null;
  standardPrivateMeetingsThisMonth?: number;
  requesterPlanLabel?: string | null;
};

export type MeetingRulesResult = {
  allowed: boolean;
  code?: string;
  message?: string;
  requiresUpgrade?: boolean;
  normalizedRequesterTier: TierId;
  normalizedTargetTier: TierId;
  normalizedMeetingType: MeetingType;
  limit?: number;
  used?: number;
};

type ParticipantRow = {
  meeting_id: string;
};

type MeetingRow = {
  id: string;
  type: string | null;
  status: string | null;
};

export const STANDARD_PRIVATE_MEETING_MONTHLY_LIMIT = 5;

export function normalizeMeetingType(rawType?: string | null): MeetingType {
  return rawType === "group" ? "group" : "one_on_one";
}

export function evaluateMeetingRequestRules(
  input: MeetingRulesInput
): MeetingRulesResult {
  const normalizedRequesterTier = normalizeTier(input.requesterTier);
  const normalizedTargetTier = normalizeTier(input.targetTier);
  const normalizedMeetingType = normalizeMeetingType(input.meetingType);
  const standardPrivateMeetingsThisMonth =
    input.standardPrivateMeetingsThisMonth || 0;
  const basicPlanLabel =
    normalizedRequesterTier === "basic" &&
    String(input.requesterPlanLabel || "").trim()
      ? String(input.requesterPlanLabel).trim()
      : "Basic";

  if (normalizedRequesterTier === "basic") {
    if (normalizedMeetingType !== "group") {
      return {
        allowed: false,
        code: "basic_group_only",
        message: `${basicPlanLabel} accounts can only schedule group meetings.`,
        requiresUpgrade: true,
        normalizedRequesterTier,
        normalizedTargetTier,
        normalizedMeetingType,
      };
    }

    if (normalizedTargetTier !== "basic") {
      return {
        allowed: false,
        code: "basic_target_restricted",
        message: `${basicPlanLabel} accounts can only request meetings with Basic users.`,
        requiresUpgrade: true,
        normalizedRequesterTier,
        normalizedTargetTier,
        normalizedMeetingType,
      };
    }
  }

  if (
    normalizedRequesterTier === "standard" &&
    normalizedMeetingType === "one_on_one"
  ) {
    if (!["basic", "standard"].includes(normalizedTargetTier)) {
      return {
        allowed: false,
        code: "standard_private_target_restricted",
        message:
          "Standard accounts can only request private meetings with Basic or Standard users.",
        requiresUpgrade: true,
        normalizedRequesterTier,
        normalizedTargetTier,
        normalizedMeetingType,
      };
    }

    if (
      standardPrivateMeetingsThisMonth >=
      STANDARD_PRIVATE_MEETING_MONTHLY_LIMIT
    ) {
      return {
        allowed: false,
        code: "standard_private_limit_reached",
        message: `Standard accounts are limited to ${STANDARD_PRIVATE_MEETING_MONTHLY_LIMIT} private meetings per month.`,
        requiresUpgrade: true,
        normalizedRequesterTier,
        normalizedTargetTier,
        normalizedMeetingType,
        limit: STANDARD_PRIVATE_MEETING_MONTHLY_LIMIT,
        used: standardPrivateMeetingsThisMonth,
      };
    }
  }

  if (
    normalizedRequesterTier === "premium" &&
    normalizedMeetingType === "one_on_one" &&
    normalizedTargetTier === "vip"
  ) {
    return {
      allowed: false,
      code: "premium_private_target_restricted",
      message:
        "Premium accounts can only request private meetings with Basic, Standard, or Premium users.",
      requiresUpgrade: true,
      normalizedRequesterTier,
      normalizedTargetTier,
      normalizedMeetingType,
    };
  }

  return {
    allowed: true,
    normalizedRequesterTier,
    normalizedTargetTier,
    normalizedMeetingType,
  };
}

export async function countStandardPrivateMeetingsThisMonth(
  supabase: SupabaseClient,
  userId: string,
  now = new Date()
): Promise<number> {
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)
  );

  const { data: participantRows, error: participantError } = await supabase
    .from("meeting_participants")
    .select("meeting_id")
    .eq("user_id", userId)
    .eq("role", "guest");

  if (participantError) {
    throw participantError;
  }

  const meetingIds = ((participantRows || []) as ParticipantRow[]).map(
    (row) => row.meeting_id
  );
  if (meetingIds.length === 0) {
    return 0;
  }

  const { data: meetingRows, error: meetingError } = await supabase
    .from("meetings")
    .select("id, type, status")
    .in("id", meetingIds)
    .gte("scheduled_at", monthStart.toISOString())
    .lt("scheduled_at", nextMonthStart.toISOString());

  if (meetingError) {
    throw meetingError;
  }

  const rows = (meetingRows || []) as MeetingRow[];
  return rows.filter((meeting) => {
    const status = (meeting.status || "").toLowerCase();
    return meeting.type === "one_on_one" && status !== "canceled";
  }).length;
}
