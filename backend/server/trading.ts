import { Prisma, type TradeDirection } from "@prisma/client";
import { prisma } from "./db";
import { InsufficientFunds, post, systemAccount } from "./ledger";
import { oracle } from "./oracle";
import { payoutFromStake, profitFromStake } from "./money";
import { sendToUser } from "./realtime";
import { serialiseTrade, type TradeDTO } from "./dto";

/**
 * Trade placement.
 *
 * The security property that matters here: the client supplies only *intent*
 * (instrument, direction, stake, duration). Every number that determines
 * whether the customer wins — the open price, the expiry instant, the payout
 * rate — is read server-side at the moment of placement and written to the
 * trade row. A tampered request cannot buy a better entry price.
 */

/** Durations offered in the UI. Anything else is rejected. */
export const ALLOWED_DURATIONS_SEC = [30, 60, 120, 300, 900] as const;
export type AllowedDuration = (typeof ALLOWED_DURATIONS_SEC)[number];

export class TradingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "TradingError";
  }
}

export interface PlaceTradeInput {
  userId: string;
  accountKind: "DEMO" | "LIVE";
  symbol: string;
  direction: TradeDirection;
  stakeMinor: bigint;
  durationSec: number;
  /** Supplied by the client so a retried request cannot open two positions. */
  idempotencyKey: string;
}

export async function placeTrade(input: PlaceTradeInput): Promise<TradeDTO> {
  const {
    userId,
    accountKind,
    symbol,
    direction,
    stakeMinor,
    durationSec,
    idempotencyKey,
  } = input;

  if (!ALLOWED_DURATIONS_SEC.includes(durationSec as AllowedDuration)) {
    throw new TradingError(
      `Unsupported duration ${durationSec}s`,
      "INVALID_DURATION",
    );
  }

  // A replay of the same request returns the original trade rather than
  // opening a second position at a new price.
  const existing = await prisma.trade.findUnique({
    where: { idempotencyKey },
    include: { instrument: true },
  });
  if (existing) {
    if (existing.userId !== userId) {
      throw new TradingError("Idempotency key already used", "KEY_REUSED", 409);
    }
    return serialiseTrade(existing, existing.instrument);
  }

  const instrument = await prisma.instrument.findUnique({ where: { symbol } });
  if (!instrument || !instrument.isActive) {
    throw new TradingError("Unknown or inactive instrument", "NO_INSTRUMENT", 404);
  }

  if (stakeMinor < instrument.minStakeMinor) {
    throw new TradingError("Stake below the minimum", "STAKE_TOO_LOW");
  }
  if (stakeMinor > instrument.maxStakeMinor) {
    throw new TradingError("Stake above the maximum", "STAKE_TOO_HIGH");
  }

  const account = await prisma.account.findFirst({
    where: { userId, kind: accountKind },
    select: { id: true },
  });
  if (!account) {
    throw new TradingError("Account not found", "NO_ACCOUNT", 404);
  }

  // Read the price server-side. This is the entry, full stop.
  const tick = oracle().lastTick(symbol);
  if (!tick) {
    throw new TradingError(
      "No price available for this instrument right now",
      "NO_PRICE",
      503,
    );
  }

  const openedAt = new Date();
  const expiresAt = new Date(openedAt.getTime() + durationSec * 1000);
  const house = await systemAccount("HOUSE", instrument.symbol ? "KES" : "KES");

  // The stake leaves the customer and enters the house book immediately, so a
  // customer can never stake the same balance twice by racing two requests —
  // the ledger's row lock serialises them and the second sees the reduced
  // balance.
  try {
    await post({
      kind: "TRADE_STAKE",
      idempotencyKey: `trade-stake:${idempotencyKey}`,
      memo: `Stake ${symbol} ${direction} ${durationSec}s`,
      postings: [
        { accountId: account.id, amountMinor: -stakeMinor },
        { accountId: house.id, amountMinor: stakeMinor },
      ],
      requireNonNegative: [account.id],
      metadata: { symbol, direction, durationSec },
    });
  } catch (error) {
    if (error instanceof InsufficientFunds) {
      throw new TradingError("Insufficient balance", "INSUFFICIENT_FUNDS", 402);
    }
    throw error;
  }

  const trade = await prisma.trade.create({
    data: {
      userId,
      accountId: account.id,
      instrumentId: instrument.id,
      direction,
      stakeMinor,
      payoutBps: instrument.payoutBps,
      openPrice: new Prisma.Decimal(tick.mid),
      durationSec,
      openedAt,
      expiresAt,
      idempotencyKey,
    },
  });

  const dto = serialiseTrade(trade, instrument);

  const balance = await prisma.account.findUnique({
    where: { id: account.id },
    select: { balanceMinor: true },
  });
  if (balance) {
    sendToUser(userId, {
      t: "balance",
      accountId: account.id,
      balanceMinor: balance.balanceMinor.toString(),
    });
  }

  return dto;
}

/** What the customer stands to win, for display before placing. */
export function quotePayout(stakeMinor: bigint, payoutBps: number) {
  return {
    profitMinor: profitFromStake(stakeMinor, payoutBps),
    returnMinor: payoutFromStake(stakeMinor, payoutBps),
  };
}
