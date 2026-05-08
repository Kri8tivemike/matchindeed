import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadEffectiveAccountPermissions } from "@/lib/account-permissions";
import {
  loadCoordinatorAccessForUser,
  type CoordinatorAccessAccount,
  type CoordinatorAccessProfile,
} from "@/lib/coordinator/server-access";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type CoordinatorPermissionContext = {
  userId: string;
  email: string | null;
  permissions: Set<string>;
  account: CoordinatorAccessAccount;
  coordinator: CoordinatorAccessProfile | null;
};

type RequireCoordinatorOptions = {
  anyPermissions?: readonly string[];
  repair?: boolean;
};

type CoordinatorPermissionResult =
  | {
      ok: true;
      context: CoordinatorPermissionContext;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function requireCoordinatorAccess(
  request: NextRequest,
  options: RequireCoordinatorOptions = {}
): Promise<CoordinatorPermissionResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const token = authHeader.substring(7);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
    };
  }

  const access = await loadCoordinatorAccessForUser(user.id, {
    repair: options.repair ?? true,
  });

  if (!access.ok || !access.account) {
    return {
      ok: false,
      status: access.status,
      error: access.error || "Coordinator access required",
    };
  }

  let permissions: Set<string>;
  try {
    const effective = await loadEffectiveAccountPermissions(user.id, "coordinator");
    permissions = effective.permissions;
  } catch (permissionsError) {
    console.error(
      "[coordinator/permissions] account permission lookup failed:",
      permissionsError
    );
    return {
      ok: false,
      status: 500,
      error: "Failed to resolve coordinator permissions",
    };
  }

  if (
    options.anyPermissions &&
    options.anyPermissions.length > 0 &&
    !options.anyPermissions.some((permission) => permissions.has(permission))
  ) {
    return {
      ok: false,
      status: 403,
      error: "Missing required permission",
    };
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      email: access.account.email || null,
      permissions,
      account: access.account,
      coordinator: access.coordinator,
    },
  };
}
