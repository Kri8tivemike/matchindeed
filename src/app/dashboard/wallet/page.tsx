import WalletPage from "../profile/wallet/page";
import { requireUnlockedWalletAccess } from "@/lib/subscription/server-wallet-access";

export default async function DashboardWalletPage() {
  await requireUnlockedWalletAccess();
  return <WalletPage />;
}
