"use client";

import { useApplyTheme } from "@/lib/prefs";
import { useUi } from "@/lib/ui";
import { CashDialog } from "./CashDialog";
import { DepositNumberDialog } from "./DepositNumberDialog";
import { NavDrawer } from "./NavDrawer";

/**
 * Everything that opens over a page: the menu, the money dialogs and the
 * deposit number. Mounted once per page shell so the drawer, the header and
 * the tab bar all open the same instance.
 */
export function Overlays() {
  useApplyTheme();
  const cash = useUi((s) => s.cash);
  const setCash = useUi((s) => s.setCash);

  return (
    <>
      <NavDrawer />
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
