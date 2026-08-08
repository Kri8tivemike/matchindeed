import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { parsePaymentwallTxRef } from "@/lib/payments/paymentwall";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseServer = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignore cookie writes in API route context.
          }
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseServer.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const txRef = request.nextUrl.searchParams.get("txRef") || request.nextUrl.searchParams.get("tx_ref");
    if (!txRef) {
      return NextResponse.json(
        { error: "Paymentwall checkout reference is required" },
        { status: 400 }
      );
    }

    const reference = parsePaymentwallTxRef(txRef);
    if (!reference) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    let success = false;

    if (reference.paymentType === "subscription") {
      const { data: account, error: accountError } = await supabaseAdmin
        .from("accounts")
        .select("tier")
        .eq("id", user.id)
        .maybeSingle<{ tier: string | null }>();

      if (accountError) {
        throw accountError;
      }

      const { data: processingRow, error: processingError } = await supabaseAdmin
        .from("subscription_checkout_processing")
        .select("status")
        .eq("session_id", txRef)
        .maybeSingle<{ status: string }>();

      if (processingError) {
        throw processingError;
      }

      success =
        processingRow?.status === "completed" ||
        account?.tier?.toLowerCase() === reference.tier.toLowerCase();
    } else {
      const { data: transaction, error: transactionError } = await supabaseAdmin
        .from("wallet_transactions")
        .select("id")
        .eq("user_id", user.id)
        .eq("reference_id", txRef)
        .maybeSingle<{ id: string }>();

      if (transactionError) {
        throw transactionError;
      }

      success = Boolean(transaction?.id);
    }

    return NextResponse.json({
      success,
      retryable: !success,
      paid: success,
      provider: "paymentwall",
      type: reference.paymentType,
      tier: reference.paymentType === "subscription" ? reference.tier : null,
      credits: reference.paymentType === "credit_purchase" ? reference.credits : null,
      creditsAdded: reference.paymentType === "credit_purchase" ? reference.credits : null,
      amountCents: reference.amountCents,
      currency: reference.currency,
      status: success ? "completed" : "pending",
      message:
        success
          ? "Payment confirmed."
          : "Paymentwall is still confirming this payment.",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to verify Paymentwall checkout";
    console.error("Error verifying Paymentwall checkout:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
