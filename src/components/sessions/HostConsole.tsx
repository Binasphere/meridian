"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  History,
  Loader2,
  LogOut,
  Radio,
  RefreshCw,
  Square,
  Trophy,
  Wallet,
} from "lucide-react";
import { formatMoney, wholeToMinor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setHostToken } from "@/lib/sessions/client";
import {
  elapsedMs,
  formatElapsed,
  formatSpan,
  type HostSnapshot,
  type PromoSession,
} from "@/lib/sessions/types";
import { Button, Card, Skeleton, useNotify } from "@/components/admin/ui";
import { ColumnChart } from "@/components/admin/charts";
import { LiveDot, Scoreboard } from "./Scoreboard";
import { useNow } from "@/lib/sessions/useNow";
import { useHost } from "./useHost";

/**
 * The live desk.
 *
 * One host, one screen, and at most one thing to do on it: go live, or come off
 * air. Everything else is the answer to "is this working" — and that answer is
 * the reason the page exists, so it gets the space rather than the controls.
 *
 * The clock is the hero. A host running a three-hour live glances at this
 * between comments, and the two things they want in that glance are how long
 * they have been on and how much has come in.
 */
export function HostConsole({ onSignedOut }: { onSignedOut: () => void }) {
  const state = useHost(onSignedOut);
  const { snapshot, loading, error } = state;

  function signOut() {
    setHostToken(null);
    onSignedOut();
  }

  return (
    // The same shell as the admin console: a dark rail the full height of the
    // window, with the header living inside the scrolling column rather than
    // spanning both. That is what makes the rail read as the frame around the
    // page instead of a card that happens to be on the left.
    <div className="adm-root min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh lg:block">
        {snapshot ? <HostRail snapshot={snapshot} onSignOut={signOut} /> : null}
      </aside>

      <div className="flex min-w-0 flex-col">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-adm-line bg-adm-canvas/85 px-4 py-4 backdrop-blur-md sm:px-6">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-none bg-adm-ink text-white"
        >
          <Radio size={15} />
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-adm-ink">
            Live desk
          </h1>
          <p className="mt-0.5 truncate text-[12.5px] text-adm-ink-3">
            {snapshot ? snapshot.host.fullName : "Loading…"}
            {snapshot?.host.status === "SUSPENDED" ? " · suspended" : null}
          </p>
        </div>

        <Button
          onClick={() => void state.reload()}
          disabled={loading}
          title="Reload"
          aria-label="Reload"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
        </Button>
        <Button onClick={signOut} variant="ghost">
          <LogOut size={14} />
          Sign out
        </Button>
      </header>

      {/* Full width of its column. It was capped and centred, which left a
          three-hour clock floating in the middle of a laptop screen with air
          on both sides. */}
      <main className="w-full space-y-5 px-4 py-5 sm:px-6 lg:py-6">
        {error && !snapshot ? (
          <Card className="p-6">
            <p className="text-[13.5px] font-medium text-adm-ink">
              Could not load the desk
            </p>
            <p className="mt-1 text-[12.5px] text-adm-ink-3">{error}</p>
          </Card>
        ) : !snapshot ? (
          <LoadingSkeleton />
        ) : snapshot.live ? (
          <LivePanel session={snapshot.live} state={state} />
        ) : snapshot.blockedBy ? (
          <BlockedPanel blockedBy={snapshot.blockedBy} />
        ) : (
          <StartPanel state={state} suspended={snapshot.host.status === "SUSPENDED"} />
        )}

        {/* The rail's figures, for the phone that never sees the rail. Same
            three numbers, laid flat — a host on a phone is mid-live and wants
            the clock, not a second column. */}
        {snapshot ? <HostRecordStrip snapshot={snapshot} className="lg:hidden" /> : null}

        {snapshot ? <HostTrends snapshot={snapshot} /> : null}
      </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The side panel
// ---------------------------------------------------------------------------

/**
 * A host's own record, and what is coming — the dark rail.
 *
 * Deliberately the admin console's sidebar, down to the tokens: same ground,
 * same ink steps, same three bands top to bottom (who you are, your record,
 * what is next). One product should not have two chrome languages, and a host
 * who has watched an admin drive the console should recognise the furniture.
 *
 * Three figures, none of them money the host did not spend: lives run, total
 * time on air, and total promotion cost. The takings are absent for the same
 * reason they are absent from the scoreboard — a promoter is paid for the work,
 * not for what the work collected. The spend is theirs: they typed every one of
 * those numbers before going live, so totalling them is arithmetic on their own
 * input rather than a disclosure.
 *
 * "Coming soon" is shown greyed and inert rather than hidden. A link that looks
 * clickable and does nothing is a lie; a list that is visibly not ready is a
 * roadmap, and it tells a host the desk is being built for them.
 */
function HostRail({
  snapshot,
  onSignOut,
}: {
  snapshot: HostSnapshot;
  onSignOut: () => void;
}) {
  const { host } = snapshot;
  const record = hostRecord(snapshot);

  return (
    <div className="flex h-full flex-col border-r border-adm-nav-line bg-adm-nav">
      {/* --- Who you are ---------------------------------------------------- */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-none bg-adm-nav-raise text-[12px] font-semibold text-adm-nav-ink"
        >
          {initials(host.fullName)}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-semibold tracking-[-0.01em] text-adm-nav-ink">
            {host.fullName}
          </div>
          <div className="text-[11px] text-adm-nav-ink-3">
            {host.status === "SUSPENDED" ? "Suspended" : "Live desk"}
          </div>
        </div>
      </div>

      {/* --- Your record ---------------------------------------------------- */}
      <div className="px-3">
        <p className="px-2 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.09em] text-adm-nav-ink-3">
          Your record
        </p>
        <dl className="space-y-0.5">
          <RailFigure label="Lives run" value={record.count.toLocaleString()} />
          <RailFigure label="Time on air" value={formatSpan(record.onAirMs)} />
          <RailFigure
            label="Spent promoting"
            value={formatMoney(record.spent, { currency: "KSh", whole: true })}
          />
        </dl>
      </div>

      {/* --- What is next ---------------------------------------------------- */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="px-2 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-[0.09em] text-adm-nav-ink-3">
          Coming soon
        </p>
        <ul className="space-y-0.5">
          {UPCOMING.map((item) => (
            <li
              key={item.label}
              className="flex cursor-not-allowed items-center gap-2.5 rounded-none px-2.5 py-2 text-[13px] font-medium text-adm-nav-ink-3/60"
            >
              <item.icon size={15} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="shrink-0 border border-adm-nav-line px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-adm-nav-ink-3">
                Soon
              </span>
            </li>
          ))}
        </ul>
      </nav>

      {/* --- The way out ----------------------------------------------------- */}
      <div className="shrink-0 border-t border-adm-nav-line p-3">
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 rounded-none px-2.5 py-2 text-[13px] font-medium text-adm-nav-ink-2 transition-colors hover:bg-adm-nav-raise hover:text-adm-nav-ink"
        >
          <LogOut size={15} className="text-adm-nav-ink-3" />
          Sign out
        </button>
      </div>
    </div>
  );
}

function RailFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-none px-2.5 py-1.5">
      <dt className="text-[12.5px] text-adm-nav-ink-2">{label}</dt>
      <dd className="tnum text-[13px] font-medium text-adm-nav-ink">{value}</dd>
    </div>
  );
}

/** The same three figures, flat, for the phone that never sees the rail. */
function HostRecordStrip({
  snapshot,
  className,
}: {
  snapshot: HostSnapshot;
  className?: string;
}) {
  const record = hostRecord(snapshot);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <p className="border-b border-adm-line px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-adm-ink-3">
        Your record
      </p>
      <dl className="grid grid-cols-3 divide-x divide-adm-line">
        <StripFigure label="Lives run" value={record.count.toLocaleString()} />
        <StripFigure label="Time on air" value={formatSpan(record.onAirMs)} />
        <StripFigure
          label="Spent"
          value={formatMoney(record.spent, { currency: "KSh", whole: true })}
        />
      </dl>
    </Card>
  );
}

function StripFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-adm-ink-3">
        {label}
      </dt>
      <dd className="tnum mt-1.5 text-[15px] font-medium text-adm-ink">{value}</dd>
    </div>
  );
}

