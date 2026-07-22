export type InstrumentKind = "SYNTHETIC" | "CRYPTO" | "FOREX" | "COMMODITY";

export interface Instrument {
  symbol: string;
  displayName: string;
  short: string;
  kind: InstrumentKind;
  precision: number;
  /** Payout on a win, in basis points of stake. 8500 = 85%. */
  payoutBps: number;
  basePrice: number;
  /** Annualised volatility. */
  volatility: number;
  drift: number;
  halfSpread: number;
  /**
   * True when the symbol names a real market whose price this is *not*.
   * The terminal badges these so nobody mistakes a simulation for a quote.
   */
  simulated: boolean;
}

/**
 * The instrument catalogue.
 *
 * Synthetic indices lead deliberately. A synthetic index has no underlying
 * market — its price *is* a published random process — so a generated feed is
 * the complete and honest implementation of one, not a placeholder.
 *
 * The crypto/FX/metals rows below name real markets. Their prices here are
 * simulated, so they carry `simulated: true` and the UI renders a badge against
 * them. These are the symbols that switch to live quotes when a market-data
 * provider is wired in.
 */
export const INSTRUMENTS: Instrument[] = [
  { symbol: "VOL10",  displayName: "Volatility 10 Index",  short: "V10",  kind: "SYNTHETIC", precision: 3, payoutBps: 8000, basePrice: 6543.21,  volatility: 0.30, drift: 0, halfSpread: 0.05,    simulated: false },
  { symbol: "VOL25",  displayName: "Volatility 25 Index",  short: "V25",  kind: "SYNTHETIC", precision: 3, payoutBps: 8300, basePrice: 3218.44,  volatility: 0.75, drift: 0, halfSpread: 0.04,    simulated: false },
  { symbol: "VOL50",  displayName: "Volatility 50 Index",  short: "V50",  kind: "SYNTHETIC", precision: 3, payoutBps: 8600, basePrice: 9427.43,  volatility: 1.50, drift: 0, halfSpread: 0.08,    simulated: false },
  { symbol: "VOL75",  displayName: "Volatility 75 Index",  short: "V75",  kind: "SYNTHETIC", precision: 2, payoutBps: 8900, basePrice: 128450.0, volatility: 2.25, drift: 0, halfSpread: 1.2,     simulated: false },
  { symbol: "VOL100", displayName: "Volatility 100 Index", short: "V100", kind: "SYNTHETIC", precision: 3, payoutBps: 9200, basePrice: 1456.78,  volatility: 3.00, drift: 0, halfSpread: 0.03,    simulated: false },

  { symbol: "BTCUSD", displayName: "Bitcoin / USD",  short: "BTC", kind: "CRYPTO",    precision: 2, payoutBps: 8500, basePrice: 96480.00, volatility: 0.55, drift: 0, halfSpread: 6.0,     simulated: true },
  { symbol: "ETHUSD", displayName: "Ethereum / USD", short: "ETH", kind: "CRYPTO",    precision: 2, payoutBps: 8500, basePrice: 3342.60,  volatility: 0.70, drift: 0, halfSpread: 0.45,    simulated: true },
  { symbol: "SOLUSD", displayName: "Solana / USD",   short: "SOL", kind: "CRYPTO",    precision: 3, payoutBps: 8700, basePrice: 189.240,  volatility: 0.95, drift: 0, halfSpread: 0.035,   simulated: true },
  { symbol: "XAUUSD", displayName: "Gold / USD",     short: "XAU", kind: "COMMODITY", precision: 2, payoutBps: 8200, basePrice: 2648.35,  volatility: 0.16, drift: 0, halfSpread: 0.22,    simulated: true },
  { symbol: "EURUSD", displayName: "Euro / USD",     short: "EUR", kind: "FOREX",     precision: 5, payoutBps: 8100, basePrice: 1.08540,  volatility: 0.08, drift: 0, halfSpread: 0.00006, simulated: true },
  { symbol: "GBPUSD", displayName: "Sterling / USD", short: "GBP", kind: "FOREX",     precision: 5, payoutBps: 8100, basePrice: 1.26480,  volatility: 0.09, drift: 0, halfSpread: 0.00007, simulated: true },
  { symbol: "USDJPY", displayName: "USD / Yen",      short: "JPY", kind: "FOREX",     precision: 3, payoutBps: 8100, basePrice: 157.220,  volatility: 0.10, drift: 0, halfSpread: 0.008,   simulated: true },
];

export const INSTRUMENT_BY_SYMBOL = new Map(
  INSTRUMENTS.map((i) => [i.symbol, i]),
);

export function instrument(symbol: string): Instrument {
  const found = INSTRUMENT_BY_SYMBOL.get(symbol);
  if (!found) throw new Error(`Unknown instrument: ${symbol}`);
  return found;
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
  SYNTHETIC: "Synthetics",
  CRYPTO: "Crypto",
  FOREX: "Forex",
  COMMODITY: "Metals",
};
