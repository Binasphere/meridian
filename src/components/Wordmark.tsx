"use client";

import { cn } from "@/lib/utils";
import { useDomainLabel } from "@/lib/useDomainLabel";

/**
 * The wordmark: a mark that is the same everywhere, and a name that is not.
 *
 * The glyph is a great circle crossing a sphere — drawn rather than imported so
 * it inherits `currentColor` and stays crisp at every size. A logo that is a
 * PNG is a logo that is blurry on someone's display.
 *
 * The **text is the domain**, read from the address bar. One build answers on
 * every domain, so a hardcoded name was correct on exactly one of them and a
 * lie on the rest — a customer on candixfx.com was being shown another
 * product's name in the header of the app they were trading in. The domain is
 * the only label that is true wherever it is rendered.
 *
 * It arrives one frame after hydration (see `useDomainLabel`), so the slot
 * reserves its height from the start: the mark and the layout never move, a
 * word simply appears.
 */
export function Wordmark({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  const domain = useDomainLabel();
  return (
    <span className={cn("flex items-center gap-2 text-ink", className)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-[1.25em] w-[1.25em] shrink-0"
        aria-hidden
      >
        <circle
          cx="12"
          cy="12"
          r="9.25"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.35"
        />
        {/* The ellipse that reads as a great circle in projection. */}
        <ellipse
          cx="12"
          cy="12"
          rx="4.25"
          ry="9.25"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.55"
        />
        <path
          d="M2.75 12h18.5"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.35"
        />
        {/* The mark's one solid element, sitting on the great circle. */}
        <circle cx="12" cy="7.4" r="2.1" fill="currentColor" />
      </svg>

      {showText ? (
        // `min-h-[1lh]` holds the line's height while the label is absent, so
        // nothing beside the mark reflows when it arrives.
        <span
          className="min-h-[1lh] text-[15px] font-semibold tracking-[-0.01em]"
          // Announced only once it says something. An empty live label read out
          // as the page loads is noise.
          aria-label={domain ?? undefined}
        >
          {domain}
        </span>
      ) : null}
    </span>
  );
}
