import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { MarketView } from "@/components/account/views";

export const metadata: Metadata = { title: "Selected market" };

export default function Page() {
  return (
    <AccountShell title="Selected market" description="What the instrument on your chart is, and what it pays.">
      <MarketView />
    </AccountShell>
  );
}
