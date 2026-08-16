"use client";

import { useMemo, useState } from "react";
import { Loader2, Radio, Square, UserMinus, UserPlus } from "lucide-react";
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
export function SessionsView({ state }: { state: SessionsState }) {
  const { sessions, hosts, error, pending, money, endSession, setHostStatus } =
    state;
  const notify = useNotify();

  const live = sessions?.find((session) => session.endedAt === null) ?? null;

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
        newDepositors: sum.newDepositors + session.stats.newDepositors,
      }),
      { collected: 0n, spend: 0n, depositors: 0, newDepositors: 0 },
    );
  }, [sessions]);

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
      {/* --- On air now --------------------------------------------------- */}
      {live ? (
        <OnAirCard
          session={live}
          busy={Boolean(pending[live.id])}
          onEnd={() => void end(live)}
        />
      ) : (
        <OffAirCard state={state} />
      )}

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
          {/* The three money tiles are replaced by reach figures for a role
              without the finance capability, rather than left as gaps. A
              session manager still needs to know whether a broadcast worked;
              people and sign-ups answer that without naming a shilling. */}
          {money ? (
            <>
              <StatTile
                label="Collected"
                value={formatMoney(totals.collected, { currency: "KSh", compact: true })}
                hint="Deposits confirmed while a session was open"
              />
              <StatTile
                label="Promotion spend"
                value={formatMoney(totals.spend, { currency: "KSh", compact: true })}
                hint="As entered by each host before going live"
              />
              <StatTile
                label="Net"
                value={
                  <span
                    className={cn(
                      totals.collected > totals.spend && "text-adm-pos",
                      totals.collected < totals.spend && "text-adm-neg",
                    )}
                  >
                    {formatMoney(totals.collected - totals.spend, {
                      currency: "KSh",
                      compact: true,
                    })}
                  </span>
                }
                hint={`${totals.newDepositors} first-time depositors won`}
              />
            </>
          ) : (
            <>
              <StatTile
                label="Depositors"
                value={totals.depositors}
                hint="People who paid while a session was open"
              />
              <StatTile
                label="First-timers"
                value={totals.newDepositors}
                hint="Of those, depositing for the first time ever"
              />
              <StatTile
                label="Sign-ups"
                value={sessions?.reduce((sum, s) => sum + s.stats.signups, 0) ?? 0}
                hint="Accounts created during a broadcast"
              />
            </>
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

      {/* --- Every session -------------------------------------------------- */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Sessions"
          subtitle="Every live, newest first, with what it brought in against what it cost."
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
          <SessionsTable sessions={sessions} money={money} />
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

function OnAirCard({
  session,
  busy,
  onEnd,
}: {
  session: AdminPromoSession;
  busy: boolean;
  onEnd: () => void;
}) {
  const now = useNow(true);
  const [confirming, setConfirming] = useState(false);
  const net = netMinor(session);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse bg-adm-neg" />
            <span className="adm-eyebrow text-adm-neg">On air</span>
          </div>

          <h2 className="mt-2.5 text-[19px] font-semibold tracking-[-0.02em] text-adm-ink">
            {session.hostName}
          </h2>
          <p className="tnum mt-1 font-mono text-[12px] text-adm-ink-3">
            {formatPhone(session.hostPhone)}
          </p>

          <div className="tnum mt-4 text-[38px] font-semibold leading-none tracking-[-0.03em] text-adm-ink">
            {formatElapsed(elapsedMs(session, now))}
          </div>
          <p className="mt-2 text-[12.5px] text-adm-ink-3">
            Since{" "}
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

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <Button onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={onEnd}
                disabled={busy}
                className="bg-adm-neg hover:bg-[#96201a]"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Square size={13} />
                )}
                Confirm end
              </Button>
            </>
          ) : (
            <Button onClick={() => setConfirming(true)}>
              <Square size={13} />
              End session
            </Button>
          )}
        </div>
      </div>

      {/* The live figures, inline. A separate scoreboard card would push the
          rest of the page below the fold for the one state where the rest of
          the page matters least. */}
      <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-adm-line pt-4">
        {session.stats.depositMinor === undefined ? null : (
          <Inline
            label="Collected"
            value={formatMoney(session.stats.depositMinor, { currency: "KSh" })}
          />
        )}
        <Inline label="Deposits" value={String(session.stats.depositCount)} />
        <Inline label="People" value={String(session.stats.depositors)} />
        <Inline label="New" value={String(session.stats.newDepositors)} />
        <Inline label="Sign-ups" value={String(session.stats.signups)} />
        <Inline label="Pending" value={String(session.stats.pendingCount)} />
        {net === null ? null : (
          <Inline
            label="Net"
            value={formatMoney(net, { currency: "KSh", withSign: net > 0n })}
            className={cn(net > 0n && "text-adm-pos", net < 0n && "text-adm-neg")}
          />
        )}
      </dl>
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

function Inline({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <dt className="adm-eyebrow">{label}</dt>
      <dd className={cn("tnum mt-1 text-[15px] font-semibold text-adm-ink", className)}>
        {value}
      </dd>
    </div>
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
function SessionsTable({ sessions, money }: { sessions: AdminPromoSession[]; money: boolean }) {
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
            <Th>Deposits</Th>
            <Th>People</Th>
            <Th>New</Th>
            <Th>Sign-ups</Th>
            {money ? <Th>Net</Th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-adm-line">
          {sessions.map((session) => {
            const net = netMinor(session);
            const running = session.endedAt === null;

            return (
              <tr key={session.id} className="transition-colors hover:bg-adm-raise">
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
                <Td>{session.stats.depositCount}</Td>
                <Td>{session.stats.depositors}</Td>
                <Td>{session.stats.newDepositors}</Td>
                <Td>{session.stats.signups}</Td>
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
