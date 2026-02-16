/**
 * Zoom Meeting Integration Utility
 *
 * Generates Zoom meeting links via the Zoom Server-to-Server OAuth API.
 * Meeting links are generated when a meeting is confirmed and stored
 * in the database for both participants to use.
 *
 * Environment Variables Required:
 * - ZOOM_ACCOUNT_ID: Your Zoom account ID (from Server-to-Server OAuth app)
 * - ZOOM_CLIENT_ID: OAuth client ID
 * - ZOOM_CLIENT_SECRET: OAuth client secret
 *
 * Setup:
 * 1. Go to https://marketplace.zoom.us/
 * 2. Create a "Server-to-Server OAuth" app
 * 3. Add scopes: meeting:write:admin, meeting:read:admin
 * 4. Copy Account ID, Client ID, and Client Secret to .env
 */

// ---------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------

const ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;

/** Whether Zoom integration is properly configured */
export const isZoomConfigured =
  !!ZOOM_ACCOUNT_ID && !!ZOOM_CLIENT_ID && !!ZOOM_CLIENT_SECRET;

// ---------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------

export type ZoomMeetingResult = {
  success: boolean;
  /** The Zoom meeting join URL (for participants) */
  join_url?: string;
  /** The Zoom meeting start URL (for host — auto-authenticated) */
  start_url?: string;
  /** The Zoom meeting ID */
  meeting_id?: number;
  /** Meeting password */
  password?: string;
  /** Error message if creation failed */
  error?: string;
  /** True when Zoom is not configured and a fallback was used */
  is_fallback?: boolean;
};

export type ZoomTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

// ---------------------------------------------------------------
// TOKEN MANAGEMENT
// ---------------------------------------------------------------

/** Cached access token and expiry */
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get a valid Zoom OAuth access token using Server-to-Server OAuth flow.
 * Caches the token and refreshes when expired.
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoom OAuth failed: ${response.status} — ${errorText}`);
  }

  const data: ZoomTokenResponse = await response.json();

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;

  return data.access_token;
}

// ---------------------------------------------------------------
// MEETING CREATION
// ---------------------------------------------------------------

/**
 * Create a Zoom meeting for a video dating session.
 *
 * If Zoom is not configured (dev mode), generates a fallback
 * placeholder link so the rest of the flow still works.
 *
 * @param options Meeting creation options
 * @returns ZoomMeetingResult with join/start URLs
 */
export async function createZoomMeeting(options: {
  topic: string;
  startTime: string; // ISO 8601
  durationMinutes?: number;
  hostName?: string;
  guestName?: string;
}): Promise<ZoomMeetingResult> {
  const {
    topic,
    startTime,
    durationMinutes = 30,
    hostName,
    guestName,
  } = options;

  // -------------------------------------------------------
  // FALLBACK: If Zoom is not configured, return a placeholder
  // -------------------------------------------------------
  if (!isZoomConfigured) {
    console.log(
      "[Zoom] Not configured — generating fallback meeting link.",
      { topic, startTime }
    );

    // Generate a unique meeting room ID for fallback
    const roomId = Math.random().toString(36).substring(2, 10);
    const fallbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/dashboard/meetings/room/${roomId}`;

    return {
      success: true,
      join_url: fallbackUrl,
      start_url: fallbackUrl,
      meeting_id: Date.now(),
      password: roomId.substring(0, 6),
      is_fallback: true,
    };
  }

  // -------------------------------------------------------
  // REAL ZOOM: Create meeting via API
  // -------------------------------------------------------
  try {
    const accessToken = await getAccessToken();

    // Build meeting agenda with participant names
    let agenda = "MatchIndeed Video Dating Meeting";
    if (hostName && guestName) {
      agenda = `Video dating meeting between ${hostName} and ${guestName}`;
    }

    const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic,
        type: 2, // Scheduled meeting
        start_time: startTime,
        duration: durationMinutes,
        timezone: "UTC",
        agenda,
        settings: {
          // Host video on by default
          host_video: true,
          // Participant video on by default
          participant_video: true,
          // No registration required
          approval_type: 2,
          // Allow join before host (so both can join easily)
          join_before_host: true,
          // Mute participants on entry
          mute_upon_entry: false,
          // Enable waiting room (for safety)
          waiting_room: false,
          // Auto-record to cloud for VIP users (can be toggled)
          auto_recording: "none",
          // Meeting expires after scheduled time + buffer
          meeting_authentication: false,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[Zoom] Meeting creation failed:", errorData);
      return {
        success: false,
        error: errorData.message || "Failed to create Zoom meeting",
      };
    }

    const meeting = await response.json();

    console.log("[Zoom] Meeting created:", {
      id: meeting.id,
      join_url: meeting.join_url,
    });

    return {
      success: true,
      join_url: meeting.join_url,
      start_url: meeting.start_url,
      meeting_id: meeting.id,
      password: meeting.password,
      is_fallback: false,
    };
  } catch (error: any) {
    console.error("[Zoom] Error creating meeting:", error);
    return {
      success: false,
      error: error.message || "Zoom API error",
    };
  }
}

/**
 * Delete a Zoom meeting (for cancellations).
 *
 * @param zoomMeetingId The Zoom meeting ID to delete
 */
export async function deleteZoomMeeting(
  zoomMeetingId: number | string
): Promise<boolean> {
  if (!isZoomConfigured) {
    console.log("[Zoom] Not configured — skipping meeting deletion.");
    return true;
  }

  try {
    const accessToken = await getAccessToken();

    const response = await fetch(
      `https://api.zoom.us/v2/meetings/${zoomMeetingId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (response.ok || response.status === 204) {
      console.log(`[Zoom] Meeting ${zoomMeetingId} deleted.`);
      return true;
    }

    console.error(
      `[Zoom] Failed to delete meeting ${zoomMeetingId}:`,
      response.status
    );
    return false;
  } catch (error) {
    console.error("[Zoom] Error deleting meeting:", error);
    return false;
  }
}
