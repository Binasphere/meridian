import type { Metadata } from "next";
import { ResetPasswordPage } from "@/components/auth/PasswordPages";
import { NO_INDEX } from "@/lib/site";

export const metadata: Metadata = { title: "Reset password", robots: NO_INDEX };

export default function Page() {
  return <ResetPasswordPage />;
}
