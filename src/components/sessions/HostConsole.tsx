"use client";

import { useState } from "react";
import {
  History,
  Loader2,
  LogOut,
  Radio,
  RefreshCw,
  Square,
} from "lucide-react";
import { formatMoney, wholeToMinor } from "@/lib/format";
import { setHostToken } from "@/lib/sessions/client";
import {
  elapsedMs,
  formatElapsed,
  formatSpan,
  type PromoSession,
} from "@/lib/sessions/types";
import { Badge, Button, Card, CardHeader, Skeleton, useNotify } from "@/components/admin/ui";
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
    <div className="adm-root min-h-dvh">
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

      <main className="mx-auto w-full max-w-[1100px] space-y-5 px-4 py-5 sm:px-6 lg:py-6">
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

        {snapshot ? <HistoryCard sessions={snapshot.history} /> : null}
      </main>
    </div>
  );
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

            <p className="mt-3 text-[12.5px] text-adm-ink-3">
              Started{" "}
              {new Date(session.startedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
              {" · "}
              {formatMoney(session.spendMinor, { currency: "KSh" })} spent
              promoting
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
              <Button variant="primary" onClick={() => setConfirming(true)}>
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
// The record
// ---------------------------------------------------------------------------

function HistoryCard({ sessions }: { sessions: PromoSession[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Your sessions"
        subtitle="Every live you have run, newest first."
        action={
          sessions.length > 0 ? (
            <Badge>{sessions.length} total</Badge>
          ) : null
        }
      />

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-none bg-adm-subtle text-adm-ink-4">
            <History size={18} />
          </span>
          <p className="mt-1 text-[13.5px] font-medium text-adm-ink">
            No sessions yet
          </p>
          <p className="max-w-[380px] text-[12.5px] leading-relaxed text-adm-ink-3">
            Your first live will appear here with everything it brought in, the
            moment you end it.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-adm-line">
          {sessions.map((session) => (
            <HistoryRow key={session.id} session={session} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * One past broadcast.
 *
 * Net is absent here for the same reason it is absent from `Scoreboard`: it is
 * an admin figure, shown only in the admin console.
 */
function HistoryRow({ session }: { session: PromoSession }) {
  const ran = elapsedMs(session, Date.now());

  return (
    <li className="flex flex-col gap-2 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center lg:gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-adm-ink">
          {new Date(session.startedAt).toLocaleString([], {
            weekday: "short",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </div>
        <div className="mt-0.5 text-[12px] text-adm-ink-3">
          {formatSpan(ran)} on air
          {session.endedBy === "ADMIN" ? " · ended by admin" : null}
          {session.endedBy === "AUTO" ? " · closed automatically" : null}
        </div>
      </div>

      <Figure label="Collected" value={formatMoney(session.stats.depositMinor, { currency: "KSh" })} />
      <Figure label="Deposits" value={String(session.stats.depositCount)} />
      <Figure label="New" value={String(session.stats.newDepositors)} />
      <Figure label="Spent" value={formatMoney(session.spendMinor, { currency: "KSh" })} />
    </li>
  );
}

/**
 * One figure from a past session.
 *
 * The label is always rendered, not hoisted into a column heading: the row
 * stacks below `lg`, and a bare number with its heading three screens up is a
 * number nobody can read.
 */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 lg:w-[112px] lg:flex-col lg:items-end lg:justify-start lg:gap-0.5">
      <span className="adm-eyebrow">{label}</span>
      <span className="tnum text-[13px] font-medium text-adm-ink">{value}</span>
    </div>
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
