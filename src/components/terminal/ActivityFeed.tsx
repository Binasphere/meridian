"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, RotateCcw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, formatRelative } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { maskPhone, useCurrentAccount } from "@/lib/auth";
import { useStore } from "@/lib/store";
import {
  DEMO_COMMUNITY_ACTIVITY,
  buildDemoActivity,
  makeDemoActivity,
  nextDemoInterval,
  type DemoActivity,
} from "@/lib/demo";
import type { Trade } from "@/lib/trading";
import { LiveDot } from "@/components/ui/primitives";

/**
 * Activity feed.
 *
 * ## What this is not
 *
 * The reference design for this product filled this space with a stream of
 * messages like *"System: Mercy has successfully withdrawn KES 13,400 ✅"* —
 * generated, on a timer, about people who do not exist. That mechanic is the
 * defining feature of a binary-options funnel: its only function is to make
 * depositing feel safe by manufacturing evidence that other people are getting
 * paid. It is not implemented here and there is no code path that could emit it.
 *
 * ## What this is
 *
 * The same component, the same live feel, driven by events that actually
 * happened. Today that is the signed-in trader's own contract history, which is
 * genuinely useful — a running narrative of what you just did, without leaving
 * the ticket.
 *
 * When the backend lands, real events from real signed-in accounts flow through
 * `ActivityEvent` unchanged and the feed becomes a community view. The shape is
 * already right: every event carries the id of an actor who did the thing. The
 * only rule is that something must have happened for a row to exist.
 */

export interface ActivityEvent {
  id: string;
  at: number;
  /** Who did it. `self` today; a real user id once the backend exists. */
  actor: { id: string; label: string; isSelf: boolean };
  kind: "won" | "lost" | "refunded" | "opened";
  symbol: string;
  amountMinor: bigint;
  direction?: "UP" | "DOWN";
}

/** Derives the feed from real trades. No event exists without a trade behind it. */
function eventsFromTrades(trades: Trade[], selfLabel: string): ActivityEvent[] {
  const actor = { id: "self", label: selfLabel, isSelf: true };

  return trades
    .map<ActivityEvent>((trade) => {
      if (trade.status === "OPEN") {
        return {
          id: `${trade.id}:open`,
          at: trade.openedAt,
          actor,
          kind: "opened",
          symbol: trade.symbol,
          amountMinor: BigInt(trade.stakeMinor),
          direction: trade.direction,
        };
      }

      const kind =
        trade.status === "WON"
          ? "won"
          : trade.status === "LOST"
            ? "lost"
            : "refunded";

      return {
        id: `${trade.id}:${kind}`,
        at: trade.settledAt ?? trade.openedAt,
        actor,
        kind,
        symbol: trade.symbol,
        amountMinor:
          kind === "refunded"
            ? BigInt(trade.stakeMinor)
            : BigInt(trade.pnlMinor ?? "0"),
        direction: trade.direction,
      };
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, 40);
}

export function ActivityFeed() {
  const now = useNow(10_000);
  const trades = useStore((s) => s.trades);
  const accountKind = useStore((s) => s.accountKind);
  const account = useCurrentAccount();

  const selfLabel = account ? maskPhone(account.phone) : "You";

  // Sample community events, seeded once and dripped in on a timer so the feed
  // demonstrates its live behaviour. See `demo.ts` — this is off in production.
  const [demo, setDemo] = useState<DemoActivity[]>(() =>
    DEMO_COMMUNITY_ACTIVITY ? buildDemoActivity() : [],
  );

  useEffect(() => {
    if (!DEMO_COMMUNITY_ACTIVITY) return;
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(() => {
        setDemo((current) =>
          [makeDemoActivity(Date.now()), ...current].slice(0, 40),
        );
        schedule();
      }, nextDemoInterval());
    };

    schedule();
    return () => clearTimeout(timer);
  }, []);

  const events = useMemo(() => {
    const mine = eventsFromTrades(
      trades.filter((t) => t.accountKind === accountKind),
      selfLabel,
    );

    const sample: ActivityEvent[] = demo.map((d) => ({
      id: d.id,
      at: d.at,
      actor: { id: d.id, label: d.actorLabel, isSelf: false },
      kind: d.kind,
      symbol: d.symbol,
      amountMinor: d.amountMinor,
      direction: d.direction,
    }));

    return [...mine, ...sample].sort((a, b) => b.at - a.at).slice(0, 50);
  }, [trades, accountKind, selfLabel, demo]);

  return (
    <section className="border border-line bg-surface-1">
      <header className="flex h-9 items-center gap-2 border-b border-line px-3">
        <LiveDot />
        <h2 className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
          Activity
        </h2>
        {events.length > 0 ? (
          <span className="tnum ml-auto font-mono text-[10.5px] text-ink-faint">
            {events.length}
          </span>
        ) : null}
      </header>

      <div className="max-h-[196px] min-h-[92px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-3 py-5 text-center">
            <p className="text-[11.5px] leading-relaxed text-ink-muted">
              Your contracts appear here as they settle.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {events.map((event) => (
                <motion.li
                  key={event.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-2.5 px-3 py-2"
                >
                  <EventIcon kind={event.kind} direction={event.direction} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] text-ink-secondary">
                      <span className="text-ink">{event.actor.label}</span>{" "}
                      {verb(event.kind)}{" "}
                      <span
                        className={cn(
                          "tnum font-mono",
                          event.kind === "won" && "text-up",
                          event.kind === "lost" && "text-down",
                          (event.kind === "refunded" ||
                            event.kind === "opened") &&
                            "text-ink-secondary",
                        )}
                      >
                        {formatMoney(
                          event.kind === "lost"
                            ? -event.amountMinor
                            : event.amountMinor,
                          { currency: "KSh" },
                        )}
                      </span>
                    </p>
                    <p className="truncate font-mono text-[10px] text-ink-faint">
                      {event.symbol} · {formatRelative(event.at, now)}
                    </p>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  );
}

function verb(kind: ActivityEvent["kind"]): string {
  switch (kind) {
    case "won":
      return "won";
    case "lost":
      return "lost";
    case "refunded":
      return "was refunded";
    case "opened":
      return "staked";
  }
}

function EventIcon({
  kind,
  direction,
}: {
  kind: ActivityEvent["kind"];
  direction?: "UP" | "DOWN";
}) {
  const base =
    "grid h-6 w-6 shrink-0 place-items-center border";

  if (kind === "won") {
    return (
      <span className={cn(base, "border-up/25 bg-up/10 text-up")} aria-hidden>
        <ArrowUp className="h-3 w-3" />
      </span>
    );
  }
  if (kind === "lost") {
    return (
      <span
        className={cn(base, "border-down/25 bg-down/10 text-down")}
        aria-hidden
      >
        <ArrowDown className="h-3 w-3" />
      </span>
    );
  }
  if (kind === "refunded") {
    return (
      <span
        className={cn(base, "border-line-strong bg-surface-3 text-ink-muted")}
        aria-hidden
      >
        <Undo2 className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span
      className={cn(base, "border-line-strong bg-surface-3 text-ink-muted")}
      aria-hidden
    >
      {direction === "UP" ? (
        <ArrowUp className="h-3 w-3" />
      ) : direction === "DOWN" ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <RotateCcw className="h-3 w-3" />
      )}
    </span>
  );
}