/**
 * A host's totals across everything they have run.
 *
 * The live session is counted alongside the history, because it is not in
 * `history` until it ends and a host who has just gone live for the first time
 * should not be told they have run none.
 */
function hostRecord(snapshot: HostSnapshot) {
  const all = snapshot.live ? [snapshot.live, ...snapshot.history] : snapshot.history;

  return {
    count: all.length,
    onAirMs: all.reduce((sum, session) => sum + elapsedMs(session, Date.now()), 0),
    spent: all.reduce(
      (sum, session) => sum + (session.spendMinor ? BigInt(session.spendMinor) : 0n),
      0n,
    ),
  };
}

/**
 * Two charts, because there are two units.
 *
 * Minutes on air and shillings spent promoting are not the same quantity, so
 * they never share an axis — a single plot with two scales would invent a
 * relationship between effort and cost that the data does not contain, and that
 * is the most common way a dashboard misleads. Two charts, one measure each,
 * both read against the same run of lives.
 *
 * Oldest to newest, left to right, so the shape is a trend rather than a list.
 * Neither chart has a legend: one series apiece, and the card title already
 * names what is plotted.
 *
 * Takings are absent here as everywhere on this desk. The two things a host may
 * see are the time they put in and the money they themselves put up.
 */
function HostTrends({ snapshot }: { snapshot: HostSnapshot }) {
  const days = useMemo(() => {
    const all = snapshot.live
      ? [snapshot.live, ...snapshot.history]
      : snapshot.history;
    if (all.length === 0) return null;

    const spend = new Map<string, bigint>();
    const minutes = new Map<string, number>();

    for (const session of all) {
      // Local date, not the ISO one: a live that starts at 01:00 EAT belongs to
      // the day the host was awake for, not to the previous UTC day.
      const key = dayKey(new Date(session.startedAt));
      spend.set(
        key,
        (spend.get(key) ?? 0n) +
          (session.spendMinor ? BigInt(session.spendMinor) : 0n),
      );
      minutes.set(
        key,
        (minutes.get(key) ?? 0) +
          Math.round(elapsedMs(session, Date.now()) / 60000),
      );
    }

    // Every day from the first live to today, gaps included. A day off is a
    // zero-height column and part of the picture — dropping it would squeeze
    // the busy days together and hide the very pattern this chart is for.
    const keys = [...spend.keys()].sort();
    const first = new Date(`${keys[0]}T00:00:00`);
    const filled: string[] = [];
    const cursor = new Date(first);
    const today = new Date();
    while (cursor <= today && filled.length < 120) {
      filled.push(dayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      labels: filled.map((key) =>
        new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        }),
      ),
      spend: filled.map((key) => Number((spend.get(key) ?? 0n) / 100n)),
      minutes: filled.map((key) => minutes.get(key) ?? 0),
    };
  }, [snapshot]);

  if (!days || days.labels.length < 2) return null;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <div className="border-b border-adm-line px-5 py-3.5">
          <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-adm-ink">
            Spent promoting
          </p>
          <p className="mt-0.5 text-[12px] text-adm-ink-3">
            Per day. The tallest day is labelled.
          </p>
        </div>
        <div className="px-5 py-4">
          <ColumnChart
            values={days.spend}
            labels={days.labels}
            format={(value) =>
              value >= 1000
                ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
                : String(Math.round(value))
            }
            emptyMessage="Nothing spent on promotion yet."
          />
        </div>
      </Card>

      <Card>
        <div className="border-b border-adm-line px-5 py-3.5">
          <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-adm-ink">
            Time on air
          </p>
          <p className="mt-0.5 text-[12px] text-adm-ink-3">
            Minutes broadcast per day.
          </p>
        </div>
        <div className="px-5 py-4">
          <ColumnChart
            values={days.minutes}
            labels={days.labels}
            format={(value) =>
              value >= 60 ? `${Math.round(value / 60)}h` : `${Math.round(value)}m`
            }
            emptyMessage="No lives recorded yet."
          />
        </div>
      </Card>
    </div>
  );
}

