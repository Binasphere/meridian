"use client";

import { useMemo } from "react";

/**
 * A sparkline.
 *
 * No axes, no labels, no tooltip — deliberately. A sparkline's job is shape,
 * not value: it says "trending up, recently choppy" beside a number that
 * carries the precision. Anything more turns a 60×20 glyph into a chart that is
 * too small to read.
 */
export function Sparkline({
  points,
  tone,
  width = 64,
  height = 22,
}: {
  points: number[];
  tone: "up" | "down" | "flat";
  width?: number;
  height?: number;
}) {
  const path = useMemo(() => {
    if (points.length < 2) return null;

    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;

    // Inset by a pixel so the stroke is not clipped at the extremes.
    const pad = 1.5;
    const w = width - pad * 2;
    const h = height - pad * 2;

    return points
      .map((value, i) => {
        const x = pad + (i / (points.length - 1)) * w;
        const y = pad + h - ((value - min) / span) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [points, width, height]);

  if (!path) {
    return <div style={{ width, height }} aria-hidden />;
  }

  const stroke =
    tone === "up"
      ? "var(--color-up)"
      : tone === "down"
        ? "var(--color-down)"
        : "var(--color-ink-faint)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
      className="overflow-visible"
    >
      <path
        d={path}
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
    </svg>
  );
}
