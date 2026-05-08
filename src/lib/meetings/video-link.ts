import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteZoomMeeting, type ZoomMeetingResult } from "@/lib/zoom";

type PersistedMeetingVideoLinkRow = {
  scheduled_at: string | null;
  video_link: string | null;
  video_password: string | null;
  zoom_meeting_id: string | null;
  video_link_is_fallback: boolean | null;
};

export type PersistedMeetingVideoLink = {
  scheduled_at: string | null;
  video_link: string;
  video_password: string | null;
  zoom_meeting_id: string | null;
  is_fallback: boolean;
  created_now: boolean;
};

export function buildMeetingVideoLinkUpdate(result: ZoomMeetingResult) {
  if (!result.join_url) {
    throw new Error("Video meeting link was not returned by provider");
  }

  const updateData: {
    video_link: string;
    video_password: string | null;
    video_link_is_fallback: boolean;
    zoom_meeting_id?: string;
  } = {
    video_link: result.join_url,
    video_password: result.password || null,
    video_link_is_fallback: result.is_fallback || false,
  };

  if (result.meeting_id) {
    updateData.zoom_meeting_id = String(result.meeting_id);
  }

  return updateData;
}

function normalizePersistedMeetingLink(
  row: PersistedMeetingVideoLinkRow,
  createdNow: boolean
): PersistedMeetingVideoLink | null {
  if (!row.video_link) {
    return null;
  }

  return {
    scheduled_at: row.scheduled_at,
    video_link: row.video_link,
    video_password: row.video_password || null,
    zoom_meeting_id: row.zoom_meeting_id || null,
    is_fallback: row.video_link_is_fallback || false,
    created_now: createdNow,
  };
}

export async function persistConfirmedMeetingVideoLinkIfMissing(params: {
  supabase: SupabaseClient;
  meetingId: string;
  zoomResult: ZoomMeetingResult;
}) {
  const { supabase, meetingId, zoomResult } = params;
  const updateData = buildMeetingVideoLinkUpdate(zoomResult);

  const { data: storedMeeting, error: storeError } = await supabase
    .from("meetings")
    .update(updateData)
    .eq("id", meetingId)
    .eq("status", "confirmed")
    .is("video_link", null)
    .select(
      "scheduled_at, video_link, video_password, zoom_meeting_id, video_link_is_fallback"
    )
    .maybeSingle();

  if (storeError) {
    throw new Error(storeError.message || "Failed to persist video link");
  }

  const storedLink = storedMeeting
    ? normalizePersistedMeetingLink(storedMeeting, true)
    : null;
  if (storedLink) {
    return storedLink;
  }

  const { data: currentMeeting, error: currentMeetingError } = await supabase
    .from("meetings")
    .select(
      "scheduled_at, video_link, video_password, zoom_meeting_id, video_link_is_fallback"
    )
    .eq("id", meetingId)
    .maybeSingle();

  if (currentMeetingError) {
    throw new Error(
      currentMeetingError.message || "Failed to reload existing video link"
    );
  }

  const currentLink = currentMeeting
    ? normalizePersistedMeetingLink(currentMeeting, false)
    : null;
  if (!currentLink) {
    throw new Error("Failed to persist video link");
  }

  const createdZoomMeetingId = zoomResult.meeting_id
    ? String(zoomResult.meeting_id)
    : null;
  if (
    createdZoomMeetingId &&
    currentLink.zoom_meeting_id &&
    currentLink.zoom_meeting_id !== createdZoomMeetingId
  ) {
    await deleteZoomMeeting(createdZoomMeetingId).catch((error) => {
      console.warn(
        "[meetings/video-link] duplicate Zoom meeting cleanup failed:",
        error
      );
    });
  }

  return currentLink;
}
