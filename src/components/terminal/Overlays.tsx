"use client";

import { useEffect } from "react";
import { useApplyTheme } from "@/lib/prefs";
import { captureReferral } from "@/lib/referral";
import { useUi } from "@/lib/ui";
import { CashDialog } from "./CashDialog";
import { DepositNumberDialog } from "./DepositNumberDialog";
import { NavDrawer } from "./NavDrawer";
import { VerificationDialog } from "./VerificationDialog";

/**
 * Everything that opens over a page: the menu, the money dialogs and the
 * deposit number. Mounted once per page shell so the drawer, the header and
 * the tab bar all open the same instance.
 */
export function Overlays() {
  useApplyTheme();
  // `?ref=CODE` from a friend's link, kept until sign-up sends it.
  useEffect(() => captureReferral(), []);
  const cash = useUi((s) => s.cash);
  const setCash = useUi((s) => s.setCash);

  return (
    <>
      <NavDrawer />
      <VerificationDialog />
      <DepositNumberDialog />
      {cash ? (
        <CashDialog
          mode={cash}
          open
          onOpenChange={(next) => !next && setCash(null)}
        />
      ) : null}
    </>
  );
}
