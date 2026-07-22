import { Prisma, type Trade, type TradeStatus } from "@prisma/client";
import { prisma } from "./db";
import { post, systemAccount } from "./ledger";
import { oracleOrNull } from "./oracle";
import { payoutFromStake, profitFromStake } from "./money";
import { sendToUser } from "./realtime";
import { serialiseTrade } from "./dto";

/**
 * The settlement engine.
 *
 * Runs on a fixed interval, finds expired positions, decides them against the
 * oracle's price at the expiry instant, and pays out.
 *
 * ## Why it is ordered the way it is
 *
 * Settlement is two effects that cannot be made atomic with each other: a
 * decision (what the trade row says) and a payment (what the ledger says). A
 * crash between them must not lose or duplicate money, so the ordering is
 * chosen deliberately:
 *
 *   1. **Decide and persist first**, with a conditional `WHERE status = 'OPEN'`.
 *      That update is the point of no return: exactly one worker can win it,
 *      and the recorded close price makes the outcome permanent. A second
 *      worker matching zero rows knows another one already decided.
 *   2. **Then pay**, under an idempotency key derived solely from the trade id.
 *
 * A crash after (1) leaves a decided-but-unpaid trade. `recoverUnpaid()` finds
 * exactly those on boot and re-runs (2) — safe to repeat, because the ledger
 * deduplicates on the key. The reverse ordering has no safe recovery: a payment
 * whose outcome was never recorded cannot be told apart from one that should
 * not have happened.
 */

const SETTLEMENT_INTERVAL_MS = 250;
const BATCH_SIZE = 200;

const globalForEngine = globalThis as unknown as {
  __meridianEngine: { timer: NodeJS.Timeout | null; running: boolean } | undefined;
};

function state() {
  if (!globalForEngine.__meridianEngine) {
    globalForEngine.__meridianEngine = { timer: null, running: false };
  }
  return globalForEngine.__meridianEngine;
}

function settlementKey(tradeId: string): string {
  return `trade-settle:${tradeId}`;
}

/**
 * Decides one expired trade.
 *
 * UP wins strictly above the open price, DOWN strictly below. An exactly equal
 * close is a TIE and refunds the stake in full — the alternative (treating
 * equality as a loss) is a hidden edge in the house's favour that shows up
 * constantly on low-precision instruments.
 */
export function decide(
  direction: "UP" | "DOWN",
  openPrice: number,
  closePrice: number,
): Extract<TradeStatus, "WON" | "LOST" | "TIE"> {
  if (closePrice === openPrice) return "TIE";
  const wentUp = closePrice > openPrice;
  return (direction === "UP") === wentUp ? "WON" : "LOST";
}

/** Signed P&L in minor units for a decided trade. */
export function pnlFor(
  status: TradeStatus,
  stakeMinor: bigint,
  payoutBps: number,
): bigint {
  switch (status) {
    case "WON":
      return profitFromStake(stakeMinor, payoutBps);
    case "LOST":
      return -stakeMinor;
    default:
      return 0n; // TIE and VOIDED both return the stake exactly.
  }
}

/** How much flows back to the customer. LOST returns nothing. */
export function returnFor(
  status: TradeStatus,
  stakeMinor: bigint,
  payoutBps: number,
): bigint {
  switch (status) {
    case "WON":
      return payoutFromStake(stakeMinor, payoutBps);
    case "TIE":
    case "VOIDED":
      return stakeMinor;
    default:
      return 0n;
  }
}

/**
 * Step 2: move the money for an already-decided trade.
 * Safe to call any number of times.
 */
async function pay(trade: Trade): Promise<void> {
  const amount = returnFor(trade.status, trade.stakeMinor, trade.payoutBps);
  if (amount === 0n) return; // A loss moves nothing; the stake left at open.

  const house = await systemAccount("HOUSE");
  const kind =
    trade.status === "WON"
      ? "TRADE_PAYOUT"
      : ("TRADE_REFUND" as const);

  await post({
    kind,
    idempotencyKey: settlementKey(trade.id),
    memo: `${trade.status} ${trade.id}`,
    postings: [
      { accountId: house.id, amountMinor: -amount },
      { accountId: trade.accountId, amountMinor: amount },
    ],
    metadata: { tradeId: trade.id, status: trade.status },
  });
}

