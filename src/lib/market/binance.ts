import type { MarketEngine } from "./engine";
import { INSTRUMENTS } from "./instruments";

/**
 * Live crypto prices from Binance's public API.
 *
 * No API key, no signup, no server-side proxy: the REST endpoints send
 * `Access-Control-Allow-Origin: *` so the browser can call them directly, and
 * the market-data WebSocket is unauthenticated. That is the entire reason this
 * provider was chosen over CoinGecko (REST-only, aggressively rate-limited on
 * the free tier) or anything requiring a key.
 *
 * ## Coverage
 *
 * Every instrument in the catalogue is quoted here — the catalogue was narrowed
 * to exactly what this feed can serve. Forex, metals and the synthetic indices
 * were removed rather than shipped on generated prices: if we cannot quote a
 * market honestly, we do not list it.
 *
 * ## Failure behaviour
 *
 * If the connection cannot be established, or drops and cannot be recovered,
 * the affected symbols fall back to the simulation rather than freezing on a
 * stale price. A frozen chart on a trading screen is worse than an honest
 * simulated one, because a customer cannot tell it has stopped.
 */

const REST = "https://api.binance.com/api/v3";
const WS = "wss://stream.binance.com:9443/stream";

/** Our symbol -> Binance's. USDT is the liquid quote asset, not USD. */
export const BINANCE_SYMBOLS: Record<string, string> = {
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
  BNBUSD: "BNBUSDT",
  SOLUSD: "SOLUSDT",
  XRPUSD: "XRPUSDT",
  ADAUSD: "ADAUSDT",
  AVAXUSD: "AVAXUSDT",
  DOTUSD: "DOTUSDT",
  NEARUSD: "NEARUSDT",
  ATOMUSD: "ATOMUSDT",
  SUIUSD: "SUIUSDT",
  TRXUSD: "TRXUSDT",
  XLMUSD: "XLMUSDT",
  LTCUSD: "LTCUSDT",
  BCHUSD: "BCHUSDT",
  FILUSD: "FILUSDT",
  LINKUSD: "LINKUSDT",
  UNIUSD: "UNIUSDT",
  AAVEUSD: "AAVEUSDT",
  INJUSD: "INJUSDT",
  ARBUSD: "ARBUSDT",
  OPUSD: "OPUSDT",
  DOGEUSD: "DOGEUSDT",
  SHIBUSD: "SHIBUSDT",
  PEPEUSD: "PEPEUSDT",
};

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 6;
/** No message at all for this long means the socket is dead but not closed. */
const STALL_TIMEOUT_MS = 45_000;

type Kline = [
  openTime: number,
  open: string,
  high: string,
  low: string,
  close: string,
  volume: string,
  closeTime: number,
  ...rest: unknown[],
];

export type FeedStatus = "connecting" | "live" | "reconnecting" | "failed";

/**
 * Replays a candle as four ticks so the aggregated candle has a real range.
 *
 * Seeding history from closes alone produces a series of bodyless candles — the
 * high and low of every bar collapse onto the close. Emitting open, then the
 * two extremes, then close reconstructs a faithful bar. The extremes are
 * ordered by which one the price plausibly reached first: from an up bar
 * (close > open) the low is usually touched before the high.
 */
function replayKline(
  engine: MarketEngine,
  symbol: string,
  kline: Kline,
  intervalMs: number,
): void {
  const openTime = kline[0];
  const open = Number(kline[1]);
  const high = Number(kline[2]);
  const low = Number(kline[3]);
  const close = Number(kline[4]);

  const bullish = close >= open;
  const first = bullish ? low : high;
  const second = bullish ? high : low;

  engine.ingest(symbol, open, openTime, false);
  engine.ingest(symbol, first, openTime + intervalMs * 0.3, false);
  engine.ingest(symbol, second, openTime + intervalMs * 0.6, false);
  engine.ingest(symbol, close, openTime + intervalMs - 1, false);
}

async function fetchKlines(
  binanceSymbol: string,
  interval: "1s" | "1m",
  limit: number,
  signal: AbortSignal,
): Promise<Kline[]> {
  const url = `${REST}/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Binance klines ${binanceSymbol} ${interval}: ${response.status}`);
  }
  return (await response.json()) as Kline[];
}

export class BinanceFeed {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly controller = new AbortController();
  private readonly toOurSymbol = new Map<string, string>();

  status: FeedStatus = "connecting";

  private readonly engine: MarketEngine;
  private readonly onStatus: (status: FeedStatus) => void;

  constructor(
    engine: MarketEngine,
    onStatus: (status: FeedStatus) => void = () => {},
  ) {
    this.engine = engine;
    this.onStatus = onStatus;
    for (const [ours, theirs] of Object.entries(BINANCE_SYMBOLS)) {
      this.toOurSymbol.set(theirs.toLowerCase(), ours);
    }
  }

  /** Symbols this feed can actually serve, filtered to active instruments. */
  private supported(): string[] {
    const active = new Set(INSTRUMENTS.map((i) => i.symbol));
    return Object.keys(BINANCE_SYMBOLS).filter((s) => active.has(s));
  }

