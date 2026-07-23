"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import { market, type Candle, type Resolution } from "@/lib/market/engine";
import type { Trade } from "@/lib/trading";
import type { ChartStyle } from "@/lib/store";

/**
 * The price chart.
 *
 * Wraps lightweight-charts imperatively and keeps it *out* of React's render
 * path: the series is mutated with `update()` on each tick rather than
 * re-rendered, because pushing 4 setState calls a second through a component
 * tree to redraw a canvas is how a terminal ends up dropping frames.
 *
 * Colours are read from the stylesheet rather than hardcoded, so the chart
 * inherits the validated palette — including the colour-blind swap — instead of
 * quietly keeping its own copy of it.
 */

/**
 * A discriminated handle over the two series types.
 *
 * `ISeriesApi<"Candlestick">` and `ISeriesApi<"Area">` accept different point
 * shapes, and a bare union of them cannot be narrowed at the call site — which
 * is what tempts you into casting to `any` and losing the only type safety that
 * matters here. Tagging the series at creation keeps `setData`/`update` fully
 * checked.
 */
type SeriesHandle =
  | { kind: "candles"; api: ISeriesApi<"Candlestick"> }
  | { kind: "area"; api: ISeriesApi<"Area"> };

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function PriceChart({
  symbol,
  resolution,
  style,
  precision,
  openTrades,
}: {
  symbol: string;
  resolution: Resolution;
  style: ChartStyle;
  precision: number;
  openTrades: Trade[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<SeriesHandle | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());

  // Build (and rebuild) the chart. Style and precision changes require a new
  // series, so they are dependencies; symbol and resolution only need new data.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The area series line keeps the measured "up" hue; candles get their own
    // louder palette (see --color-candle-* in globals.css). The "down" hue is
    // used only by the position entry lines, in the effect further below.
    const up = cssVar("--color-up", "#1FD8A4");
    const candleUp = cssVar("--color-candle-up", "#00E676");
    const candleDown = cssVar("--color-candle-down", "#FF1744");
    const ink = cssVar("--color-ink-secondary", "#9BA6B7");
    const muted = cssVar("--color-ink-faint", "#4A5364");

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: ink,
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        // Recessive grid: present enough to read a value against, quiet enough
        // that the price line is what the eye lands on.
        vertLines: { color: "rgba(255,255,255,0.035)" },
        horzLines: { color: "rgba(255,255,255,0.035)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.07)",
        scaleMargins: { top: 0.12, bottom: 0.12 },
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.07)",
        timeVisible: true,
        // Sub-minute intervals need the seconds field; at 1m and above every
        // label would just read ":00".
        secondsVisible: resolution < 60,
        rightOffset: 8,
        // Wide bars, held wide regardless of interval. At 8px the bodies were
        // hairlines and the wicks were indistinguishable from the grid; 14px
        // gives a candle an actual body to read an open/close off, which is the
        // entire point of the form. Shortening the interval must not quietly
        // shrink them again — `minBarSpacing` is the floor that prevents it.
        barSpacing: 14,
        minBarSpacing: 8,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: muted,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: cssVar("--color-surface-4", "#232C3D"),
        },
        horzLine: {
          color: muted,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: cssVar("--color-surface-4", "#232C3D"),
        },
      },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
      localization: {
        priceFormatter: (price: number) => price.toFixed(precision),
      },
    });

    // One decimal finer than the instrument quotes, matching how the engine
    // stores mid prices. With `minMove` at the instrument's own tick size the
    // renderer snaps half-tick wicks away and short bars flatten out.
    const priceFormat = {
      type: "price" as const,
      precision: precision + 1,
      minMove: 1 / 10 ** (precision + 1),
    };

    const handle: SeriesHandle =
      style === "candles"
        ? {
            kind: "candles",
            api: chart.addCandlestickSeries({
              upColor: candleUp,
              downColor: candleDown,
              borderUpColor: candleUp,
              borderDownColor: candleDown,
              wickUpColor: candleUp,
              wickDownColor: candleDown,
              priceFormat,
            }),
          }
        : {
            kind: "area",
            api: chart.addAreaSeries({
              lineColor: up,
              topColor: `${up}38`,
              bottomColor: `${up}00`,
              lineWidth: 2,
              priceFormat,
            }),
          };

    chartRef.current = chart;
    seriesRef.current = handle;

    // Captured now: by the time cleanup runs the ref may already point at the
    // next chart's map, and clearing that one would drop live price lines.
    const priceLines = priceLinesRef.current;

    return () => {
      priceLines.clear();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [style, precision, resolution]);

  // Load history and stream updates.
  useEffect(() => {
    const handle = seriesRef.current;
    const chart = chartRef.current;
    if (!handle || !chart) return;

    const engine = market();

    const load = (candles: Candle[]) => {
      if (handle.kind === "candles") {
        handle.api.setData(
          candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })),
        );
      } else {
        handle.api.setData(
          candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })),
        );
      }
    };

    const push = (candle: Candle) => {
      if (handle.kind === "candles") {
        handle.api.update({ ...candle, time: candle.time as UTCTimestamp });
      } else {
        handle.api.update({
          time: candle.time as UTCTimestamp,
          value: candle.close,
        });
      }
    };

    // Time of the most recent bar handed to the chart. lightweight-charts'
    // `update()` can only revise the last bar or append the single next one, so
    // it is only safe while we stay within one bucket of what it already holds.
    let lastTime = 0;
    let previous = "";

    /**
     * Full reload: replace the series and snap to the live edge.
     *
     * Used on mount and whenever the incremental stream can no longer be
     * trusted to be contiguous — a backgrounded tab throttles this timer and
     * suspends the price socket, so on return the engine has rolled forward
     * many bars at once. Appending only the newest via `update()` would leave a
     * hole (or a lone future bar), which reads exactly as "the chart froze then
     * jumped". Reloading the whole window is cheap and always correct.
     */
    const resync = () => {
      // Show a fixed number of bars rather than fitting all 500 into the width —
      // fitContent() would shrink them back to the hairlines the wide barSpacing
      // above exists to avoid.
      const history = engine.candles(symbol, resolution, 500);
      load(history);
      chart.timeScale().scrollToRealTime();
      const newest = history[history.length - 1];
      lastTime = newest ? newest.time : 0;
      previous = "";
    };

    resync();

    /**
     * Redraw on a steady beat rather than on tick arrival.
     *
     * Driving the redraw from the tick subscription couples the chart's sense
     * of time to how busy the market is: a quiet instrument stops repainting,
     * so the newest bar sits frozen and then lurches when a quote finally
     * lands. Polling the latest bar at a fixed cadence means the engine's
     * carry-forward bars appear on schedule and the chart advances at the same
     * rate whether the market is frantic or asleep.
     *
     * `series.update` with unchanged data is a no-op inside lightweight-charts,
     * so idle instruments cost nothing.
     */
    const timer = setInterval(() => {
      const latest = engine.candles(symbol, resolution, 2);
      const point = latest[latest.length - 1];
      if (!point) return;

      // A jump of more than one bucket means bars were created while we were not
      // painting (throttled or hidden tab). `update()` cannot fill that gap —
      // reload the whole series instead of tearing a hole into the chart.
      if (lastTime && point.time > lastTime + resolution) {
        resync();
        return;
      }

      // Skip the call entirely when nothing about the bar has changed.
      const signature = `${point.time}:${point.open}:${point.high}:${point.low}:${point.close}`;
      if (signature === previous) return;
      previous = signature;

      push(point);
      lastTime = point.time;
    }, 250);

    // Browsers throttle timers and suspend socket delivery for hidden tabs, so
    // the chart drifts out of sync while backgrounded. Re-sync the instant it
    // becomes visible again rather than waiting for the poll to notice the gap.
    const onVisible = () => {
      if (document.visibilityState === "visible") resync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [symbol, resolution, style]);

  // Entry-price lines for live positions on this instrument. Reconciled against
  // the existing set rather than cleared and rebuilt, so a line does not blink
  // out and back on every render.
  useEffect(() => {
    const handle = seriesRef.current;
    if (!handle) return;

    const series = handle.api;
    const lines = priceLinesRef.current;
    const up = cssVar("--color-up", "#1FD8A4");
    const down = cssVar("--color-down", "#FF4757");

    const relevant = openTrades.filter((t) => t.symbol === symbol);
    const wanted = new Set(relevant.map((t) => t.id));

    for (const [id, line] of lines) {
      if (!wanted.has(id)) {
        series.removePriceLine(line);
        lines.delete(id);
      }
    }

    for (const trade of relevant) {
      if (lines.has(trade.id)) continue;
      lines.set(
        trade.id,
        series.createPriceLine({
          price: trade.openPrice,
          color: trade.direction === "UP" ? up : down,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          // The glyph is the point: direction is legible here without relying
          // on the colour of the line.
          title: trade.direction === "UP" ? "▲ entry" : "▼ entry",
        }),
      );
    }
  }, [openTrades, symbol]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
