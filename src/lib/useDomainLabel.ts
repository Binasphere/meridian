"use client";

import { useEffect, useState } from "react";
import { currentBrandLabel, currentDomainLabel } from "./sites";

/**
 * The domain the customer is on, once the browser can tell us.
 *
 * Null through the server render and the first client render, then the host.
 * Because the first client render matches the server's exactly, there is no
 * hydration mismatch to suppress — the value simply arrives on the effect.
 *
 * Every consumer must render its layout around the absence rather than
 * collapsing: a wordmark that has no width until hydration shifts everything
 * beside it a frame later, which is worse than a label that fades in.
 */
export function useDomainLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(currentDomainLabel());
  }, []);

  return label;
}

/** The short brand ("venti"), on the same one-frame delay as the domain. */
export function useBrandLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(currentBrandLabel());
  }, []);
  return label;
}
