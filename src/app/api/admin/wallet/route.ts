import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAccess } from "@/lib/admin/permissions";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type WalletTransactionRow = {
  id: string;
  user_id: string;
  type: string;
  amount_cents: number;
  balance_after_cents: number;
  description: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["view_wallet", "manage_wallet"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const admin = guard.context;

    const url = new URL(request.url);
    const search = (url.searchParams.get("q") || "").trim().toLowerCase();
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit") || 100))
    );
    const includeTransactions = url.searchParams.get("transactions") !== "0";

    let allowedUserIds: string[] | null = null;

    if (search) {
      const { data: matchingAccounts, error: accountsSearchError } = await supabase
        .from("accounts")
        .select("id")
        .or(`email.ilike.%${search}%,display_name.ilike.%${search}%`)
        .limit(500);

      if (accountsSearchError) {
        console.error("[admin/wallet][GET] account search error:", accountsSearchError);
        return NextResponse.json(
          { error: "Failed to search accounts" },
          { status: 500 }
        );
      }

      allowedUserIds = (matchingAccounts || []).map((a) => a.id);
      if (allowedUserIds.length === 0) {
        return NextResponse.json({ wallets: [], total: 0 });
      }
    }

    let walletsQuery = supabase
      .from("wallets")
      .select("user_id, balance_cents, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (allowedUserIds) {
      walletsQuery = walletsQuery.in("user_id", allowedUserIds);
    }

    const { data: wallets, error: walletsError } = await walletsQuery;
    if (walletsError) {
      console.error("[admin/wallet][GET] wallets error:", walletsError);
      return NextResponse.json(
        { error: "Failed to fetch wallets" },
        { status: 500 }
      );
    }

    const userIds = (wallets || []).map((w) => w.user_id);
    if (userIds.length === 0) {
      return NextResponse.json({ wallets: [], total: 0 });
    }

    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id, email, display_name")
      .in("id", userIds);

    if (accountsError) {
      console.error("[admin/wallet][GET] accounts error:", accountsError);
      return NextResponse.json(
        { error: "Failed to fetch account data" },
        { status: 500 }
      );
    }

    let groupedTransactions: Record<string, WalletTransactionRow[]> = {};
    if (includeTransactions) {
      const { data: transactions, error: transactionsError } = await supabase
        .from("wallet_transactions")
        .select(
          "id, user_id, type, amount_cents, balance_after_cents, description, created_at"
        )
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (transactionsError) {
        console.error("[admin/wallet][GET] transactions error:", transactionsError);
        return NextResponse.json(
          { error: "Failed to fetch transactions" },
          { status: 500 }
        );
      }

      groupedTransactions = (transactions || []).reduce<
        Record<string, WalletTransactionRow[]>
      >((acc, tx) => {
        if (!acc[tx.user_id]) acc[tx.user_id] = [];
        if (acc[tx.user_id].length < 10) {
          acc[tx.user_id].push(tx as WalletTransactionRow);
        }
        return acc;
      }, {});
    }

    const accountMap = new Map((accounts || []).map((a) => [a.id, a]));

    const normalized = (wallets || []).map((wallet) => {
      const account = accountMap.get(wallet.user_id);
      return {
        user_id: wallet.user_id,
        balance_cents: wallet.balance_cents || 0,
        user: {
          email: account?.email || `User ${wallet.user_id.substring(0, 8)}...`,
          display_name: account?.display_name || null,
        },
        transactions: includeTransactions
          ? groupedTransactions[wallet.user_id] || []
          : [],
      };
    });

    return NextResponse.json({
      wallets: normalized,
      total: normalized.length,
      admin: { user_id: admin.userId, role: admin.role },
    });
  } catch (error) {
    console.error("[admin/wallet][GET] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdminAccess(request, {
      anyPermissions: ["manage_wallet"],
    });
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const admin = guard.context;

    const body = await request.json();
    const userId =
      typeof body.user_id === "string" ? body.user_id.trim() : "";
    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";
    const adjustmentCents = Number(body.adjustment_cents);

    if (!userId) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(adjustmentCents) || adjustmentCents === 0) {
      return NextResponse.json(
        { error: "adjustment_cents must be a non-zero integer" },
        { status: 400 }
      );
    }

    if (Math.abs(adjustmentCents) > 10_000_000_00) {
      return NextResponse.json(
        { error: "adjustment_cents is too large" },
        { status: 400 }
      );
    }

    if (reason.length < 3 || reason.length > 500) {
      return NextResponse.json(
        { error: "reason must be between 3 and 500 characters" },
        { status: 400 }
      );
    }

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (accountError || !account) {
      return NextResponse.json(
        { error: "User account not found" },
        { status: 404 }
      );
    }

    const { data: existingWallet, error: walletReadError } = await supabase
      .from("wallets")
      .select("balance_cents")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletReadError) {
      console.error("[admin/wallet][POST] wallet read error:", walletReadError);
      return NextResponse.json(
        { error: "Failed to read wallet" },
        { status: 500 }
      );
    }

    const before = existingWallet?.balance_cents || 0;
    const tentativeAfter = before + adjustmentCents;
    const after = Math.max(0, tentativeAfter);
    const appliedAdjustment = after - before;

    const { error: walletWriteError } = await supabase
      .from("wallets")
      .upsert(
        {
          user_id: userId,
          balance_cents: after,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (walletWriteError) {
      console.error("[admin/wallet][POST] wallet write error:", walletWriteError);
      return NextResponse.json(
        { error: "Failed to update wallet" },
        { status: 500 }
      );
    }

    const direction = appliedAdjustment >= 0 ? "Added" : "Removed";
    const adjustmentAbs = Math.abs(appliedAdjustment);

    const { error: txError } = await supabase.from("wallet_transactions").insert({
      user_id: userId,
      type: "admin_adjustment",
      amount_cents: appliedAdjustment,
      balance_before_cents: before,
      balance_after_cents: after,
      description: `Admin ${direction}: ₦${(adjustmentAbs / 100).toFixed(2)} - ${reason}${
        tentativeAfter < 0 ? " (Balance capped at ₦0.00)" : ""
      }`,
      admin_id: admin.userId,
      reference_id: `admin_adjustment_${Date.now()}_${admin.userId}`,
      created_at: new Date().toISOString(),
    });

    if (txError) {
      console.error("[admin/wallet][POST] tx error, rolling back:", txError);
      await supabase.from("wallets").upsert(
        {
          user_id: userId,
          balance_cents: before,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      return NextResponse.json(
        { error: "Failed to write transaction log" },
        { status: 500 }
      );
    }

    await supabase.from("admin_logs").insert({
      admin_id: admin.userId,
      target_user_id: userId,
      action: "wallet_adjusted",
      meta: {
        requested_adjustment_cents: adjustmentCents,
        applied_adjustment_cents: appliedAdjustment,
        old_balance_cents: before,
        new_balance_cents: after,
        reason,
      },
    });

    return NextResponse.json({
      success: true,
      wallet: {
        user_id: userId,
        balance_before_cents: before,
        balance_after_cents: after,
      },
      adjustment: {
        requested_cents: adjustmentCents,
        applied_cents: appliedAdjustment,
        was_capped_to_zero: tentativeAfter < 0,
      },
    });
  } catch (error) {
    console.error("[admin/wallet][POST] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
