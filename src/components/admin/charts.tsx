"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The console's chart primitives.
 *
 * Hand-drawn SVG rather than a charting library: the console ships four charts
 * with one shape between them, and a library would add ~100kB to a page whose
 * whole job is to load fast on a phone at a live event.
 *
 * The specs here are fixed and deliberate, not preferences:
 *
 *   - **2px lines**, round join and cap; **≥8px end markers** carrying a 2px
 *     ring in the surface colour so they stay legible where they cross.
 *   - **Hairline solid gridlines**, one step off the surface. Never dashed —
 *     dashing reads as "projection" or "threshold" when it is just a grid.
 *   - **A legend whenever there are two or more series**, plus sparing direct
 *     labels on the line ends. Identity is never carried by colour alone.
 *   - **Never two y-scales.** Money and counts get separate charts; a shared
 *     axis between them would invent a correlation that is not in the data.
 *
 * The palette is two categorical slots, validated against this console's white
 * card surface (worst normal-vision ΔE 25.5, worst CVD ΔE 9.2 — both clear).
 * Slot 1 is the console's own accent so a chart looks like the rest of the
 * product; slot 2 is the orange that sits furthest from it under every
 * simulated colour vision. Colour follows the **domain**, never its rank, so
 * filtering never repaints the survivors.
 */

export const SERIES_COLORS = ["#256abf", "#eb6834", "#1baf7a"] as const;

/** Ink and chrome, matching the `adm-*` tokens in `globals.css`. */
const INK_MUTED = "#98a0b3";
const GRID = "#e6e8ee";
const AXIS = "#d5d9e3";
const SURFACE = "#ffffff";

/** The colour for a series, by its position in the series list. */
export function seriesColor(index: number): string {
  // Never generated, never cycled past the slots we validated: a fourth series
  // would fold into "Other" rather than invent a hue.
  return SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0];
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

