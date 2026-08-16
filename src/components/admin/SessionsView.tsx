"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Radio,
  Square,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { formatMoney, toMinor } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import {
  elapsedMs,
  formatElapsed,
  formatSpan,
  netMinor,
  type PromoHost,
  type AdminPromoSession,
} from "@/lib/sessions/types";
import { useNow } from "@/lib/sessions/useNow";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Skeleton, StatTile, avatarTint, useNotify } from "./ui";
import { LineChart, TableView } from "./charts";
import type { SessionsState } from "./useSessions";

/**
 * The promo desk, from the admin's side.
 *
 * Staff go live on TikTok and the people watching trade along; this is where
 * that work becomes a number. The page answers three questions in the order an
 * admin asks them: is anyone live right now, what has the desk produced
 * overall, and who produced it.
 *
 * The admin's one control over a broadcast is ending it — for the host who went
 * offline mid-live, or forgot. There is deliberately no way to edit a session's
 * cost or its takings: the promotion spend is typed before the figures exist,
 * and the takings are the ledger's, so neither is anybody's to adjust after the
 * fact.
 */
/** How many broadcasts the list shows before you ask for the rest. */
const RECENT_LIMIT = 4;

export function SessionsView({ state }: { state: SessionsState }) {
  const { sessions, hosts, error, pending, money, endSession, setHostStatus } =
    state;
  const notify = useNotify();

  const live = sessions?.find((session) => session.endedAt === null) ?? null;

  /**
   * Which broadcast the detail card is showing.
   *
   * Null means "follow the default", which is whatever is live and otherwise
   * the most recent. Storing the *intent* rather than resolving it to an id up
   * front is what lets the card move to a new broadcast on its own when one
   * starts, while still respecting a row an admin has deliberately picked.
   */
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const selected = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    // A picked session that has since dropped out of the window falls back
    // rather than leaving the card blank.
    return (
      sessions.find((session) => session.id === pickedId) ?? live ?? sessions[0] ?? null
    );
  }, [sessions, pickedId, live]);

  const selectedIndex = selected
    ? (sessions?.findIndex((session) => session.id === selected.id) ?? -1)
    : -1;

  const step = (delta: 1 | -1) => {
    if (!sessions || selectedIndex < 0) return;
    const next = sessions[selectedIndex + delta];
    if (next) setPickedId(next.id);
  };

  const totals = useMemo(() => {
    if (!sessions) return null;
    return sessions.reduce(
      (sum, session) => ({
        // `?? "0"` is safe here and nowhere else: these two totals are only
        // rendered when `state.money` is true, and in that case the server sent
        // every figure. The fallback exists to satisfy the type, not to stand
        // in for a number somebody was refused.
        collected: sum.collected + toMinor(session.stats.depositMinor ?? "0"),
        spend: sum.spend + toMinor(session.spendMinor ?? "0"),
        depositors: sum.depositors + session.stats.depositors,
        depositCount: sum.depositCount + session.stats.depositCount,
      }),
      { collected: 0n, spend: 0n, depositors: 0, depositCount: 0 },
    );
  }, [sessions]);

  /**
   * The list is capped, but never at the cost of hiding a live broadcast.
   *
   * Four is enough to see the last night's work at a glance. The union with
   * everything currently on air is what makes the cap safe: with a broadcast
   * running on each domain, a plain `slice(0, 4)` could push one of them out of
   * view on a busy day, and the one session an admin must be able to reach is
   * the one that is still running.
   */
  const visible = useMemo(() => {
    if (!sessions) return [];
    if (showAll || sessions.length <= RECENT_LIMIT) return sessions;

    const keep = new Set(
      sessions
        .filter((session) => session.endedAt === null)
        .map((session) => session.id),
    );
    sessions.slice(0, RECENT_LIMIT).forEach((session) => keep.add(session.id));

    return sessions.filter((session) => keep.has(session.id));
  }, [sessions, showAll]);

  async function end(session: AdminPromoSession) {
    const result = await endSession(session.id);
    if (result.ok) {
      notify({
        tone: "success",
        title: `${session.hostName}'s session ended`,
        body: "The desk is free and the session's figures are final.",
      });
    } else {
      notify({ tone: "error", title: "Could not end the session", body: result.reason });
    }
  }

  async function toggleHost(host: PromoHost) {
    const next = host.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const result = await setHostStatus(host.id, next);

    if (result.ok) {
      notify({
        tone: "success",
        title:
          next === "SUSPENDED"
            ? `${host.fullName} suspended`
            : `${host.fullName} reinstated`,
        body:
          next === "SUSPENDED"
            ? "They can still sign in and read their own record, but cannot open a session."
            : "They can open sessions again.",
      });
    } else {
      notify({ tone: "error", title: "Could not update the host", body: result.reason });
    }
  }

  return (
    <div className="space-y-5">
      {/* --- The broadcast in focus --------------------------------------
          Shown whether or not anyone is live: a finished session's figures
          are the reason most people open this page, and collapsing them into
          a table row the moment it ended threw that away. */}
      {selected ? (
        <SessionDetailCard
          session={selected}
          busy={Boolean(pending[selected.id])}
          onEnd={() => void end(selected)}
          onStep={step}
          position={{
            index: selectedIndex,
            total: sessions?.length ?? 0,
            hasPrev: selectedIndex > 0,
            hasNext: selectedIndex >= 0 && selectedIndex < (sessions?.length ?? 0) - 1,
          }}
        />
      ) : null}

      {/* The Start control stays available whenever the desk is free, even
          while an older broadcast is on screen. */}
      {live ? null : <OffAirCard state={state} />}

      {/* --- Totals -------------------------------------------------------- */}
      {totals ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Sessions"
            value={sessions?.length ?? 0}
            hint={`${hosts?.length ?? 0} ${
              (hosts?.length ?? 0) === 1 ? "host" : "hosts"
            } on the roster`}
          />
          {/* Customers, deposits, money. Sign-ups, first-timers and pending
              pushes were dropped from this page: they are diagnostics about a
              broadcast's funnel, and burying the three figures anybody actually
              reports on among them made none of them prominent. */}
          <StatTile
            label="Customers"
            value={totals.depositors}
            hint="People who paid while a session was open"
          />
          <StatTile
            label="Deposits"
            value={totals.depositCount}
            hint="Confirmed payments across every broadcast"
          />
          {money ? (
            <StatTile
              label="Collected"
              value={formatMoney(totals.collected, { currency: "KSh", compact: true })}
              hint={
                totals.spend > 0n
                  ? `Against ${formatMoney(totals.spend, { currency: "KSh", compact: true })} promotion`
                  : "Deposits confirmed during a broadcast"
              }
            />
          ) : (
            <StatTile
              label="Hosts"
              value={hosts?.length ?? 0}
              hint="On the roster across every domain"
            />
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Card key={index} className="space-y-3 p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-28" />
            </Card>
          ))}
        </div>
      )}

      {/* --- Collected per day --------------------------------------------- */}
      {money && sessions && sessions.length > 0 ? (
        <DailyTakings sessions={sessions} />
      ) : null}

      {/* --- Every session -------------------------------------------------- */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Sessions"
          subtitle={
            showAll || (sessions?.length ?? 0) <= visible.length
              ? "Every broadcast, newest first."
              : `The ${visible.length} most recent broadcasts, plus anything still on air.`
          }
          action={
            sessions && sessions.length > visible.length ? (
              <Button onClick={() => setShowAll(true)}>
                Show all {sessions.length}
              </Button>
            ) : showAll && sessions && sessions.length > RECENT_LIMIT ? (
              <Button onClick={() => setShowAll(false)}>Show recent only</Button>
            ) : null
          }
        />

        {error ? (
          <Empty title="Could not load sessions" hint={error} />
        ) : sessions === null ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <Empty
            title="No sessions yet"
            hint="Once a host runs their first live it appears here with its full record."
          />
        ) : (
          <SessionsTable
            sessions={visible}
            money={money}
            selectedId={selected?.id ?? null}
            onSelect={setPickedId}
            onEnd={(session) => void end(session)}
            busyIds={pending}
          />
        )}
      </Card>

      {/* --- The roster ----------------------------------------------------- */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Hosts"
          subtitle="Suspending stops someone opening a session. Their past sessions stay on the record."
        />

        {hosts === null ? (
          <div className="space-y-3 p-5">
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : hosts.length === 0 ? (
          <Empty
            title="No hosts yet"
            hint="Staff enrol themselves at /sessions with their name, number and a password."
          />
        ) : (
          <ul className="divide-y divide-adm-line">
            {hosts.map((host) => (
              <HostRow
                key={host.id}
                host={host}
                busy={Boolean(pending[host.id])}
                sessionCount={
                  sessions?.filter((session) => session.hostId === host.id).length ?? 0
                }
                onToggle={() => void toggleHost(host)}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// On air
// ---------------------------------------------------------------------------

/**
 * One broadcast in full — live or long finished.
 *
 * This used to render only while somebody was on air, which meant the moment a
 * session ended its figures collapsed into a table row and the detail was gone.
 * The card now follows a *selection*: it opens on whatever is live, falls back
 * to the most recent broadcast, and follows any row you pick in the table.
 *
 * The controls change with the state rather than the layout: a live session
 * gets the End button and a clock that ticks; an ended one gets its final
 * duration and prev/next, because the reason to look at a finished broadcast is
 * almost always to compare it with the one before.
 */
function SessionDetailCard({
  session,
  busy,
  onEnd,
  onStep,
  position,
}: {
  session: AdminPromoSession;
  busy: boolean;
  onEnd: () => void;
  /** Move through the list, newest first. Null when there is nowhere to go. */
  onStep: (delta: 1 | -1) => void;
  position: { index: number; total: number; hasPrev: boolean; hasNext: boolean };
}) {
  const running = session.endedAt === null;
  // Only tick for a live session: a finished one's duration is fixed, and a
  // timer re-rendering it every second is work that changes nothing.
  const now = useNow(running);
  const [confirming, setConfirming] = useState(false);
  const net = netMinor(session);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {running ? (
              <>
                <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse bg-adm-neg" />
                <span className="adm-eyebrow text-adm-neg">On air</span>
              </>
            ) : (
              <>
                <span aria-hidden className="h-2 w-2 shrink-0 bg-adm-ink-4" />
                <span className="adm-eyebrow">
                  Ended
                  {session.endedBy === "ADMIN"
                    ? " by an admin"
                    : session.endedBy === "AUTO"
                      ? " automatically"
                      : ""}
                </span>
              </>
            )}
          </div>

          {/* Name and number on one line. They were stacked over three lines
              with a 38px clock beneath, which pushed the figures — the reason
              anyone opens this card — below the fold on a laptop. */}
          <h2 className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-adm-ink">
              {session.hostName}
            </span>
            <span className="tnum font-mono text-[12px] text-adm-ink-3">
              {formatPhone(session.hostPhone)}
            </span>
          </h2>

          <p className="mt-1 text-[12.5px] text-adm-ink-3">
            {running ? "Since " : "Ran from "}
            {new Date(session.startedAt).toLocaleString([], {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
            {session.spendMinor === undefined
              ? null
              : ` · ${formatMoney(session.spendMinor, { currency: "KSh" })} promotion`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* The clock, small and top-right. It was the largest thing on the
              card, which made a duration look like the headline figure — it is
              context, not a result. Monospaced so a ticking second does not
              shift the controls beside it. */}
          <span
            className={cn(
              "tnum font-mono text-[13px] font-medium tabular-nums",
              running ? "text-adm-ink" : "text-adm-ink-3",
            )}
            title={running ? "On air for" : "Ran for"}
          >
            {formatElapsed(elapsedMs(session, now))}
          </span>

          {/* The switcher. Newest is index 0, so "previous" walks backwards in
              time and the arrows point the way the list reads. */}
          {position.total > 1 ? (
            <div className="flex items-center gap-1">
              <Button
                onClick={() => onStep(-1)}
                disabled={!position.hasPrev}
                aria-label="Newer session"
                className="h-8 px-2"
              >
                <ChevronLeft size={15} />
              </Button>
              <span className="tnum px-1 text-[12px] text-adm-ink-3">
                {position.index + 1} / {position.total}
              </span>
              <Button
                onClick={() => onStep(1)}
                disabled={!position.hasNext}
                aria-label="Older session"
                className="h-8 px-2"
              >
                <ChevronRight size={15} />
              </Button>
            </div>
          ) : null}

          {running ? (
            confirming ? (
              <>
                <Button onClick={() => setConfirming(false)} disabled={busy} className="h-8">
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={onEnd}
                  disabled={busy}
                  className="h-8 bg-adm-neg hover:bg-[#96201a]"
                >
                  {busy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Square size={13} />
                  )}
                  Confirm
                </Button>
              </>
            ) : (
              <Button onClick={() => setConfirming(true)} className="h-8">
                <Square size={13} />
                End
              </Button>
            )
          ) : null}
        </div>
      </div>

      {/* The live figures, inline. A separate scoreboard card would push the
          rest of the page below the fold for the one state where the rest of
          the page matters least. */}
      <SessionScorecard session={session} net={net} />
    </Card>
  );
}

/**
 * Nobody is live — and the console's own way to change that.
 *
 * Starting from here is the mirror of the force-end: it exists for the host who
 * is already broadcasting on TikTok and cannot get into the desk. The spend is
 * required because it is the denominator of everything the session will be
 * judged by, and a cost entered afterwards is a cost entered knowing the
 * answer. Typing it is not the same as being shown takings, which is why a
 * session manager may do this and still see no money anywhere else.
 */
function OffAirCard({ state }: { state: SessionsState }) {
  const { hosts, pending, startSession } = state;
  const notify = useNotify();
  const [open, setOpen] = useState(false);
  const [hostId, setHostId] = useState("");
  const [spend, setSpend] = useState("");

  const busy = Boolean(pending.start);
  const active = hosts?.filter((host) => host.status === "ACTIVE") ?? [];
  const ready = hostId.length > 0 && spend.trim().length > 0;

  async function submit() {
    if (busy || !ready) return;

    // Whole shillings in the field, cents on the wire — the same conversion the
    // host's own desk does, so a session started from either place records the
    // figure identically.
    const shillings = Number(spend);
    if (!Number.isFinite(shillings) || shillings < 0) {
      notify({ tone: "error", title: "Enter what the promotion cost" });
      return;
    }

    const result = await startSession(hostId, String(Math.round(shillings * 100)));
    if (result.ok) {
      notify({
        tone: "success",
        title: "Session started",
        body: "The host's desk will pick it up on its next refresh.",
      });
      setOpen(false);
      setHostId("");
      setSpend("");
      return;
    }
    notify({ tone: "error", title: "Could not start the session", body: result.reason });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span aria-hidden className="h-2 w-2 shrink-0 bg-adm-ink-4" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-adm-ink">Nobody is live</p>
          <p className="mt-0.5 text-[12.5px] text-adm-ink-3">
            A host normally opens a session from the live desk at{" "}
            <code>/sessions</code>. Only one runs at a time.
          </p>
        </div>
        <Button onClick={() => setOpen((value) => !value)} disabled={active.length === 0}>
          <Radio size={14} />
          {open ? "Cancel" : "Start for a host"}
        </Button>
      </div>

      {open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-adm-line pt-4"
        >
          <div className="min-w-[200px] flex-1">
            <label
              htmlFor="adm-start-host"
              className="mb-1.5 block text-[12.5px] font-medium text-adm-ink-2"
            >
              Host
            </label>
            <select
              id="adm-start-host"
              value={hostId}
              onChange={(event) => setHostId(event.target.value)}
              className="h-10 w-full rounded-none border border-adm-line-strong bg-adm-surface px-3 text-[14px] text-adm-ink outline-none focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint"
            >
              <option value="">Choose a host…</option>
              {active.map((host) => (
                <option key={host.id} value={host.id}>
                  {host.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[160px]">
            <label
              htmlFor="adm-start-spend"
              className="mb-1.5 block text-[12.5px] font-medium text-adm-ink-2"
            >
              Promotion cost (KSh)
            </label>
            <input
              id="adm-start-spend"
              inputMode="numeric"
              value={spend}
              onChange={(event) => setSpend(event.target.value.replace(/[^\d.]/g, ""))}
              placeholder="0"
              className="h-10 w-full rounded-none border border-adm-line-strong bg-adm-surface px-3 text-[14px] tabular-nums text-adm-ink outline-none focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint"
            />
          </div>

          <Button type="submit" variant="primary" className="h-10" disabled={busy || !ready}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
            Go live
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The scorecard
// ---------------------------------------------------------------------------

/**
 * What the broadcast did, as four figures and one ring.
 *
 * The figures were a row of inline `<dt>/<dd>` pairs, which reads as a caption
 * strip — every value the same weight, none of them the answer. As tiles they
 * have somewhere to sit, room to be large, and an order that means something:
 * reach first (who came, how many paid), then money (what came in, what was
 * left).
 *
 * The ring is the one thing the tiles cannot show, because it is a
 * *relationship* rather than a value: the takings split into the part that paid
 * the promotion back and the part that was kept. `Collected = covered + kept`
 * is a genuine part-to-whole, which is the only case a donut is the right form
 * for — and it makes the question the page exists to answer ("was the
 * promotion worth it") readable without arithmetic.
 *
 * When the takings fall short, "kept" is zero and the whole ring is the
 * recovered part; the shortfall is stated in words rather than drawn, because a
 * segment for money that never arrived would be inventing a quantity.
 */
function SessionScorecard({
  session,
  net,
}: {
  session: AdminPromoSession;
  net: bigint | null;
}) {
  const collected = session.stats.depositMinor;
  const spend = session.spendMinor;
  const hasMoney = collected !== undefined && spend !== undefined;

  const takings = hasMoney ? BigInt(collected) : 0n;
  const cost = hasMoney ? BigInt(spend) : 0n;
  const covered = takings < cost ? takings : cost;
  const kept = takings > cost ? takings - cost : 0n;
  const short = cost > takings ? cost - takings : 0n;

  // Widths as a share of whichever is larger, so a shortfall reads as an
  // unfilled remainder rather than silently rescaling the bar to look full.
  const scale = takings > cost ? takings : cost;
  const pct = (value: bigint) =>
    scale === 0n ? 0 : Number((value * 10000n) / scale) / 100;

  return (
    <div className="mt-4 border-t border-adm-line pt-4">
      {/* One row of figures, divided rather than boxed. Four tiles with their
          own padding and fills made a compact card tall; a divided row says the
          same in a third of the height. */}
      <dl className="grid grid-cols-2 divide-adm-line sm:grid-cols-4 sm:divide-x">
        <Kpi label="Customers" value={session.stats.depositors.toLocaleString()} />
        <Kpi label="Deposits" value={session.stats.depositCount.toLocaleString()} />
        {hasMoney ? (
          <>
            <Kpi
              label="Collected"
              value={formatMoney(takings, { currency: "KSh", whole: true })}
            />
            <Kpi
              label="Net"
              value={
                net === null
                  ? "—"
                  : formatMoney(net, { currency: "KSh", withSign: net > 0n, whole: true })
              }
              tone={net === null ? undefined : net > 0n ? "pos" : net < 0n ? "neg" : undefined}
            />
          </>
        ) : null}
      </dl>

      {/* The ring became a rule. Two quantities on a shared baseline are read
          far more accurately along a line than around an arc, and at the size
          this card wants a donut was a decoration with a hole in it. */}
      {hasMoney && scale > 0n ? (
        <div className="mt-4">
          <div className="flex h-1.5 w-full gap-[2px] overflow-hidden bg-adm-subtle">
            <div
              className="h-full bg-adm-accent transition-[width] duration-500"
              style={{ width: `${pct(covered)}%` }}
            />
            {kept > 0n ? (
              <div
                className="h-full bg-adm-pos transition-[width] duration-500"
                style={{ width: `${pct(kept)}%` }}
              />
            ) : null}
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-adm-ink-3">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 bg-adm-accent" />
              {formatMoney(covered, { currency: "KSh", whole: true })} covered the
              promotion
            </span>
            {kept > 0n ? (
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 bg-adm-pos" />
                {formatMoney(kept, { currency: "KSh", whole: true })} kept
              </span>
            ) : null}
            {short > 0n ? (
              <span className="text-adm-neg">
                {formatMoney(short, { currency: "KSh", whole: true })} short
              </span>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One figure in a divided row.
 *
 * No fill and no border: these sit inside a card already, and four filled tiles
 * inside a card is four boxes inside a box. A hairline divider and honest
 * padding separate them for a fraction of the ink — and a third of the height,
 * which is what the card actually needed.
 */
function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="px-1 py-1 sm:px-4 sm:first:pl-0">
      <dt className="adm-eyebrow">{label}</dt>
      <dd
        className={cn(
          // Proportional figures, not tabular: at this size equal-width digits
          // make a number like 11 look loose. Tabular belongs in table columns.
          "mt-1 truncate text-[18px] font-semibold leading-none tracking-[-0.02em] text-adm-ink",
          tone === "pos" && "text-adm-pos",
          tone === "neg" && "text-adm-neg",
        )}
      >
        {value}
      </dd>
    </div>
  );
}



// ---------------------------------------------------------------------------
// Collected per day
// ---------------------------------------------------------------------------

/**
 * What the desk took, by day.
 *
 * A line, and a line about *days* rather than about broadcasts. The bars this
 * replaced put one row per session, which meant a column of repeated host names
 * and a chart that answered "which live was biggest" — a question the table
 * below already answers better, with the dates attached.
 *
 * Days are the unit that shows a trend. Two broadcasts on one evening are one
 * night's takings, and reading them as two separate results was hiding exactly
 * the pattern a promo desk is run against.
 *
 * Derived from the sessions already loaded rather than from a new endpoint:
 * these are session takings specifically, not platform deposits, so summing the
 * rows on screen is both cheaper and guaranteed to agree with the table under
 * it. Gaps are filled with zeroes — a line that skips a quiet day draws a
 * straight segment across it and reads as steady trade.
 */
function DailyTakings({ sessions }: { sessions: AdminPromoSession[] }) {
  const series = useMemo(() => {
    const byDay = new Map<string, bigint>();

    for (const session of sessions) {
      const day = new Date(session.startedAt).toISOString().slice(0, 10);
      byDay.set(
        day,
        (byDay.get(day) ?? 0n) + toMinor(session.stats.depositMinor ?? "0"),
      );
    }

    const days = [...byDay.keys()].sort();
    if (days.length === 0) return null;

    // Every calendar day between the first and the last, so a quiet Tuesday is
    // a zero rather than a missing point.
    const filled: string[] = [];
    const cursor = new Date(`${days[0]}T00:00:00Z`);
    const last = new Date(`${days[days.length - 1]}T00:00:00Z`);
    while (cursor <= last && filled.length < 180) {
      filled.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return {
      days: filled,
      values: filled.map((day) => Number((byDay.get(day) ?? 0n) / 100n)),
    };
  }, [sessions]);

  if (!series) return null;

  return (
    <Card>
      <CardHeader
        title="Collected per day"
        subtitle="Deposits confirmed while a broadcast was open, by day."
      />
      <div className="px-5 py-4">
        <LineChart
          series={[{ id: "takings", label: "Collected", values: series.values }]}
          labels={series.days.map((day) =>
            new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            }),
          )}
          format={(value) =>
            value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value))
          }
          height={190}
          emptyMessage="No confirmed deposits during a broadcast yet."
        />
        <TableView
          columns={["Day", "Collected"]}
          rows={series.days.map((day, index) => [
            day,
            formatMoney(BigInt(Math.round(series.values[index] ?? 0)) * 100n, {
              currency: "KSh",
              whole: true,
            }),
          ])}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

/**
 * Ten columns is more than a stacked row can carry legibly, so this is a real
 * table that scrolls sideways inside its own card rather than a set of cards
 * that hide half the figures. Comparing hosts is the whole job of this list,
 * and comparison needs columns that line up.
 */
function SessionsTable({
  sessions,
  money,
  selectedId,
  onSelect,
  onEnd,
  busyIds,
}: {
  sessions: AdminPromoSession[];
  money: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEnd: (session: AdminPromoSession) => void;
  busyIds: Record<string, boolean>;
}) {
  const now = useNow(sessions.some((session) => session.endedAt === null));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[840px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-adm-line bg-adm-raise">
            <Th className="text-left">Host</Th>
            <Th className="text-left">Started</Th>
            <Th>On air</Th>
            {/* Kept in step with the cells below by the same `money` flag —
                a header without a column shifts every figure one place left,
                which is the worst way for a permission check to fail. */}
            {money ? (
              <>
                <Th>Promo</Th>
                <Th>Collected</Th>
              </>
            ) : null}
            {/* Customers, deposits, money — the three figures this page is
                read for. First-timers and sign-ups moved out: they answered a
                funnel question nobody was asking here and cost the columns
                that matter their width. */}
            <Th>Customers</Th>
            <Th>Deposits</Th>
            {money ? <Th>Net</Th> : null}
            <Th className="text-right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-adm-line">
          {sessions.map((session) => {
            const net = netMinor(session);
            const running = session.endedAt === null;
            const active = session.id === selectedId;

            return (
              <tr
                key={session.id}
                onClick={() => onSelect(session.id)}
                aria-current={active ? "true" : undefined}
                // A row is the fastest way to reach a broadcast's detail, so
                // the whole row is the target rather than a link in one cell.
                className={cn(
                  "cursor-pointer transition-colors",
                  active ? "bg-adm-accent-tint" : "hover:bg-adm-raise",
                )}
              >
                <Td className="text-left">
                  <span className="flex items-center gap-2">
                    {running ? (
                      <span
                        aria-label="Live"
                        className="h-1.5 w-1.5 shrink-0 animate-pulse bg-adm-neg"
                      />
                    ) : null}
                    <span className="font-medium text-adm-ink">{session.hostName}</span>
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-left text-adm-ink-2">
                  {new Date(session.startedAt).toLocaleString([], {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </Td>
                <Td className="whitespace-nowrap text-adm-ink-2">
                  {formatSpan(elapsedMs(session, now))}
                  {session.endedBy === "ADMIN" || session.endedBy === "AUTO" ? (
                    <span
                      className="ml-1 text-adm-ink-4"
                      title={
                        session.endedBy === "ADMIN"
                          ? "Ended by an admin"
                          : "Closed automatically after 12 hours"
                      }
                    >
                      {session.endedBy === "ADMIN" ? "·a" : "·auto"}
                    </span>
                  ) : null}
                </Td>
                {money ? (
                  <>
                    <Td>
                      {formatMoney(session.spendMinor ?? "0", {
                        currency: "KSh",
                        whole: true,
                      })}
                    </Td>
                    <Td className="font-medium text-adm-ink">
                      {formatMoney(session.stats.depositMinor ?? "0", {
                        currency: "KSh",
                        whole: true,
                      })}
                    </Td>
                  </>
                ) : null}
                <Td>{session.stats.depositors}</Td>
                <Td>{session.stats.depositCount}</Td>
                {net === null ? null : (
                  <Td
                    className={cn(
                      "font-medium",
                      net > 0n ? "text-adm-pos" : net < 0n ? "text-adm-neg" : "text-adm-ink",
                    )}
                  >
                    {formatMoney(net, { currency: "KSh", withSign: net > 0n, whole: true })}
                  </Td>
                )}

                {/* End, in the row. Ending a broadcast from the list is the one
                    action worth reaching without first selecting the session —
                    an admin closing a host who went offline is not there to
                    read figures. `stopPropagation` keeps the click off the
                    row's own select. */}
                <Td className="text-right">
                  {running ? (
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        onEnd(session);
                      }}
                      disabled={busyIds[session.id]}
                      className="h-7 px-2 text-[12px] text-adm-neg hover:bg-[#fdeceb]"
                      title={`End ${session.hostName}'s broadcast`}
                    >
                      {busyIds[session.id] ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Square size={11} />
                      )}
                      End
                    </Button>
                  ) : null}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn("adm-eyebrow px-3 py-2.5 text-right font-semibold", className)}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn("tnum px-3 py-2.5 text-right text-adm-ink-2", className)}>
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// The roster
// ---------------------------------------------------------------------------

function HostRow({
  host,
  busy,
  sessionCount,
  onToggle,
}: {
  host: PromoHost;
  busy: boolean;
  sessionCount: number;
  onToggle: () => void;
}) {
  const avatar = avatarTint(host.id, host.fullName);
  const suspended = host.status === "SUSPENDED";

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-adm-raise sm:px-5">
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center text-[11px] font-semibold"
        style={{ background: avatar.background, color: avatar.color }}
      >
        {avatar.initials}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-medium text-adm-ink">
            {host.fullName}
          </span>
          {suspended ? <Badge>Suspended</Badge> : null}
        </div>
        <div className="tnum mt-0.5 font-mono text-[11.5px] text-adm-ink-3">
          {formatPhone(host.phone)}
        </div>
      </div>

      <span className="tnum text-[12.5px] text-adm-ink-3">
        {sessionCount} {sessionCount === 1 ? "session" : "sessions"}
      </span>

      <Button onClick={onToggle} disabled={busy}>
        {busy ? (
          <Loader2 size={13} className="animate-spin" />
        ) : suspended ? (
          <UserPlus size={13} />
        ) : (
          <UserMinus size={13} />
        )}
        {suspended ? "Reinstate" : "Suspend"}
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-none bg-adm-subtle text-adm-ink-4">
        <Radio size={18} />
      </span>
      <p className="mt-1 text-[13.5px] font-medium text-adm-ink">{title}</p>
      <p className="max-w-[420px] text-[12.5px] leading-relaxed text-adm-ink-3">
        {hint}
      </p>
    </div>
  );
}
