"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The admin console's own small set of primitives.
 *
 * Separate from `components/ui/primitives.tsx` on purpose. Those are built for
 * the terminal's dark surfaces; these are built for a light one. What the two
 * sets share is the geometry — everything here is square, because rounded
 * corners in a back office read as consumer software and the product this
 * administers is not that.
 *
 * The premium is meant to come from restraint: hairline borders, one accent,
 * generous white space, and no shadows, gradients or decorative icons.
 */

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("adm-card", className)} {...props} />;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-adm-line px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-adm-ink">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-[12.5px] text-adm-ink-3">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  // Near-black rather than the accent blue. On a light console the blue is
  // wanted for *state* — active nav, focus, selection — and spending it on
  // every button leaves nothing to mark those with.
  primary: "bg-adm-ink text-white hover:bg-[#1d2338]",
  secondary:
    "bg-adm-surface text-adm-ink-2 border border-adm-line-strong hover:bg-adm-subtle hover:text-adm-ink",
  ghost: "text-adm-ink-3 hover:bg-adm-subtle hover:text-adm-ink",
};

export function Button({
  className,
  variant = "secondary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 select-none items-center justify-center gap-1.5 rounded-none px-3",
        "text-[13px] font-medium transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-adm-accent",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "accent" | "positive";
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-adm-subtle text-adm-ink-2 border-adm-line-strong",
    accent: "bg-adm-accent-tint text-adm-accent-deep border-adm-accent-line",
    positive: "bg-[#e8f6ef] text-adm-pos border-[#c4e6d6]",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-none border px-1.5 py-[2px]",
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
// Stat tile
// ---------------------------------------------------------------------------

/**
 * A number that is the whole answer.
 *
 * Label, figure, one line of context — and nothing else. No icon: a decorative
 * glyph in the corner of a KPI tile carries no information, and four of them in
 * a row is the difference between a set of figures and a dashboard template.
 *
 * The value uses the font's default proportional figures, not tabular. At 28px
 * tabular gives every digit the width of a zero, and a number like "121" reads
 * gappy; tabular belongs in the table's columns, where digits must line up.
 */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <span className="adm-eyebrow">{label}</span>
      <div className="mt-3 text-[28px] font-semibold leading-none tracking-[-0.025em] text-adm-ink">
        {value}
      </div>
      {hint ? (
        <div className="mt-2.5 text-[12.5px] leading-snug text-adm-ink-3">{hint}</div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

/**
 * The console's own notifications.
 *
 * The app's global `sonner` Toaster lives in the root layout and is styled with
 * the terminal's dark `panel` class — a toast from here would arrive as a black
 * slab in the middle of a white console. A second Toaster instance would
 * duplicate every toast, so the console carries its own tiny stack instead.
 *
 * This is the one surface that gets a shadow: it genuinely floats above the
 * page, and without one it reads as a card that has come loose.
 */

interface Note {
  id: number;
  tone: "success" | "error";
  title: string;
  body?: string;
}

const NotifyContext = createContext<(note: Omit<Note, "id">) => void>(() => {});

export function useNotify() {
  return useContext(NotifyContext);
}

const NOTE_TTL_MS = 5_000;

export function ToastHost({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);

  const dismiss = useCallback((id: number) => {
    setNotes((current) => current.filter((note) => note.id !== id));
  }, []);

  const notify = useCallback((note: Omit<Note, "id">) => {
    setNotes((current) => [...current, { ...note, id: Date.now() + Math.random() }]);
  }, []);

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[330px] max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {notes.map((note) => (
          <Toast key={note.id} note={note} onDismiss={() => dismiss(note.id)} />
        ))}
      </div>
    </NotifyContext.Provider>
  );
}

function Toast({ note, onDismiss }: { note: Note; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, NOTE_TTL_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const success = note.tone === "success";

  return (
    <div
      className="adm-card pointer-events-auto flex items-start gap-3 p-3.5 shadow-[0_10px_30px_-12px_rgba(16,20,38,.25)]"
      style={{ animation: "adm-toast-in 220ms cubic-bezier(0.22,1,0.36,1)" }}
    >
      {/* Icon + wording carry the outcome, not colour alone. */}
      <span
        className={cn(
          "mt-px grid h-5 w-5 shrink-0 place-items-center",
          success ? "bg-[#e8f6ef] text-adm-pos" : "bg-[#fdeceb] text-adm-neg",
        )}
      >
        {success ? <Check size={12} strokeWidth={3} /> : <AlertCircle size={12} />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-adm-ink">{note.title}</p>
        {note.body ? (
          <p className="mt-0.5 text-[12.5px] leading-snug text-adm-ink-3">{note.body}</p>
        ) : null}
      </div>

      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 p-1 text-adm-ink-4 transition-colors hover:text-adm-ink-2"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

/**
 * A deterministic avatar, stepped for a light surface.
 *
 * `avatarFrom` in `lib/format.ts` returns a dark two-stop gradient built for the
 * terminal; the same hues at those lightnesses are near-black on white. This is
 * the same idea re-stepped: a pale tint with its own hue's dark text, which
 * measures 4.5:1 or better at every hue including the awkward yellows.
 */
export function avatarTint(seed: string, displayName: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;

  const initials =
    displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "?";

  return {
    initials,
    background: `hsl(${hue} 60% 94%)`,
    color: `hsl(${hue} 45% 28%)`,
  };
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

/** A loading placeholder shaped like the thing that will replace it. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse bg-adm-subtle", className)} aria-hidden />
  );
}

// ---------------------------------------------------------------------------
// Tier meter
// ---------------------------------------------------------------------------

/**
 * The Standard/VIP split as one proportion bar.
 *
 * Two segments separated by a 2px gap in the surface colour rather than by a
 * stroke — the gap is what makes adjacent fills read as distinct without adding
 * ink that isn't data. A legend is always present because there are two series,
 * and both counts are labelled, so identity never rests on hue alone.
 */
export function TierMeter({ standard, vip }: { standard: number; vip: number }) {
  const total = standard + vip;
  const segments = useMemo(
    () =>
      [
        {
          key: "STANDARD",
          label: "Standard",
          count: standard,
          color: "var(--color-adm-tier-standard)",
        },
        {
          key: "VIP",
          label: "VIP",
          count: vip,
          color: "var(--color-adm-tier-vip)",
        },
      ] as const,
    [standard, vip],
  );

  return (
    <div>
      <div
        className="flex h-2 gap-[2px] bg-adm-subtle"
        role="img"
        aria-label={`${standard} standard and ${vip} VIP of ${total} users`}
      >
        {total === 0
          ? null
          : segments
              .filter((segment) => segment.count > 0)
              .map((segment) => (
                <div
                  key={segment.key}
                  style={{
                    width: `${(segment.count / total) * 100}%`,
                    background: segment.color,
                  }}
                />
              ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0"
              style={{ background: segment.color }}
            />
            <span className="text-[12.5px] text-adm-ink-2">{segment.label}</span>
            <span className="tnum text-[12.5px] font-semibold text-adm-ink">
              {segment.count}
            </span>
            <span className="tnum text-[12px] text-adm-ink-3">
              {total === 0 ? "0%" : `${Math.round((segment.count / total) * 100)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
