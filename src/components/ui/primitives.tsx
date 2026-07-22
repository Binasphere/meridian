"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The small set of primitives everything else is assembled from.
 *
 * Kept deliberately few. A design system's coherence comes from having one
 * button rather than eleven, and from every surface in the app being the same
 * `Panel` at a different size.
 */

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function Panel({
  className,
  flat = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { flat?: boolean }) {
  return (
    <div
      className={cn(flat ? "panel-flat" : "panel", "relative", className)}
      {...props}
    />
  );
}

export function PanelHeader({
  className,
  children,
  action,
}: {
  className?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-muted">
        {children}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-base hover:bg-white active:bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,.4)]",
  secondary:
    "bg-surface-3 text-ink hover:bg-surface-4 border border-line-strong",
  ghost: "text-ink-secondary hover:text-ink hover:bg-surface-3",
  danger: "bg-down/12 text-down hover:bg-down/20 border border-down/30",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] rounded-none gap-1.5",
  md: "h-10 px-4 text-sm rounded-none gap-2",
  lg: "h-12 px-5 text-[15px] rounded-none gap-2",
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>(function Button(
  { className, variant = "secondary", size = "md", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium",
        "transition-[background-color,color,transform,opacity] duration-150",
        "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
});

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "up" | "down" | "accent" | "warning";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-3 text-ink-secondary border-line-strong",
    up: "bg-up/12 text-up border-up/25",
    down: "bg-down/12 text-down border-down/25",
    accent: "bg-accent/12 text-accent border-accent/25",
    warning: "bg-warning/12 text-warning border-warning/25",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-none border px-1.5 py-0.5",
        "text-[10px] font-semibold uppercase tracking-[0.07em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
  size = "sm",
}: {
  options: ReadonlyArray<{ value: T; label: React.ReactNode; title?: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-none border border-line bg-surface-1 p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            role="tab"
            aria-selected={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-none font-medium transition-colors duration-150",
              size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-9 px-3.5 text-[13px]",
              active
                ? "bg-surface-4 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"
                : "text-ink-muted hover:text-ink-secondary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "up" | "down";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
        {label}
      </div>
      <div
        className={cn(
          "tnum mt-1 truncate font-mono text-[19px] leading-none tracking-tight",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1.5 truncate text-[11.5px] text-ink-muted">{hint}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function Empty({
  icon,
  title,
  hint,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? <div className="text-ink-faint">{icon}</div> : null}
      <div className="text-[13px] font-medium text-ink-secondary">{title}</div>
      {hint ? (
        <div className="max-w-[240px] text-[12px] leading-relaxed text-ink-faint">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live dot
// ---------------------------------------------------------------------------

export function LiveDot({ tone = "up" }: { tone?: "up" | "warning" }) {
  const color = tone === "up" ? "bg-up" : "bg-warning";
  return (
    <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
      <span className={cn("absolute inset-0 rounded-full pulse-ring", color)} />
      <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", color)} />
    </span>
  );
}
