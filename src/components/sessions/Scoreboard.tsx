"use client";

import { formatMoney } from "@/lib/format";
import { type PromoSession } from "@/lib/sessions/types";
import { cn } from "@/lib/utils";
import { StatTile } from "@/components/admin/ui";

/**
 * What a broadcast is worth, as five figures.
 *
 * The order is the order the questions get asked: how much came in, from how
 * many *new* people, how many signed up, what is still in the air, and what it
 * cost to run.
 *
 * Net — takings less promotion — is deliberately absent. It is the figure the
 * business is judged on rather than the one the host is, and it belongs to the
 * admin console (`admin/SessionsView`), which is the only surface that shows
 * it. The host gets what they can act on while live: is money coming in, from
 * new people, and is anything stuck.
 *
 * Pending money is shown apart from the takings and never added to them. A
 * push that M-Pesa has not confirmed is not a shilling anybody has, and a
 * scoreboard that counted it would show a broadcast in profit minutes before
 * discovering it was not.
 */
export function Scoreboard({ session }: { session: PromoSession }) {
  const { stats } = session;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatTile
        label="Collected"
        value={formatMoney(stats.depositMinor, { currency: "KSh" })}
        hint={
          stats.depositCount === 0
            ? "No deposits yet"
            : `${stats.depositCount} ${
                stats.depositCount === 1 ? "deposit" : "deposits"
              } from ${stats.depositors} ${
                stats.depositors === 1 ? "person" : "people"
              }`
        }
      />

      <StatTile
        label="New customers"
        value={stats.newDepositors}
        hint="Depositing for the first time ever"
      />

      <StatTile
        label="Sign-ups"
        value={stats.signups}
        hint="Accounts created while you were live"
      />

      <StatTile
        label="Awaiting M-Pesa"
        value={stats.pendingCount}
        hint={
          <>
            {formatMoney(stats.pendingMinor, { currency: "KSh" })} not confirmed
            yet
            {stats.failedCount > 0 ? (
              <>
                {" · "}
                {stats.failedCount} cancelled
              </>
            ) : null}
          </>
        }
      />

      <StatTile
        label="Promotion cost"
        value={formatMoney(session.spendMinor, { currency: "KSh" })}
        hint="Entered before you went live"
      />
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
