"use client";

import { useEffect, useState } from "react";

/**
 * A value that re-renders once a second, for clocks.
 *
 * Both the host's desk and the admin console show a broadcast's elapsed time
 * ticking, and both get it from here rather than from the server: the start
 * timestamp is the only fact needed, and asking a server what time it is once a
 * second would be absurd.
 *
 * Stops entirely when `running` is false, so a page with nothing on air is not
 * repainting for nothing.
 */
export function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  return now;
}
