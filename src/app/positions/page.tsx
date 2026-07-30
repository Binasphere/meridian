import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { PositionsPage } from "@/components/account/views";

export const metadata: Metadata = { title: "Positions" };

export default function Page() {
  return (
    <AccountShell
      title="Positions"
      description="Contracts running now, and every one that has settled."
    >
      <PositionsPage />
    </AccountShell>
  );
}