  async start(): Promise<void> {
    const symbols = this.supported();
    if (symbols.length === 0) return;

    this.setStatus("connecting");

    // Hand the symbols over before any history lands, so the simulation loop
    // stops generating ticks for them immediately.
    for (const symbol of symbols) this.engine.goLive(symbol);

    try {
      await this.seedHistory(symbols);
    } catch (error) {
      // History is a nicety; the live stream is the product. Log and continue —
      // the chart fills in from live trades within seconds.
      console.warn("[binance] history seed failed:", error);
    }

    this.connect(symbols);
  }

  /**
   * Backfills the chart.
   *
   * Two passes per symbol, mirroring the simulator's warmup and for the same
   * reason: 1m bars for the long window and 1s bars for the recent one, so the
   * 5s and 15s charts have real shape rather than one sample per bar.
   *
   * Seeding must finish *before* the socket opens. `ingest` drops ticks that
   * arrive out of time order — that is what keeps `priceAt` binary-searchable —
   * so a historical bar landing after a live trade would be silently discarded
   * and the chart would start with a hole in it.
   *
   * Requests are run at limited concurrency. With 25 pairs the naive
   * `Promise.all` fires 50 requests at once; browsers queue those six-at-a-time
   * per host anyway, and firing them all makes it much easier to trip Binance's
   * per-IP weight limit for no gain in wall-clock time.
   */
  private async seedHistory(symbols: string[]): Promise<void> {
    const CONCURRENCY = 6;
    const queue = [...symbols];

    const worker = async () => {
      for (;;) {
        const symbol = queue.shift();
        if (!symbol) return;
        if (this.stopped) return;

        const binanceSymbol = BINANCE_SYMBOLS[symbol]!;
        try {
          const [minutes, seconds] = await Promise.all([
            fetchKlines(binanceSymbol, "1m", 720, this.controller.signal),
            fetchKlines(binanceSymbol, "1s", 600, this.controller.signal),
          ]);

          // Oldest first, and drop any 1m bar overlapping the 1s window so the
          // same period is not replayed at two resolutions.
          const firstSecond = seconds[0]?.[0] ?? Infinity;
          for (const kline of minutes) {
            if (kline[0] >= firstSecond) break;
            replayKline(this.engine, symbol, kline, 60_000);
          }
          for (const kline of seconds) {
            replayKline(this.engine, symbol, kline, 1_000);
          }
        } catch (error) {
          // One symbol failing to backfill must not deny the other 24 their
          // history, nor stop the live stream connecting.
          if (!this.controller.signal.aborted) {
            console.warn(`[binance] history failed for ${symbol}:`, error);
          }
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker),
    );
  }

  private connect(symbols: string[]): void {
    if (this.stopped) return;

    const streams = symbols
      .map((s) => `${BINANCE_SYMBOLS[s]!.toLowerCase()}@trade`)
      .join("/");

    let socket: WebSocket;
    try {
      socket = new WebSocket(`${WS}?streams=${streams}`);
    } catch (error) {
      console.warn("[binance] socket construction failed:", error);
      this.scheduleReconnect(symbols);
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.setStatus("live");
      this.armStallTimer(symbols);
    };

    socket.onmessage = (event) => {
      this.armStallTimer(symbols);
      try {
        const payload = JSON.parse(event.data as string) as {
          stream?: string;
          data?: { s?: string; p?: string; T?: number };
        };
        const trade = payload.data;
        if (!trade?.s || !trade.p || !trade.T) return;

        const ours = this.toOurSymbol.get(trade.s.toLowerCase());
        if (!ours) return;

        const price = Number(trade.p);
        if (!Number.isFinite(price) || price <= 0) return;

        this.engine.ingest(ours, price, trade.T);
      } catch {
        // A malformed frame is not worth tearing the connection down for.
      }
    };

    socket.onerror = () => {
      // `onclose` always follows; handle the retry there so it happens once.
    };

    socket.onclose = () => {
      if (this.stopped) return;
      this.setStatus("reconnecting");
      this.scheduleReconnect(symbols);
    };
  }

  /**
   * Exchange sockets sometimes stop delivering without closing. Without this,
   * the chart would sit on a stale price indefinitely and look merely quiet.
   */
  private armStallTimer(symbols: string[]): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => {
      console.warn("[binance] stream stalled; forcing reconnect");
      this.socket?.close();
      void symbols;
    }, STALL_TIMEOUT_MS);
  }

  private scheduleReconnect(symbols: string[]): void {
    if (this.stopped) return;

    if (this.attempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn("[binance] giving up; returning symbols to simulation");
      for (const symbol of symbols) this.engine.goSimulated(symbol);
      this.setStatus("failed");
      return;
    }

    // Exponential backoff with jitter, so a Binance blip does not produce a
    // synchronised retry storm from every open tab.
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.attempts,
      RECONNECT_MAX_MS,
    );
    const jittered = delay * (0.7 + Math.random() * 0.6);
    this.attempts += 1;

    this.reconnectTimer = setTimeout(() => this.connect(symbols), jittered);
  }

  private setStatus(status: FeedStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatus(status);
  }

  stop(): void {
    this.stopped = true;
    this.controller.abort();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.socket?.close();
    this.socket = null;
  }
}
