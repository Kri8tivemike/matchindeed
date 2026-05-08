import type { SupabaseClient } from "@supabase/supabase-js";

type ProgressRow = {
  profile_completed?: boolean | null;
  preferences_completed?: boolean | null;
};

type ProfileRow = {
  profile_completed?: boolean | null;
  preferences_completed?: boolean | null;
};

type PreferencesRow = {
  preferences_completed?: boolean | null;
};

export type ResolvedUserProgress = {
  profile_completed: boolean;
  preferences_completed: boolean;
};

const PROFILE_EDIT_PATH = "/dashboard/profile/edit";
const PROFILE_PREFERENCES_PATH = "/dashboard/profile/preferences";
const DEFAULT_COMPLETED_REDIRECT = "/dashboard/discover";

function isOnboardingPath(path: string) {
  return (
    path === PROFILE_EDIT_PATH ||
    path.startsWith(`${PROFILE_EDIT_PATH}?`) ||
    path === PROFILE_PREFERENCES_PATH ||
    path.startsWith(`${PROFILE_PREFERENCES_PATH}?`)
  );
}

export async function resolveUserProgressState(
  supabase: Pick<SupabaseClient, "from">,
  userId: string
): Promise<ResolvedUserProgress> {
  const [{ data: progress, error: progressError }, { data: profile, error: profileError }, { data: preferences, error: preferencesError }] =
    await Promise.all([
      supabase
        .from("user_progress")
        .select("profile_completed, preferences_completed")
        .eq("user_id", userId)
        .maybeSingle<ProgressRow>(),
      supabase
        .from("user_profiles")
        .select("profile_completed, preferences_completed")
        .eq("user_id", userId)
        .maybeSingle<ProfileRow>(),
      supabase
        .from("user_preferences")
        .select("preferences_completed")
        .eq("user_id", userId)
        .maybeSingle<PreferencesRow>(),
    ]);

  if (progressError && progressError.code !== "PGRST116") {
    throw progressError;
  }

  if (profileError && profileError.code !== "PGRST116") {
    throw profileError;
  }

  if (preferencesError && preferencesError.code !== "PGRST116") {
    throw preferencesError;
  }

  const resolved = {
    profile_completed: Boolean(
      progress?.profile_completed || profile?.profile_completed
    ),
    preferences_completed: Boolean(
      progress?.preferences_completed ||
        preferences?.preferences_completed ||
        profile?.preferences_completed
    ),
  };

  const needsRepair =
    !progress ||
    Boolean(progress.profile_completed) !== resolved.profile_completed ||
    Boolean(progress.preferences_completed) !== resolved.preferences_completed;

  if (needsRepair) {
    const { error: repairError } = await supabase.from("user_progress").upsert(
      {
        user_id: userId,
        profile_completed: resolved.profile_completed,
        preferences_completed: resolved.preferences_completed,
      },
      { onConflict: "user_id" }
    );

    if (repairError) {
      throw repairError;
    }
  }

  return resolved;
}

export function resolvePostLoginRedirect(
  progress: ResolvedUserProgress,
  nextPath?: string | null
) {
  if (!progress.profile_completed) {
    return PROFILE_EDIT_PATH;
  }

  if (!progress.preferences_completed) {
    return PROFILE_PREFERENCES_PATH;
  }

  const safeNext =
    typeof nextPath === "string" && nextPath.startsWith("/") ? nextPath : null;

  if (!safeNext || safeNext === "/dashboard" || isOnboardingPath(safeNext)) {
    return DEFAULT_COMPLETED_REDIRECT;
  }

  return safeNext;
}