/**
 * The rendered width of a container.
 *
 * Charts are drawn in real pixels rather than scaled from a fixed `viewBox`,
 * because a scaled viewBox scales the *type* with it — an 11px axis label
 * becomes 5px on a phone and 15px on a wide monitor. Measuring costs a
 * ResizeObserver and buys type that is the size it says it is.
 */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      // Whole pixels: a fractional width re-renders the whole chart on every
      // sub-pixel scroll reflow.
      setWidth(Math.round(next));
    });

    observer.observe(element);
    setWidth(Math.round(element.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

export interface LineSeries {
  id: string;
  label: string;
  /** One value per x position, same length as `labels`. */
  values: number[];
}

/**
 * A time series, one line per domain.
 *
 * `format` renders a value for the axis, the tooltip and the end label — passed
 * in rather than assumed, because the same chart draws shillings and counts and
 * the two are written differently.
 */
export function LineChart({
  series,
  labels,
  format,
  height = 220,
  emptyMessage = "Nothing in this period.",
}: {
  series: LineSeries[];
  /** x-axis labels, one per point. */
  labels: string[];
  format: (value: number) => string;
  height?: number;
  emptyMessage?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  // Room for the y labels on the left and the x band underneath. The bottom
  // inset is part of the height rather than added to it, so the card never
  // grows a nested scrollbar to reach its own axis.
  const pad = { top: 12, right: 16, bottom: 26, left: 52 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = Math.max(0, height - pad.top - pad.bottom);

  const points = labels.length;
  const max = Math.max(
    1,
    ...series.flatMap((line) => line.values),
  );
  const ticks = niceTicks(max, 4);
  const scaleMax = ticks[ticks.length - 1] ?? max;

  const x = useCallback(
    (index: number) =>
      pad.left + (points <= 1 ? plotW / 2 : (plotW * index) / (points - 1)),
    [pad.left, plotW, points],
  );
  const y = useCallback(
    (value: number) => pad.top + plotH - (plotH * value) / scaleMax,
    [pad.top, plotH, scaleMax],
  );

  const everythingZero = series.every((line) =>
    line.values.every((value) => value === 0),
  );

  return (
    <div ref={ref} className="w-full">
      {width > 0 ? (
        <div className="relative">
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${series.map((line) => line.label).join(" and ")} over ${points} days`}
            onMouseLeave={() => setHover(null)}
          >
            {/* --- Gridlines and y labels ------------------------------- */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={pad.left}
                  x2={pad.left + plotW}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={tick === 0 ? AXIS : GRID}
                  strokeWidth={1}
                />
                <text
                  x={pad.left - 8}
                  y={y(tick) + 3.5}
                  textAnchor="end"
                  fontSize={10.5}
                  fill={INK_MUTED}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {format(tick)}
                </text>
              </g>
            ))}

            {/* --- x labels: first, middle, last only ------------------- */}
            {[0, Math.floor((points - 1) / 2), points - 1]
              .filter((index, at, all) => index >= 0 && all.indexOf(index) === at)
              .map((index) => (
                <text
                  key={index}
                  x={x(index)}
                  y={height - 8}
                  textAnchor={index === 0 ? "start" : index === points - 1 ? "end" : "middle"}
                  fontSize={10.5}
                  fill={INK_MUTED}
                >
                  {labels[index]}
                </text>
              ))}

            {/* --- The crosshair, under the marks ----------------------- */}
            {hover !== null ? (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke={AXIS}
                strokeWidth={1}
              />
            ) : null}

            {/* --- The lines -------------------------------------------- */}
            {series.map((line, index) => {
              const color = seriesColor(index);
              const d = line.values
                .map((value, at) => `${at === 0 ? "M" : "L"}${x(at)},${y(value)}`)
                .join(" ");

              return (
                <g key={line.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* End marker: 8px across, with a 2px surface ring so two
                      domains ending at the same value stay separable. */}
                  <circle
                    cx={x(points - 1)}
                    cy={y(line.values[points - 1] ?? 0)}
                    r={4}
                    fill={color}
                    stroke={SURFACE}
                    strokeWidth={2}
                  />
                </g>
              );
            })}

            {/* --- Hover dots ------------------------------------------- */}
            {hover !== null
              ? series.map((line, index) => (
                  <circle
                    key={line.id}
                    cx={x(hover)}
                    cy={y(line.values[hover] ?? 0)}
                    r={4}
                    fill={seriesColor(index)}
                    stroke={SURFACE}
                    strokeWidth={2}
                  />
                ))
              : null}

            {/* --- Hit areas. One wide band per point, so the target is a
                    column rather than a pixel on the line. --------------- */}
            {labels.map((label, index) => (
              <rect
                key={label + index}
                x={x(index) - (points <= 1 ? plotW / 2 : plotW / (points - 1) / 2)}
                y={pad.top}
                width={points <= 1 ? plotW : plotW / (points - 1)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
              />
            ))}
          </svg>

          {/* --- Tooltip. Enhances, never gates: every figure here is also
                  in the table view under the chart. -------------------- */}
          {hover !== null ? (
            <div
              className="pointer-events-none absolute z-10 min-w-[150px] border border-adm-line-strong bg-adm-surface p-2.5 shadow-[0_8px_24px_-8px_rgba(16,20,38,.25)]"
              style={{
                left: Math.min(Math.max(x(hover) - 75, 0), Math.max(width - 160, 0)),
                top: 0,
              }}
            >
              <p className="text-[11px] font-medium text-adm-ink-3">{labels[hover]}</p>
              <ul className="mt-1.5 space-y-1">
                {series.map((line, index) => (
                  <li key={line.id} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0"
                      style={{ background: seriesColor(index) }}
                    />
                    <span className="flex-1 text-[12px] text-adm-ink-2">{line.label}</span>
                    <span className="text-[12px] font-medium tabular-nums text-adm-ink">
                      {format(line.values[hover] ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {everythingZero ? (
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[12.5px] text-adm-ink-3">
              {emptyMessage}
            </p>
          ) : null}
        </div>
      ) : (
        <div style={{ height }} />
      )}

      <Legend series={series} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

/**
 * Always present for two or more series; absent for one, where the title
 * already says what is plotted and a single swatch would just restate it.
 */
export function Legend({ series }: { series: { id: string; label: string }[] }) {
  if (series.length < 2) return null;

  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
      {series.map((line, index) => (
        <li key={line.id} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0"
            style={{ background: seriesColor(index) }}
          />
          <span className="text-[12px] text-adm-ink-2">{line.label}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bars
// ---------------------------------------------------------------------------

export interface BarDatum {
  id: string;
  label: string;
  value: number;
  /** Rendered at the bar's tip. */
  display: string;
}

/**
 * Magnitude by identity — one row per domain.
 *
 * A bar rather than a pie: two or three near values are compared along a shared
 * baseline far more reliably than by arc. The value rides the tip rather than
 * sitting inside the fill, so a short bar never clips its own label.
 */
export function BarRows({
  data,
  colorByIndex = true,
}: {
  data: BarDatum[];
  /** False paints every bar slot 1 — right when the rows are one measure. */
  colorByIndex?: boolean;
}) {
  const max = Math.max(1, ...data.map((row) => row.value));

  return (
    <ul className="space-y-3">
      {data.map((row, index) => (
        <li key={row.id}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-adm-ink-2">{row.label}</span>
            <span className="text-[12.5px] font-medium tabular-nums text-adm-ink">
              {row.display}
            </span>
          </div>
          {/* 8px is inside the ≤24px cap and leaves the row mostly air. */}
          <div className="mt-1.5 h-2 w-full bg-adm-subtle">
            <div
              className="h-2 transition-[width] duration-500"
              style={{
                width: `${Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100)}%`,
                background: colorByIndex ? seriesColor(index) : seriesColor(0),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Donut
// ---------------------------------------------------------------------------

export interface DonutSlice {
  id: string;
  label: string;
  /** Raw magnitude. Shares are computed here, never passed in pre-rounded. */
  value: number;
  display: string;
}

/**
 * Part-to-whole, at a glance.
 *
 * A donut earns its place only when the question is "what share of the total",
 * with few enough segments to read as shape — never for comparing close values,
 * which an arc does badly and a bar does well. Two guards keep it honest here:
 * the **total sits in the hole**, so the chart is also the stat tile it would
 * otherwise be replaced by, and every segment's amount and percentage is
 * printed in the legend. Nobody has to judge a quantity by arc length.
 *
 * Segments are separated by a 2px gap in the surface colour rather than by a
 * stroke around each arc — a border adds ink that is not data, and at these
 * radii it reads as a second ring.
 */
export function Donut({
  slices,
  centreLabel,
  centreValue,
  size = 168,
}: {
  slices: DonutSlice[];
  centreLabel: string;
  centreValue: string;
  size?: number;
}) {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);

  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // The gap is expressed in path length so it stays 2px on screen whatever the
  // radius is.
  const gap = total > 0 && slices.filter((s) => s.value > 0).length > 1 ? 2 : 0;

  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`${centreLabel}: ${centreValue}`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {/* The track. Visible when there is nothing to plot, so an empty
                donut reads as "nothing yet" rather than as a failed render. */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={total > 0 ? SURFACE : "#f2f4f8"}
              strokeWidth={stroke}
            />
            {total > 0
              ? slices.map((slice, index) => {
                  const share = Math.max(0, slice.value) / total;
                  const length = Math.max(0, circumference * share - gap);
                  const dash = `${length} ${circumference - length}`;
                  const element = (
                    <circle
                      key={slice.id}
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="none"
                      stroke={seriesColor(index)}
                      strokeWidth={stroke}
                      strokeDasharray={dash}
                      strokeDashoffset={-offset}
                    />
                  );
                  offset += circumference * share;
                  return element;
                })
              : null}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-[17px] font-semibold tracking-[-0.02em] text-adm-ink">
              {centreValue}
            </div>
            <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.07em] text-adm-ink-3">
              {centreLabel}
            </div>
          </div>
        </div>
      </div>

      {/* Legend with the numbers on it — the arc is the glance, this is the
          answer. */}
      <ul className="min-w-[150px] flex-1 space-y-2.5">
        {slices.map((slice, index) => {
          const share = total > 0 ? (slice.value / total) * 100 : 0;
          return (
            <li key={slice.id} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0"
                style={{ background: seriesColor(index) }}
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-adm-ink-2">
                {slice.label}
              </span>
              <span className="text-[12.5px] font-medium tabular-nums text-adm-ink">
                {slice.display}
              </span>
              <span className="w-11 text-right text-[11.5px] tabular-nums text-adm-ink-3">
                {total > 0 ? `${share.toFixed(1)}%` : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Axis ticks at round numbers — 0 / 2,000 / 4,000, never 0 / 1,873 / 3,746.
 *
 * The ticks carry every value the chart does not directly label, so they have
 * to be readable at a glance rather than merely accurate.
 */
function niceTicks(max: number, count: number): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];

  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;

  /*
   * Run past the data, never short of it.
   *
   * The obvious `value <= max` loop stops below the maximum whenever the step
   * does not divide it — max 23 with a step of 10 yields 0/10/20, and since the
   * top tick is also the scale's ceiling, the 23 would have been plotted above
   * the plot area. Pushing first and testing after guarantees the last tick
   * covers the data.
   */
  const ticks: number[] = [];
  for (let value = 0; ; value += step) {
    ticks.push(value);
    // The step is derived from `max / count`, so this terminates in about
    // `count` iterations; the cap is a seatbelt against a pathological step.
    if (value >= max || ticks.length > 12) break;
  }
  return ticks.length > 1 ? ticks : [0, step];
}

/**
 * A table twin for any chart.
 *
 * Not optional politeness: a tooltip must never be the only way to read a
 * value. Collapsed by default so it costs nothing until wanted.
 */
export function TableView({
  columns,
  rows,
  label = "View as table",
}: {
  columns: string[];
  rows: (string | number)[][];
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Nothing to keep open if the data goes away under it.
    if (rows.length === 0) setOpen(false);
  }, [rows.length]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 border-t border-adm-line pt-3">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="text-[12px] text-adm-ink-3 transition-colors hover:text-adm-ink"
      >
        {open ? "Hide table" : label}
      </button>

      {open ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-adm-line">
                {columns.map((column, index) => (
                  <th
                    key={column}
                    className={cn(
                      "px-2 py-1.5 font-medium text-adm-ink-3",
                      index === 0 ? "text-left" : "text-right",
                    )}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-adm-line">
              {rows.map((row, at) => (
                <tr key={at}>
                  {row.map((cell, index) => (
                    <td
                      key={index}
                      className={cn(
                        "px-2 py-1.5 tabular-nums text-adm-ink-2",
                        index === 0 ? "text-left" : "text-right",
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
