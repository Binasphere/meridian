"use client";

import { type PromoSession } from "@/lib/sessions/types";
import { Card } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

/**
 * What a broadcast is doing, as three numbers.
 *
 * **No money.** Not the takings, not the promotion cost, not the pending
 * amount. A host is paid for running the live, not for what it collected, and a
 * desk showing a shilling total to somebody who is on camera is a desk that
 * eventually reads it out. The figures are withheld by the server, not by this
 * component — `/api/sessions/me` never sends them — so there is nothing here to
 * reveal by opening devtools.
 *
 * What is left is what a host can actually act on mid-live: are people paying,
 * are they new, and is anyone signing up. Five tiles of mixed money and counts
 * became three counts, which is both more useful on a phone held in one hand
 * and the only version that is theirs to see.
 *
 * Pending and failed pushes moved to a single line underneath. They matter when
 * they are non-zero and are noise the rest of the time, which is the definition
 * of something that should not hold a tile.
 */
export function Scoreboard({ session }: { session: PromoSession }) {
  const { stats } = session;

  const stuck = stats.pendingCount > 0 || stats.failedCount > 0;

  return (
    // A card on the console's own surface. These figures were bare on the page
    // background and wearing the *terminal's* dark-theme tokens — `text-ink`,
    // `divide-line` — inside a light `adm-root` shell, so they rendered as
    // near-invisible text sitting on nothing. Two systems, one page, and the
    // wrong one had been reached for.
    <Card className="overflow-hidden">
      <p className="border-b border-adm-line px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-adm-ink-3">
        Right now
      </p>

      <dl className="grid grid-cols-3 divide-x divide-adm-line">
        <Figure
          label="Paying"
          value={stats.depositors}
          hint={`${stats.depositCount} ${stats.depositCount === 1 ? "deposit" : "deposits"}`}
        />
        <Figure
          label="New"
          value={stats.newDepositors}
          hint="first time ever"
          accent
        />
        <Figure label="Sign-ups" value={stats.signups} hint="while you were live" />
      </dl>

      {stuck ? (
        <p className="border-t border-adm-line bg-adm-subtle px-4 py-2.5 text-[12px] text-adm-ink-3">
          {stats.pendingCount > 0
            ? `${stats.pendingCount} ${
                stats.pendingCount === 1 ? "push" : "pushes"
              } waiting on M-Pesa`
            : null}
          {stats.pendingCount > 0 && stats.failedCount > 0 ? " · " : null}
          {stats.failedCount > 0 ? `${stats.failedCount} cancelled` : null}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * One count.
 *
 * Large, quiet, and mono — the numbers move while a host watches them, and a
 * proportional face makes a figure jump sideways every time a digit changes.
 */
function Figure({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="px-3 py-4 text-center sm:px-4 sm:py-5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-adm-ink-3">
        {label}
      </dt>
      <dd
        className={cn(
          "tnum mt-2 font-mono text-[28px] leading-none tracking-[-0.02em] sm:text-[34px]",
          accent ? "text-adm-pos" : "text-adm-ink",
        )}
      >
        {value}
      </dd>
      <p className="mt-1.5 text-[11px] text-adm-ink-4">{hint}</p>
    </div>
  );
}

/** The on-air marker: a dot that pulses, and the word, because colour alone is not a state. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 w-2 shrink-0 animate-pulse bg-adm-neg",
        className,
      )}
    />
  );
}