/** `2026-08-16` in the viewer's own timezone, for grouping by day. */
function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * What the desk is going to grow.
 *
 * Named as the things a host actually asks about between lives — what am I
 * owed, how am I doing against the others — rather than in generic feature
 * words. A roadmap that does not say anything is decoration.
 */
const UPCOMING = [
  { label: "My payouts", icon: Wallet },
  { label: "Leaderboard", icon: Trophy },
  { label: "Past lives", icon: History },
  { label: "Tips & guides", icon: BookOpen },
] as const;

/** `SO` from `Samuel Orina`. Two letters, because three is a monogram. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// On air
// ---------------------------------------------------------------------------

function LivePanel({
  session,
  state,
}: {
  session: PromoSession;
  state: ReturnType<typeof useHost>;
}) {
  const now = useNow(true);
  const notify = useNotify();
  const [confirming, setConfirming] = useState(false);

  async function end() {
    const result = await state.end(session.id);
    setConfirming(false);

    if (result.ok) {
      notify({
        tone: "success",
        title: "Session ended",
        body: "Your figures are saved and the desk is free for the next live.",
      });
    } else {
      notify({ tone: "error", title: "Could not end the session", body: result.reason });
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LiveDot />
              <span className="adm-eyebrow text-adm-neg">On air</span>
            </div>

            {/* Tabular figures: at this size, digits changing width once a
                second would make the whole line jitter. */}
            <div className="tnum mt-3 text-[56px] font-semibold leading-none tracking-[-0.04em] text-adm-ink sm:text-[68px]">
              {formatElapsed(elapsedMs(session, now))}
            </div>

            {/* The promotion cost is back, and it is the only shilling figure
                on this page: the host typed it themselves minutes ago. The
                takings it was spent against are not here and never arrive from
                the server. */}
            <p className="mt-3 text-[12.5px] text-adm-ink-3">
              Started{" "}
              {new Date(session.startedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
              {session.spendMinor === undefined
                ? null
                : ` · ${formatMoney(session.spendMinor, { currency: "KSh" })} promotion`}
            </p>
          </div>

          {/* Two steps to come off air. One misplaced tap on a phone held in
              one hand while talking to a camera should not close the session
              that is being measured. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {confirming ? (
              <>
                <Button onClick={() => setConfirming(false)} disabled={state.busy}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void end()}
                  disabled={state.busy}
                  className="bg-adm-neg hover:bg-[#96201a]"
                >
                  {state.busy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Square size={13} />
                  )}
                  Confirm end
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                onClick={() => setConfirming(true)}
                // Red from the first press, not only on the confirm. Ending a
                // live is the destructive action on this page and the one a
                // host must be able to find at a glance mid-broadcast.
                className="bg-adm-neg hover:bg-[#96201a]"
              >
                <Square size={13} />
                End session
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Scoreboard session={session} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Off air
// ---------------------------------------------------------------------------

function StartPanel({
  state,
  suspended,
}: {
  state: ReturnType<typeof useHost>;
  suspended: boolean;
}) {
  const notify = useNotify();
  const [spend, setSpend] = useState("");

  const spendMinor = wholeToMinor(spend);

  async function start() {
    const result = await state.start(spendMinor);

    if (result.ok) {
      setSpend("");
      notify({
        tone: "success",
        title: "You are live",
        body: "Every deposit from now until you press End counts towards this session.",
      });
    } else {
      notify({ tone: "error", title: "Could not start", body: result.reason });
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <span className="adm-eyebrow">Off air</span>
      <h2 className="mt-2 text-[19px] font-semibold tracking-[-0.02em] text-adm-ink">
        Start a session
      </h2>
      <p className="mt-1.5 max-w-[560px] text-[13px] leading-relaxed text-adm-ink-3">
        The timer starts the moment you go live, and every deposit made while it
        runs is counted against this session. Enter what you paid to promote the
        live first — it is what the takings get measured against.
      </p>

      {suspended ? (
        <p className="mt-4 border border-adm-line bg-adm-subtle px-3 py-2.5 text-[12.5px] text-adm-ink-2">
          Your account is suspended, so you cannot open a session. Your past
          sessions are still below.
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
        className="mt-5 flex flex-wrap items-end gap-3"
      >
        <div>
          <label
            htmlFor="host-spend"
            className="mb-1.5 block text-[12.5px] font-medium text-adm-ink-2"
          >
            Promotion cost
          </label>
          <div className="flex h-11 w-[220px] max-w-full items-center border border-adm-line-strong bg-adm-surface focus-within:border-adm-accent focus-within:ring-2 focus-within:ring-adm-accent-tint">
            <span className="pl-3 pr-1.5 text-[13px] font-medium text-adm-ink-3">
              KSh
            </span>
            <input
              id="host-spend"
              inputMode="numeric"
              value={spend}
              disabled={suspended}
              // Whole shillings, digits only — the same rule as every other
              // cash field in the product (see `wholeToMinor`).
              onChange={(event) =>
                setSpend(event.target.value.replace(/\D/g, "").slice(0, 7))
              }
              placeholder="0"
              className="tnum h-full w-full min-w-0 bg-transparent pr-3 text-[16px] font-medium text-adm-ink outline-none placeholder:font-normal placeholder:text-adm-ink-4 disabled:opacity-50"
            />
          </div>
          <p className="mt-1 text-[11.5px] text-adm-ink-3">
            Enter 0 if this live was not promoted.
          </p>
        </div>

        <Button
          type="submit"
          variant="primary"
          className="h-11 px-5"
          disabled={state.busy || suspended || spend.length === 0}
        >
          {state.busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Radio size={15} />
          )}
          Go live
        </Button>
      </form>
    </Card>
  );
}

function BlockedPanel({
  blockedBy,
}: {
  blockedBy: { hostName: string; startedAt: string };
}) {
  const now = useNow(true);
  const running = Math.max(0, now - Date.parse(blockedBy.startedAt));

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <LiveDot />
        <span className="adm-eyebrow text-adm-neg">Desk in use</span>
      </div>

      <h2 className="mt-3 text-[19px] font-semibold tracking-[-0.02em] text-adm-ink">
        {blockedBy.hostName} is live
      </h2>
      <p className="mt-1.5 max-w-[520px] text-[13px] leading-relaxed text-adm-ink-3">
        Running for{" "}
        <span className="tnum font-medium text-adm-ink-2">
          {formatElapsed(running)}
        </span>
        . Only one session runs at a time, so that every deposit belongs to
        exactly one live — this page will free up the moment they come off air.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-6">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-14 w-56" />
        <Skeleton className="h-3 w-64" />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Card key={index} className="space-y-3 p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
    </div>
  );
}
