"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";

type DashboardAccessContextValue = {
  walletAccessEnabled: boolean;
  walletAccessLoading: boolean;
  refreshWalletAccess: () => Promise<void>;
};

const DashboardAccessContext = createContext<DashboardAccessContextValue | null>(
  null
);

export function DashboardAccessProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [walletAccessEnabled, setWalletAccessEnabled] = useState(false);
  const [walletAccessLoading, setWalletAccessLoading] = useState(true);

  const refreshWalletAccess = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setWalletAccessEnabled(false);
        return;
      }

      const { data } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", session.user.id)
        .gt("price_cents", 0)
        .limit(1)
        .maybeSingle();

      setWalletAccessEnabled(Boolean(data?.id));
    } catch {
      setWalletAccessEnabled(false);
    } finally {
      setWalletAccessLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshWalletAccess();
  }, [refreshWalletAccess]);

  const value = useMemo(
    () => ({
      walletAccessEnabled,
      walletAccessLoading,
      refreshWalletAccess,
    }),
    [refreshWalletAccess, walletAccessEnabled, walletAccessLoading]
  );

  return (
    <DashboardAccessContext.Provider value={value}>
      {children}
    </DashboardAccessContext.Provider>
  );
}

export function useDashboardAccess() {
  const context = useContext(DashboardAccessContext);

  if (!context) {
    return {
      walletAccessEnabled: false,
      walletAccessLoading: true,
      refreshWalletAccess: async () => {},
    } satisfies DashboardAccessContextValue;
  }

  return context;
}
