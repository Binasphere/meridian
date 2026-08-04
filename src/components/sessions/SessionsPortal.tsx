"use client";

import { useCallback, useEffect, useState } from "react";
import { hostToken, setHostToken } from "@/lib/sessions/client";
import { ToastHost } from "@/components/admin/ui";
import { HostConsole } from "./HostConsole";
import { HostGate } from "./HostGate";

/**
 * `/sessions` — the promo host's own page.
 *
 * Which of the two surfaces to render is decided by whether a token is held,
 * not by asking the server: the console behind this door shows a host their own
 * broadcasts and nobody else's, so a stale token costs one wasted request and
 * an immediate bounce back to the gate rather than a leak. That is the
 * difference from `AdminPanel`, which paints nothing until the server has
 * answered because what is behind *that* door is everybody's data.
 *
 * Nothing renders on the first pass, because reading `localStorage` during
 * render would disagree with the server-rendered HTML.
 */
export function SessionsPortal() {
  const [phase, setPhase] = useState<"checking" | "out" | "in">("checking");

  useEffect(() => {
    setPhase(hostToken() ? "in" : "out");
  }, []);

  const signOut = useCallback(() => {
    setHostToken(null);
    setPhase("out");
  }, []);

  if (phase === "checking") {
    return <div className="adm-root min-h-dvh" />;
  }

  if (phase === "out") {
    return <HostGate onSignedIn={() => setPhase("in")} />;
  }

  return (
    <ToastHost>
      <HostConsole onSignedOut={signOut} />
    </ToastHost>
  );
}
