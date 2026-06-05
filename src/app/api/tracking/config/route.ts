import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TRACKING_KEYS = [
  "meta_pixel_id",
  "tiktok_pixel_id",
  "google_tag_id",
  "google_tag_manager_container_id",
];

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("referral_settings")
      .select("key, value")
      .in("key", TRACKING_KEYS);

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json(
          {
            metaPixelId: "",
            tiktokPixelId: "",
            googleTagId: "",
            googleTagManagerContainerId: "",
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      throw error;
    }

    const values = new Map((data || []).map((row) => [row.key, row.value]));

    return NextResponse.json(
      {
        metaPixelId: readString(values.get("meta_pixel_id")),
        tiktokPixelId: readString(values.get("tiktok_pixel_id")),
        googleTagId: readString(values.get("google_tag_id")),
        googleTagManagerContainerId: readString(
          values.get("google_tag_manager_container_id")
        ),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[tracking/config] error:", error);
    return NextResponse.json(
      {
        metaPixelId: "",
        tiktokPixelId: "",
        googleTagId: "",
        googleTagManagerContainerId: "",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
