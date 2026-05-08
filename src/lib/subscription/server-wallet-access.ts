import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasUnlockedWalletAccess } from "@/lib/subscription/permissions";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function requireUnlockedWalletAccess(source = "wallet_locked") {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // No-op in server component redirects.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const unlocked = await hasUnlockedWalletAccess(user.id);
  if (!unlocked) {
    redirect(`/dashboard/profile/subscription?source=${encodeURIComponent(source)}`);
  }

  return user;
}
