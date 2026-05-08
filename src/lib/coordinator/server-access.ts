import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type CoordinatorAccessAccount = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
  account_status: string | null;
};

export type CoordinatorAccessProfile = {
  id: string;
  name: string;
  email: string;
  user_id: string | null;
  enabled: boolean | null;
};

export type CoordinatorAccessResult = {
  ok: boolean;
  status: number;
  error?: string;
  account: CoordinatorAccessAccount | null;
  coordinator: CoordinatorAccessProfile | null;
};

type CoordinatorAccessOptions = {
  repair?: boolean;
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function loadCoordinatorProfile(userId: string, email: string) {
  const { data: byUser, error: byUserError } = await supabase
    .from("meeting_coordinators")
    .select("id, name, email, user_id, enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (byUserError) {
    throw byUserError;
  }

  if (byUser || !email) {
    return byUser as CoordinatorAccessProfile | null;
  }

  const { data: byEmail, error: byEmailError } = await supabase
    .from("meeting_coordinators")
    .select("id, name, email, user_id, enabled")
    .eq("email", email)
    .maybeSingle();

  if (byEmailError) {
    throw byEmailError;
  }

  return byEmail as CoordinatorAccessProfile | null;
}

async function repairCoordinatorProfile(
  account: CoordinatorAccessAccount,
  coordinator: CoordinatorAccessProfile | null
) {
  const email = normalizeEmail(account.email);
  if (!email) return coordinator;

  if (coordinator && !coordinator.user_id) {
    const { data, error } = await supabase
      .from("meeting_coordinators")
      .update({ user_id: account.id })
      .eq("id", coordinator.id)
      .select("id, name, email, user_id, enabled")
      .single();

    if (error) throw error;
    return data as CoordinatorAccessProfile;
  }

  if (!coordinator && account.role === "coordinator") {
    const { data, error } = await supabase
      .from("meeting_coordinators")
      .upsert(
        {
          name: account.display_name || email.split("@")[0] || "Coordinator",
          email,
          user_id: account.id,
          enabled: true,
        },
        { onConflict: "email" }
      )
      .select("id, name, email, user_id, enabled")
      .single();

    if (error) throw error;
    return data as CoordinatorAccessProfile;
  }

  return coordinator;
}

export async function loadCoordinatorAccessForUser(
  userId: string,
  options: CoordinatorAccessOptions = {}
): Promise<CoordinatorAccessResult> {
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, email, display_name, role, account_status")
    .eq("id", userId)
    .maybeSingle();

  if (accountError) {
    throw accountError;
  }

  const typedAccount = account as CoordinatorAccessAccount | null;
  if (!typedAccount) {
    return {
      ok: false,
      status: 403,
      error: "Coordinator account was not found.",
      account: null,
      coordinator: null,
    };
  }

  if (String(typedAccount.account_status || "").toLowerCase() !== "active") {
    return {
      ok: false,
      status: 403,
      error: "This coordinator account is not active.",
      account: typedAccount,
      coordinator: null,
    };
  }

  const role = String(typedAccount.role || "");
  let coordinator = await loadCoordinatorProfile(
    userId,
    normalizeEmail(typedAccount.email)
  );

  if (options.repair) {
    coordinator = await repairCoordinatorProfile(typedAccount, coordinator);
  }

  const coordinatorExplicitlyDisabled = coordinator?.enabled === false;
  const hasCoordinatorAccess =
    coordinator?.enabled === true ||
    (role === "coordinator" && !coordinatorExplicitlyDisabled);

  if (!hasCoordinatorAccess) {
    return {
      ok: false,
      status: 403,
      error: "This account is not enabled for coordinator access.",
      account: typedAccount,
      coordinator,
    };
  }

  return {
    ok: true,
    status: 200,
    account: typedAccount,
    coordinator,
  };
}
