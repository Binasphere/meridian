import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { PerformancePage } from "@/components/account/views";

export const metadata: Metadata = { title: "Performance" };

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
