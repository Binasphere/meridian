import { cn } from "@/lib/utils";

/**
 * The waiting spinner.
 *
 * `size` is the diameter in px. `onColor` draws it in white for use inside a
 * filled button (the green submit, Deposit); otherwise it takes the theme's
 * ink and green. Announced as busy to assistive tech via `label`.
 */
export function Spinner({
  size = 16,
  onColor = false,
  label,
  className,
}: {
  size?: number;
  onColor?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("loader", onColor && "loader-on-color", className)}
      style={{ "--size": `${size / 48}px` } as React.CSSProperties}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
