import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureBaselineUserRecords } from "@/lib/account-provisioning";
import { getSafeDisplayName } from "@/lib/name";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length);
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

    const { data: existingAccount, error: accountError } = await supabase
      .from("accounts")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle<{ display_name: string | null }>();

    if (accountError) {
      console.error("[auth/provision] account lookup error:", accountError);
      return NextResponse.json(
        { error: "Failed to verify account records." },
        { status: 500 }
      );
    }

    const displayName = getSafeDisplayName(
      null,
      existingAccount?.display_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        null
    );

    const provisioningResult = await ensureBaselineUserRecords(
      supabase,
      { id: user.id, email: user.email },
      displayName
    );

    if (!provisioningResult.ok) {
      return NextResponse.json(
        {
          error:
            provisioningResult.error ||
            "We couldn't finish preparing your account. Please try again.",
          code: provisioningResult.code || "account_setup_failed",
        },
        { status: provisioningResult.status || 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/provision] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
