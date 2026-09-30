import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { MarketsPage } from "@/components/account/MarketsPage";

export const metadata: Metadata = {
  title: "Markets",
  description: "Every market you can trade, with its live price and change.",
  alternates: { canonical: "/markets" },
};

export default function Page() {
  return (
    <AccountShell title="Markets" publicPage>
      <MarketsPage />
    </AccountShell>
  );
}
