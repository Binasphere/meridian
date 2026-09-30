import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { NewsPage } from "@/components/account/NewsPage";

export const metadata: Metadata = {
  title: "Market news",
  description: "Crypto, market and forex headlines.",
  alternates: { canonical: "/news" },
};

export default function Page() {
  return (
    <AccountShell title="Market news" publicPage>
      <NewsPage />
    </AccountShell>
  );
}
