export type InstrumentKind = "MAJOR" | "LAYER1" | "DEFI" | "MEME";

export interface Instrument {
  symbol: string;
  displayName: string;
  short: string;
  kind: InstrumentKind;
  /** Decimals in a quoted price. Taken from Binance's PRICE_FILTER tickSize. */
  precision: number;
  /** Payout on a win, in basis points of stake. 8500 = 85%. */
  payoutBps: number;
  /**
   * Only used by the offline fallback simulation, as the level it reverts
   * toward. Live prices come from the exchange and ignore this entirely.
   */
  basePrice: number;
  /** Annualised volatility — fallback simulation only. */
  volatility: number;
  drift: number;
  halfSpread: number;
}

/**
 * The instrument catalogue.
 *
 * **Every instrument here is quoted from a real exchange feed.** Forex, metals
 * and the synthetic indices were removed rather than shipped on generated
 * prices: if we cannot quote a market honestly, we do not list it. That is a
 * narrower catalogue than a typical platform in this category advertises, and
 * it is the whole point — everything on this screen is a price something
 * actually traded at.
 *
 * The simulation engine still exists, but only as a *failover*: if the exchange
 * connection dies, an instrument falls back to a generated walk and its badge
 * flips from "live" to "sim" so the change is visible rather than silent.
 *
 * Prices are quoted against USDT, which is the liquid quote asset on Binance
 * and tracks USD closely but is not identical to it.
 *
 * Generated from `GET /api/v3/exchangeInfo` — precision is each pair's real
 * tick size, not a guess.
 */
