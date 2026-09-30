import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { ChatPage } from "@/components/account/ChatPage";
import { NO_INDEX } from "@/lib/site";

export const metadata: Metadata = { title: "Live chat", robots: NO_INDEX };

export default function Page() {
  return (
    <AccountShell title="Live chat">
      <ChatPage />
    </AccountShell>
  );
}
