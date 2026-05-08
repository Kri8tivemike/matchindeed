import { NextRequest } from "next/server";
import { POST as scheduleNotifications } from "../route";

/**
 * Backward-compatible alias for legacy clients that still call:
 * POST /api/meetings/notifications/schedule
 */
export async function POST(request: NextRequest) {
  return scheduleNotifications(request);
}