export const INSTRUMENTS: Instrument[] = [
  // --- Majors --------------------------------------------------------------
  {
    symbol: "BTCUSD",
    displayName: "Bitcoin / USD",
    short: "BTC",
    kind: "MAJOR",
    precision: 2,
    payoutBps: 8600,
    basePrice: 66202.53,
    volatility: 0.55,
    drift: 0,
    halfSpread: 0.02,
  },
  {
    symbol: "ETHUSD",
    displayName: "Ethereum / USD",
    short: "ETH",
    kind: "MAJOR",
    precision: 2,
    payoutBps: 8700,
    basePrice: 1947.96,
    volatility: 0.7,
    drift: 0,
    halfSpread: 0.02,
  },
  {
    symbol: "BNBUSD",
    displayName: "BNB / USD",
    short: "BNB",
    kind: "MAJOR",
    precision: 2,
    payoutBps: 8600,
    basePrice: 575.15,
    volatility: 0.6,
    drift: 0,
    halfSpread: 0.02,
  },
  {
    symbol: "SOLUSD",
    displayName: "Solana / USD",
    short: "SOL",
    kind: "MAJOR",
    precision: 2,
    payoutBps: 8800,
    basePrice: 78.57,
    volatility: 0.95,
    drift: 0,
    halfSpread: 0.02,
  },
  {
    symbol: "XRPUSD",
    displayName: "XRP / USD",
    short: "XRP",
    kind: "MAJOR",
    precision: 4,
    payoutBps: 8700,
    basePrice: 1.1518,
    volatility: 0.85,
    drift: 0,
    halfSpread: 0.0002,
  },

  // --- Layer 1 & infrastructure -------------------------------------------
  {
    symbol: "ADAUSD",
    displayName: "Cardano / USD",
    short: "ADA",
    kind: "LAYER1",
    precision: 4,
    payoutBps: 8800,
    basePrice: 0.1795,
    volatility: 0.9,
    drift: 0,
    halfSpread: 0.0002,
  },
  {
    symbol: "AVAXUSD",
    displayName: "Avalanche / USD",
    short: "AVAX",
    kind: "LAYER1",
    precision: 3,
    payoutBps: 8800,
    basePrice: 6.634,
    volatility: 0.95,
    drift: 0,
    halfSpread: 0.002,
  },
  {
    symbol: "DOTUSD",
    displayName: "Polkadot / USD",
    short: "DOT",
    kind: "LAYER1",
    precision: 3,
    payoutBps: 8800,
    basePrice: 0.852,
    volatility: 0.9,
    drift: 0,
    halfSpread: 0.002,
  },
  {
    symbol: "NEARUSD",
    displayName: "NEAR / USD",
    short: "NEAR",
    kind: "LAYER1",
    precision: 3,
    payoutBps: 8800,
    basePrice: 1.89,
    volatility: 1.0,
    drift: 0,
    halfSpread: 0.002,
  },
  {
    symbol: "ATOMUSD",
    displayName: "Cosmos / USD",
    short: "ATOM",
    kind: "LAYER1",
    precision: 3,
    payoutBps: 8800,
    basePrice: 1.47,
    volatility: 0.95,
    drift: 0,
    halfSpread: 0.002,
  },
  {
    symbol: "SUIUSD",
    displayName: "Sui / USD",
    short: "SUI",
    kind: "LAYER1",
    precision: 4,
    payoutBps: 8800,
    basePrice: 0.7757,
    volatility: 1.1,
    drift: 0,
    halfSpread: 0.0002,
  },
  {
    symbol: "TRXUSD",
    displayName: "TRON / USD",
    short: "TRX",
    kind: "LAYER1",
    precision: 4,
    payoutBps: 8700,
    basePrice: 0.3287,
    volatility: 0.65,
    drift: 0,
    halfSpread: 0.0002,
  },
  {
    symbol: "XLMUSD",
    displayName: "Stellar / USD",
    short: "XLM",
    kind: "LAYER1",
    precision: 4,
    payoutBps: 8700,
    basePrice: 0.1912,
    volatility: 0.85,
    drift: 0,
    halfSpread: 0.0002,
  },
  {
    symbol: "LTCUSD",
    displayName: "Litecoin / USD",
    short: "LTC",
    kind: "LAYER1",
    precision: 2,
    payoutBps: 8700,
    basePrice: 46.93,
    volatility: 0.75,
    drift: 0,
    halfSpread: 0.02,
  },
  {
    symbol: "BCHUSD",
    displayName: "Bitcoin Cash / USD",
    short: "BCH",
    kind: "LAYER1",
    precision: 1,
    payoutBps: 8700,
    basePrice: 221.1,
    volatility: 0.8,
    drift: 0,
    halfSpread: 0.2,
  },
  {
    symbol: "FILUSD",
    displayName: "Filecoin / USD",
    short: "FIL",
    kind: "LAYER1",
    precision: 4,
    payoutBps: 8800,
    basePrice: 0.7729,
    volatility: 1.0,
    drift: 0,
    halfSpread: 0.0002,
  },

  // --- DeFi & scaling ------------------------------------------------------
  {
    symbol: "LINKUSD",
    displayName: "Chainlink / USD",
    short: "LINK",
    kind: "DEFI",
    precision: 3,
    payoutBps: 8800,
    basePrice: 8.707,
    volatility: 0.9,
    drift: 0,
    halfSpread: 0.002,
  },
  {
    symbol: "UNIUSD",
    displayName: "Uniswap / USD",
    short: "UNI",
    kind: "DEFI",
    precision: 3,
    payoutBps: 8800,
    basePrice: 3.848,
    volatility: 0.95,
    drift: 0,
    halfSpread: 0.002,
  },
  {
    symbol: "AAVEUSD",
    displayName: "Aave / USD",
    short: "AAVE",
    kind: "DEFI",
    precision: 2,
    payoutBps: 8800,
    basePrice: 98.18,
    volatility: 0.95,
    drift: 0,
    halfSpread: 0.02,
  },
  {
    symbol: "INJUSD",
    displayName: "Injective / USD",
    short: "INJ",
    kind: "DEFI",
    precision: 3,
    payoutBps: 8900,
    basePrice: 5.247,
    volatility: 1.15,
    drift: 0,
    halfSpread: 0.002,
  },
  {
    symbol: "ARBUSD",
    displayName: "Arbitrum / USD",
    short: "ARB",
    kind: "DEFI",
    precision: 4,
    payoutBps: 8800,
    basePrice: 0.0916,
    volatility: 1.05,
    drift: 0,
    halfSpread: 0.0002,
  },
  {
    symbol: "OPUSD",
    displayName: "Optimism / USD",
    short: "OP",
    kind: "DEFI",
    precision: 4,
    payoutBps: 8800,
    basePrice: 0.0989,
    volatility: 1.05,
    drift: 0,
    halfSpread: 0.0002,
  },

  // --- Meme ----------------------------------------------------------------
  {
    symbol: "DOGEUSD",
    displayName: "Dogecoin / USD",
    short: "DOGE",
    kind: "MEME",
    precision: 5,
    payoutBps: 8800,
    basePrice: 0.0734,
    volatility: 1.1,
    drift: 0,
    halfSpread: 0.00002,
  },
  {
    symbol: "SHIBUSD",
    displayName: "Shiba Inu / USD",
    short: "SHIB",
    kind: "MEME",
    precision: 8,
    payoutBps: 8900,
    basePrice: 0.00000428,
    volatility: 1.2,
    drift: 0,
    halfSpread: 0.00000002,
  },
  {
    symbol: "PEPEUSD",
    displayName: "Pepe / USD",
    short: "PEPE",
    kind: "MEME",
    precision: 8,
    payoutBps: 9000,
    basePrice: 0.00000292,
    volatility: 1.4,
    drift: 0,
    halfSpread: 0.00000002,
  },
];

export const INSTRUMENT_BY_SYMBOL = new Map(
  INSTRUMENTS.map((i) => [i.symbol, i]),
);

export function instrument(symbol: string): Instrument {
  const found = INSTRUMENT_BY_SYMBOL.get(symbol);
  if (!found) throw new Error(`Unknown instrument: ${symbol}`);
  return found;
}

/** The symbol shown before a user has chosen one. */
export const DEFAULT_SYMBOL = "BTCUSD";

/**
 * Like `instrument`, but never throws.
 *
 * The selected symbol is persisted in the browser, so a returning user can
 * arrive holding a symbol that has since been delisted. Throwing there takes
 * down the whole terminal for someone whose only mistake was visiting before a
 * catalogue change; falling back to the default does not.
 */
export function instrumentOrDefault(symbol: string): Instrument {
  return INSTRUMENT_BY_SYMBOL.get(symbol) ?? instrument(DEFAULT_SYMBOL);
}

/** Contract durations offered in the trade panel. */
export const DURATIONS = [
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 120, label: "2m" },
  { seconds: 300, label: "5m" },
  { seconds: 900, label: "15m" },
] as const;

export const KIND_LABEL: Record<InstrumentKind, string> = {
  MAJOR: "Majors",
  LAYER1: "Layer 1 & infrastructure",
  DEFI: "DeFi & scaling",
  MEME: "Meme",
};

/** Watchlist group order. */
export const KIND_ORDER: InstrumentKind[] = ["MAJOR", "LAYER1", "DEFI", "MEME"];
