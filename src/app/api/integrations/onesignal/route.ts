import { NextResponse } from "next/server";
import { getOneSignalWebPushStatus } from "@/lib/onesignal-app-status";

export async function GET() {
  const status = await getOneSignalWebPushStatus();
  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
