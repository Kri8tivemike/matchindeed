import { supabase } from "./supabase";

/**
 * Get the current authenticated user
 * Uses getSession instead of getUser to avoid AuthSessionMissingError when not logged in
 */
export async function getCurrentUser() {
  try {
    // Try getSession first (doesn't throw error if no session)
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session || !session.user) {
      // Check if it's a session missing error (expected when not logged in)
      if (error?.message?.includes("session") || error?.message?.includes("missing")) {
        // This is expected - user is not logged in
        return null;
      }
      return null;
    }
    
    return session.user;
  } catch (error: any) {
    // Handle AuthSessionMissingError specifically
    if (error?.name === "AuthSessionMissingError" || error?.message?.includes("session missing")) {
      // This is expected when user is not logged in - not an error
      return null;
    }
    console.error("Error getting current user:", error);
    return null;
  }
}

/**
 * Safely get user without throwing AuthSessionMissingError
 * Use this when you want to check if user is logged in without errors
 */
export async function getCurrentUserSafe() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
  } catch (error: any) {
    // Handle AuthSessionMissingError specifically
    if (error?.name === "AuthSessionMissingError" || error?.message?.includes("session missing")) {
      return null;
    }
    console.error("Error getting user:", error);
    return null;
  }
}

/**
 * Check if user has completed profile
 */
export async function checkProfileCompletion(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_progress")
    .select("profile_completed")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.profile_completed || false;
}

/**
 * Check if user has completed preferences
 */
export async function checkPreferencesCompletion(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_progress")
    .select("preferences_completed")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.preferences_completed || false;
}

/**
 * Get user's completion status
 */
export async function getUserCompletionStatus(userId: string) {
  const { data, error } = await supabase
    .from("user_progress")
    .select("profile_completed, preferences_completed")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return {
      profile_completed: false,
      preferences_completed: false,
    };
  }

  return {
    profile_completed: data.profile_completed || false,
    preferences_completed: data.preferences_completed || false,
  };
}

/**
 * Check if a user is an administrator
 * 
 * This function checks for admin status in multiple ways:
 * 1. Checks if user has 'admin' role in accounts table (if role column exists)
 * 2. Checks if user email is in the admin emails list (from environment variable)
 * 3. Checks user metadata for admin flag
 * 
 * @param userId - The user ID to check
 * @returns Promise<boolean> - True if user is an admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    // Method 1: Check accounts table for role column (if it exists)
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("role, email")
      .eq("id", userId)
      .single();

    if (!accountError && account) {
      // Check if role column exists and user has admin role
      if (account.role === "admin" || account.role === "super_admin") {
        return true;
      }

      // Method 2: Check if email is in admin emails list
      const adminEmails = process.env.ADMIN_EMAILS?.split(",").map((e) => e.trim()) || [];
      if (account.email && adminEmails.includes(account.email.toLowerCase())) {
        return true;
      }
    }

    // Method 3: Check user metadata
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (!userError && user) {
      // Check user metadata for admin flag
      if (user.user_metadata?.is_admin === true || user.user_metadata?.role === "admin") {
        return true;
      }

      // Check app_metadata for admin flag
      if (user.app_metadata?.is_admin === true || user.app_metadata?.role === "admin") {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

/**
 * Get authenticated user and verify admin status
 * 
 * @param request - NextRequest object (optional, for extracting auth headers)
 * @returns Promise<{ user: User | null, isAdmin: boolean }>
 */
export async function getAuthenticatedAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, isAdmin: false };
  }

  const adminStatus = await isAdmin(user.id);
  return { user, isAdmin: adminStatus };
}

