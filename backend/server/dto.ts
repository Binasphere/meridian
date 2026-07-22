import type { Instrument, Trade, ChatMessage, User } from "@prisma/client";

/**
 * Serialisation boundary.
 *
 * `bigint` and `Decimal` have no JSON representation. Rather than let each
 * route improvise, every shape that crosses the wire is defined once here, with
 * amounts as decimal *strings* and prices as numbers. Nothing sends a raw
 * Prisma model to a client.
 */

export interface TradeDTO {
  id: string;
  symbol: string;
  displayName: string;
  precision: number;
  direction: "UP" | "DOWN";
  status: "OPEN" | "WON" | "LOST" | "TIE" | "VOIDED";
  stakeMinor: string;
  payoutBps: number;
  openPrice: number;
  closePrice: number | null;
  durationSec: number;
  openedAt: string;
  expiresAt: string;
  settledAt: string | null;
  pnlMinor: string | null;
}

export function serialiseTrade(
  trade: Trade,
  instrument: Pick<Instrument, "symbol" | "displayName" | "precision">,
): TradeDTO {
  return {
    id: trade.id,
    symbol: instrument.symbol,
    displayName: instrument.displayName,
    precision: instrument.precision,
    direction: trade.direction,
    status: trade.status,
    stakeMinor: trade.stakeMinor.toString(),
    payoutBps: trade.payoutBps,
    openPrice: Number(trade.openPrice),
    closePrice: trade.closePrice === null ? null : Number(trade.closePrice),
    durationSec: trade.durationSec,
    openedAt: trade.openedAt.toISOString(),
    expiresAt: trade.expiresAt.toISOString(),
    settledAt: trade.settledAt?.toISOString() ?? null,
    pnlMinor: trade.pnlMinor === null ? null : trade.pnlMinor.toString(),
  };
}

export interface InstrumentDTO {
  symbol: string;
  displayName: string;
  kind: string;
  precision: number;
  payoutBps: number;
  minStakeMinor: string;
  maxStakeMinor: string;
}

export function serialiseInstrument(instrument: Instrument): InstrumentDTO {
  return {
    symbol: instrument.symbol,
    displayName: instrument.displayName,
    kind: instrument.kind,
    precision: instrument.precision,
    payoutBps: instrument.payoutBps,
    minStakeMinor: instrument.minStakeMinor.toString(),
    maxStakeMinor: instrument.maxStakeMinor.toString(),
  };
}

export interface ChatMessageDTO {
  id: string;
  body: string;
  isOfficial: boolean;
  createdAt: string;
  author: { id: string; displayName: string; avatarSeed: string };
}

export function serialiseChatMessage(
  message: ChatMessage & {
    user: Pick<User, "id" | "displayName" | "avatarSeed">;
  },
): ChatMessageDTO {
  return {
    id: message.id,
    body: message.body,
    isOfficial: message.isOfficial,
    createdAt: message.createdAt.toISOString(),
    author: {
      id: message.user.id,
      displayName: message.user.displayName,
      avatarSeed: message.user.avatarSeed,
    },
  };
}

export interface AccountDTO {
  id: string;
  kind: "DEMO" | "LIVE";
  currency: string;
  balanceMinor: string;
}
