import type { Metadata } from "next";
import { ForgotPasswordPage } from "@/components/auth/PasswordPages";
import { NO_INDEX } from "@/lib/site";

export const metadata: Metadata = { title: "Forgot password", robots: NO_INDEX };

export default function Page() {
  return <ForgotPasswordPage />;
}
