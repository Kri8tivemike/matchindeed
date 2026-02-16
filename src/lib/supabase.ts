import { createBrowserClient } from "@supabase/ssr";
import { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Supabase client for browser-side use with proper cookie/localStorage handling.
 * Uses @supabase/ssr for proper Next.js integration with session persistence.
 */
let supabaseInstance: SupabaseClient | null = null;

/**
 * Get the Supabase browser client instance.
 * This client properly handles session storage in localStorage.
 */
export function getSupabase(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
            }

  // createBrowserClient from @supabase/ssr properly handles localStorage
  supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey);

  return supabaseInstance;
}

// Export the client for use throughout the app
export const supabase = getSupabase();

