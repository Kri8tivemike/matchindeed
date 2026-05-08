import { requireUnlockedWalletAccess } from "@/lib/subscription/server-wallet-access";

export default async function WalletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUnlockedWalletAccess();
  return children;
}
