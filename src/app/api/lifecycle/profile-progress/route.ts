import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCT_ANALYTICS_EVENTS,
  trackProductEventSafely,
} from "@/lib/product-analytics";
import { evaluateProfilePreferencesReferralReward } from "@/lib/referrals/rewards";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ProgressStep = "profile_completed" | "preferences_completed";

function isProgressStep(value: string): value is ProgressStep {
  return value === "profile_completed" || value === "preferences_completed";
}

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

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const rawStep = String(body.step || "").trim().toLowerCase();
    if (!isProgressStep(rawStep)) {
      return NextResponse.json(
        { error: "Invalid step. Use profile_completed or preferences_completed." },
        { status: 400 }
      );
    }

    const rawEventData = body.event_data;
    const eventData =
      rawEventData && typeof rawEventData === "object"
        ? (rawEventData as Record<string, unknown>)
        : {};

    let eventTracked = false;

    if (rawStep === "profile_completed") {
      eventTracked = await trackProductEventSafely(
        user.id,
        PRODUCT_ANALYTICS_EVENTS.PROFILE_COMPLETED,
        {
          ...eventData,
          source: "dashboard_profile_edit",
          completed_at: new Date().toISOString(),
        }
      );
    }

    if (rawStep === "preferences_completed") {
      eventTracked = await trackProductEventSafely(
        user.id,
        PRODUCT_ANALYTICS_EVENTS.PREFERENCES_COMPLETED,
        {
          ...eventData,
          source: "dashboard_preferences",
          completed_at: new Date().toISOString(),
        }
      );
    }

    await evaluateProfilePreferencesReferralReward(supabase, user.id).catch(
      (referralError) => {
        console.warn(
          "[lifecycle/profile-progress] referral reward evaluation skipped:",
          referralError
        );
      }
    );

    return NextResponse.json({
      success: true,
      step: rawStep,
      tracked: {
        event: eventTracked,
      },
    });
  } catch (error) {
    console.error("Error tracking lifecycle profile progress:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