async function notify(trade: Trade): Promise<void> {
  const instrument = await prisma.instrument.findUnique({
    where: { id: trade.instrumentId },
    select: { symbol: true, displayName: true, precision: true },
  });
  const account = await prisma.account.findUnique({
    where: { id: trade.accountId },
    select: { id: true, balanceMinor: true },
  });

  if (instrument) {
    sendToUser(trade.userId, {
      t: "trade",
      trade: serialiseTrade(trade, instrument),
    });
  }
  if (account) {
    sendToUser(trade.userId, {
      t: "balance",
      accountId: account.id,
      balanceMinor: account.balanceMinor.toString(),
    });
  }
}

/** Settles everything that has expired. Returns how many trades were decided. */
export async function settleDue(now = new Date()): Promise<number> {
  const feed = oracleOrNull();
  if (!feed) return 0;

  const due = await prisma.trade.findMany({
    where: { status: "OPEN", expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    take: BATCH_SIZE,
    include: { instrument: { select: { symbol: true } } },
  });

  let settled = 0;

  for (const trade of due) {
    const closePrice = feed.priceAt(
      trade.instrument.symbol,
      trade.expiresAt.getTime(),
    );

    // No price at the expiry instant means the oracle cannot substantiate an
    // outcome — after a restart that dropped history, for instance. Voiding and
    // refunding is the only honest response; inventing a close price to settle
    // against would make the platform exactly the thing it must not be.
    const status: TradeStatus =
      closePrice === undefined
        ? "VOIDED"
        : decide(trade.direction, Number(trade.openPrice), closePrice);

    const pnl = pnlFor(status, trade.stakeMinor, trade.payoutBps);

    // Step 1 — the point of no return. `status: "OPEN"` in the WHERE clause is
    // what makes this safe to run from several workers at once.
    const claimed = await prisma.trade.updateMany({
      where: { id: trade.id, status: "OPEN" },
      data: {
        status,
        closePrice:
          closePrice === undefined ? null : new Prisma.Decimal(closePrice),
        settledAt: new Date(),
        pnlMinor: pnl,
      },
    });

    if (claimed.count === 0) continue; // Another worker decided it first.

    const decided = await prisma.trade.findUnique({ where: { id: trade.id } });
    if (!decided) continue;

    // Step 2 — pay. If the process dies here, recoverUnpaid() finishes the job.
    await pay(decided);
    await notify(decided);
    settled += 1;
  }

  return settled;
}

/**
 * Finishes settlements that were decided but never paid.
 *
 * Called on boot. Without it, a crash in the window between the two steps would
 * strand a customer's winnings indefinitely — the failure mode most likely to
 * be discovered by an angry customer rather than by us.
 */
export async function recoverUnpaid(): Promise<number> {
  const candidates = await prisma.trade.findMany({
    where: { status: { in: ["WON", "TIE", "VOIDED"] } },
    orderBy: { settledAt: "desc" },
    take: 1000,
  });
  if (candidates.length === 0) return 0;

  const paid = await prisma.ledgerTransaction.findMany({
    where: {
      idempotencyKey: { in: candidates.map((t) => settlementKey(t.id)) },
    },
    select: { idempotencyKey: true },
  });
  const paidKeys = new Set(paid.map((p) => p.idempotencyKey));

  let repaired = 0;
  for (const trade of candidates) {
    if (paidKeys.has(settlementKey(trade.id))) continue;
    await pay(trade);
    await notify(trade);
    repaired += 1;
  }
  return repaired;
}

export function startEngine(): void {
  const engine = state();
  if (engine.running) return;
  engine.running = true;

  let inFlight = false;
  engine.timer = setInterval(() => {
    // Never overlap runs. A slow batch must not have a second pass stacking
    // behind it competing for the same rows.
    if (inFlight) return;
    inFlight = true;

    settleDue()
      .catch((error) => {
        console.error("[engine] settlement pass failed:", error);
      })
      .finally(() => {
        inFlight = false;
      });
  }, SETTLEMENT_INTERVAL_MS);

  engine.timer.unref?.();
}

export function stopEngine(): void {
  const engine = state();
  if (engine.timer) clearInterval(engine.timer);
  engine.timer = null;
  engine.running = false;
}
