import { cn } from "@/lib/utils";

/**
 * The Venti wordmark.
 *
 * The glyph is a great circle crossing a sphere — drawn rather than imported so
 * it inherits `currentColor` and stays crisp at every size. A logo that is a
 * PNG is a logo that is blurry on someone's display.
 */
export function Wordmark({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
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
        <span className="text-[15px] font-semibold tracking-[-0.01em]">
          Venti
        </span>
      ) : null}
    </span>
  );
}
