import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { SettingsView } from "@/components/account/views";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <AccountShell title="Settings" description="Defaults for the trading ticket and the chart.">
      <SettingsView />
    </AccountShell>
  );
}
