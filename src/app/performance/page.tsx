import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { PerformancePage } from "@/components/account/views";
import { NO_INDEX } from "@/lib/site";

// One person's running P&L.
export const metadata: Metadata = { title: "Performance", robots: NO_INDEX };

export default function Page() {
  return (
    <AccountShell
      title="Performance"
      description="How this session is going, and what the market you are trading actually pays."
    >
      <PerformancePage />
    </AccountShell>
  );
}
