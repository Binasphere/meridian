import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { PerformanceView } from "@/components/account/views";

export const metadata: Metadata = { title: "Session performance" };

export default function Page() {
  return (
    <AccountShell title="Session performance" description="Your strike rate against the rate you actually need to break even.">
      <PerformanceView />
    </AccountShell>
  );
}
