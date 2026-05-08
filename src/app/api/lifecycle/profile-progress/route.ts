import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  CIO_EVENTS,
  identifyCustomerSafely,
  trackCustomerEventSafely,
} from "@/lib/customerio";

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

type AccountRow = {
  email: string | null;
  display_name: string | null;
  tier: string | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  location: string | null;
  gender: string | null;
};

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

    const [{ data: account }, { data: profile }] = await Promise.all([
      supabase
        .from("accounts")
        .select("email, display_name, tier")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("user_profiles")
        .select("first_name, last_name, location, gender")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const accountData = (account || null) as AccountRow | null;
    const profileData = (profile || null) as ProfileRow | null;

    let identifyTracked = false;
    let eventTracked = false;

    if (rawStep === "profile_completed") {
      const identifyEmail = accountData?.email || user.email || "";
      if (identifyEmail) {
        identifyTracked = await identifyCustomerSafely(user.id, {
          email: identifyEmail,
          first_name:
            profileData?.first_name ||
            accountData?.display_name ||
            user.email?.split("@")[0] ||
            undefined,
          last_name: profileData?.last_name || undefined,
          subscription_tier: accountData?.tier || undefined,
          profile_completed: true,
          city: profileData?.location || undefined,
          gender: profileData?.gender || undefined,
        });
      }

      eventTracked = await trackCustomerEventSafely(
        user.id,
        CIO_EVENTS.PROFILE_COMPLETED,
        {
          ...eventData,
          source: "dashboard_profile_edit",
          completed_at: new Date().toISOString(),
        }
      );
    }

    if (rawStep === "preferences_completed") {
      eventTracked = await trackCustomerEventSafely(
        user.id,
        CIO_EVENTS.PREFERENCES_SET,
        {
          ...eventData,
          source: "dashboard_preferences",
          completed_at: new Date().toISOString(),
        }
      );
    }

    return NextResponse.json({
      success: true,
      step: rawStep,
      tracked: {
        identify: identifyTracked,
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
